import { SymbolView } from 'expo-symbols';
import {
  type AccessibilityActionEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { weekday } from '@/lib/calendar';
import { Text } from '@/ui/text';
import { Thumbnail } from '@/ui/thumbnail';
import { useTheme } from '@/ui/use-theme';

import { COPY, DAY_KEYS, MEAL_TYPES, type MealType } from '../constants';
import type { Slot } from '../domain';
import { MealTypeIcon } from './meal-type-icon';

/** A planned meal's photo: a signed URL, if it has one, and the key that caches it. */
export interface SlotPhoto {
  uri?: string;
  cacheKey: string;
}

export interface SlotRowProps {
  slot: Slot;
  /** The day's full name, such as "Thursday", for VoiceOver. */
  weekdayName: string;
  /** The photo of the library meal the slot's text came from, if that meal has one. */
  photo?: SlotPhoto;
  // The screen's handlers, passed down unchanged so the memoised day cards stay put (§3.3.6).
  onEdit: (slot: Slot) => void;
  onClear: (slot: Slot) => void;
}

/** "Thursday dinner": the slot's name for VoiceOver, and the plan sheet's (N10, §3.4). */
export function slotName(weekdayName: string, mealType: MealType): string {
  const { label } = MEAL_TYPES.find((t) => t.key === mealType)!;
  return `${weekdayName} ${label.toLowerCase()}`;
}

/** What VoiceOver reads for a slot: "Thursday dinner: Tacos", or "Thursday dinner, not planned". */
export function slotLabel(weekdayName: string, { mealType, entry }: Slot): string {
  const name = slotName(weekdayName, mealType);
  return entry ? `${name}: ${entry.body}` : `${name}, not planned`;
}

/** A planned meal's first line, its name, and the rest, such as a description copied with it. */
export function splitBody(body: string): { title: string; detail: string | null } {
  const [title, ...rest] = body.split('\n');
  const detail = rest.join('\n').trim();
  return { title, detail: detail === '' ? null : detail };
}

/** Wide enough for "Breakfast" at the default text size. */
const LABEL_WIDTH = 78;

// Only a planned slot has something to clear (R33.2).
const CLEAR_ACTION = [{ name: 'clear', label: 'Clear' }];

/**
 * One meal of the day as a compact row (R30.3, R30.4, specs/redesign/design.md §5.1): the type's
 * icon and a muted label, then the planned meal, which carries the weight. Dinner's name is
 * semibold, so a week's dinners stand out down the screen. An empty slot is quieter still: "Add
 * dinner" in muted text, with a plus. Tapping the row opens the plan sheet (R32.1 as redesigned).
 * The text has no line limit, so a long meal wraps (R30.3).
 */
export function SlotRow({ slot, weekdayName, photo, onEdit, onClear }: SlotRowProps) {
  const theme = useTheme();
  // The label column grows with the text size, up to the 2× that Text allows (N12).
  const { fontScale } = useWindowDimensions();
  const { mealType, entry } = slot;
  const { label } = MEAL_TYPES.find((t) => t.key === mealType)!;
  const body = entry ? splitBody(entry.body) : null;

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'clear') onClear(slot);
  };

  return (
    <Pressable
      // Static parts only, never meal text (R26.7).
      testID={`slot-${DAY_KEYS[weekday(slot.date)]}-${mealType}`}
      accessibilityRole="button"
      accessibilityLabel={slotLabel(weekdayName, slot)}
      accessibilityHint={entry ? 'Changes this meal' : 'Plans this meal'}
      accessibilityActions={entry ? CLEAR_ACTION : undefined}
      onAccessibilityAction={onAccessibilityAction}
      onPress={() => onEdit(slot)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.sunken }]}
    >
      <MealTypeIcon mealType={mealType} />
      <Text
        variant="subhead"
        color="inkMuted"
        style={[styles.label, { width: Math.round(LABEL_WIDTH * Math.min(fontScale, 2)) }]}
      >
        {label}
      </Text>
      <View style={styles.meal}>
        {body ? (
          <>
            <Text weight={mealType === 'dinner' ? 'semibold' : 'regular'}>{body.title}</Text>
            {body.detail ? (
              <Text variant="footnote" color="inkMuted">
                {body.detail}
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="subhead" color="inkMuted">
            {COPY.placeholder(label)}
          </Text>
        )}
      </View>
      {photo ? (
        <Thumbnail
          testID="slot-photo"
          uri={photo.uri}
          cacheKey={photo.cacheKey}
          width={34}
          height={34}
          radius={8}
          symbolSize={13}
        />
      ) : null}
      <SymbolView
        name={entry ? 'chevron.right' : 'plus'}
        weight="semibold"
        tintColor={theme.inkMuted}
        size={entry ? 12 : 13}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 14,
  },
  // A column, so the meals line up down the day.
  label: { flexShrink: 0 },
  meal: { flex: 1, gap: 1 },
});
