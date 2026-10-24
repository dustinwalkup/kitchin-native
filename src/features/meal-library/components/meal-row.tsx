import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import type { Meal, Tag } from '../domain';
import { TagPill } from './tag-pill';

export interface MealRowProps {
  meal: Meal;
  tagsById: ReadonlyMap<string, Tag>;
  /** What a tap does, for VoiceOver: "Edits this meal" in the library, "Chooses this meal" in the picker. */
  hint: string;
  // The screen's handler, passed down unchanged so the memoised rows stay put (N25).
  onPress: (meal: Meal) => void;
}

/** What VoiceOver reads for a meal: "Tacos. Tags: Dinner, Quick & Easy", or "Tacos" (N27). */
export function mealLabel(name: string, tagNames: string[]): string {
  return tagNames.length === 0 ? name : `${name}. Tags: ${tagNames.join(', ')}`;
}

/**
 * A meal as a white card: its name, then its tags in alphabetical order as pills (R40.3, R40.4).
 * Neither has a line limit, so a long name wraps and the pills continue on the next line (R40.5).
 */
export const MealRow = memo(function MealRow({ meal, tagsById, hint, onPress }: MealRowProps) {
  const theme = useTheme();
  // `meal.tagIds` is already in tag order, and names only tags this load has (design §3.2).
  const tags = meal.tagIds.flatMap((id) => tagsById.get(id) ?? []);

  return (
    <Pressable
      // The meal's ID, never its name (R26.7).
      testID={`meal-row-${meal.id}`}
      accessibilityRole="button"
      accessibilityLabel={mealLabel(
        meal.name,
        tags.map((tag) => tag.name),
      )}
      accessibilityHint={hint}
      onPress={() => onPress(meal)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.screen : theme.background,
          borderColor: theme.tertiary,
          borderRadius: theme.radius.card,
        },
      ]}
    >
      <Text variant="headline">{meal.name}</Text>
      {tags.length === 0 ? null : (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <TagPill key={tag.id} name={tag.name} />
          ))}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { minHeight: 44, gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
