import { SymbolView } from 'expo-symbols';
import { memo, useRef } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import type { Meal, Tag } from '../domain';
import { TagPill } from './tag-pill';

export interface MealRowProps {
  meal: Meal;
  tagsById: ReadonlyMap<string, Tag>;
  /** What a tap does, for VoiceOver: "Edits this meal" in the library, "Chooses this meal" in the picker. */
  hint: string;
  // The screen's handlers, passed down unchanged so the memoised rows stay put (N25).
  onPress: (meal: Meal) => void;
  /**
   * Swiping left reveals Delete, which VoiceOver reaches as the row's Delete action (R44.8). The
   * library only: the picker never deletes (R45.10).
   */
  onDelete?: (meal: Meal) => void;
  /** A chevron at the end, for a row that opens the meal (R40.7). */
  disclosure?: boolean;
}

/** What VoiceOver reads for a meal: "Tacos. Tags: Dinner, Quick & Easy", or "Tacos" (N27). */
export function mealLabel(name: string, tagNames: string[]): string {
  return tagNames.length === 0 ? name : `${name}. Tags: ${tagNames.join(', ')}`;
}

// VoiceOver reaches Delete through this, as the row is one element (N10).
const DELETE_ACTION = [{ name: 'delete', label: 'Delete' }];

/**
 * A meal as a white card: its name, then its tags in alphabetical order as pills (R40.3, R40.4).
 * Neither has a line limit, so a long name wraps and the pills continue on the next line (R40.5).
 */
export const MealRow = memo(function MealRow({
  meal,
  tagsById,
  hint,
  onPress,
  onDelete,
  disclosure = false,
}: MealRowProps) {
  const theme = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  // `meal.tagIds` is already in tag order, and names only tags this load has (design §3.2).
  const tags = meal.tagIds.flatMap((id) => tagsById.get(id) ?? []);
  const card = [styles.card, { borderColor: theme.tertiary, borderRadius: theme.radius.card }];

  const deletable = onDelete !== undefined;

  // The row slides back first, so a cancelled confirmation leaves it closed (R44.2).
  const remove = () => {
    swipeable.current?.close();
    onDelete?.(meal);
  };

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'delete') remove();
  };

  const row = (
    <Pressable
      // The meal's ID, never its name (R26.7).
      testID={`meal-row-${meal.id}`}
      accessibilityRole="button"
      accessibilityLabel={mealLabel(
        meal.name,
        tags.map((tag) => tag.name),
      )}
      accessibilityHint={hint}
      accessibilityActions={deletable ? DELETE_ACTION : undefined}
      onAccessibilityAction={deletable ? onAccessibilityAction : undefined}
      onPress={() => onPress(meal)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.screen : theme.background },
        // A swipeable row's edge is on its container, which clips the row as it slides.
        !deletable && card,
      ]}
    >
      <View style={styles.body}>
        <Text variant="headline">{meal.name}</Text>
        {tags.length === 0 ? null : (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <TagPill key={tag.id} name={tag.name} />
            ))}
          </View>
        )}
      </View>
      {disclosure ? (
        <SymbolView
          name="chevron.right"
          weight="semibold"
          tintColor={theme.inkMuted}
          size={13}
          style={styles.chevron}
        />
      ) : null}
    </Pressable>
  );

  if (!deletable) return row;

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      containerStyle={card}
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={() => <DeleteAction mealId={meal.id} onPress={remove} />}
    >
      {row}
    </ReanimatedSwipeable>
  );
});

/** Revealed by swiping left. VoiceOver uses the row's Delete action instead (N10). */
function DeleteAction({ mealId, onPress }: { mealId: string; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      // Not `meal-row-…`, which names the rows themselves.
      testID={`meal-delete-${mealId}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={onPress}
      style={[styles.delete, { backgroundColor: theme.destructive }]}
    >
      <Text variant="subhead" color="onBrand">
        Delete
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  body: { flex: 1, gap: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chevron: { width: 13, height: 13 },
  delete: { width: 88, alignItems: 'center', justifyContent: 'center' },
});
