import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';

import { weekday } from '@/lib/calendar';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY, DAY_KEYS, MEAL_TYPES, type MealType } from '../constants';
import type { Slot } from '../domain';
import { MealTypeIcon } from './meal-type-icon';

export interface SlotRowProps {
  slot: Slot;
  /** The day's name as the card shows it, such as "Thursday". */
  weekdayName: string;
  // The screen's handlers, passed down unchanged so the memoised day cards stay put (§3.3.6).
  onEdit: (slot: Slot) => void;
  onClear: (slot: Slot) => void;
}

/** "Thursday dinner": the slot's name for VoiceOver, and the editor field's label (N10, §3.4). */
export function slotName(weekdayName: string, mealType: MealType): string {
  const { label } = MEAL_TYPES.find((t) => t.key === mealType)!;
  return `${weekdayName} ${label.toLowerCase()}`;
}

/** What VoiceOver reads for a slot: "Thursday dinner: Tacos", or "Thursday dinner, not planned". */
export function slotLabel(weekdayName: string, { mealType, entry }: Slot): string {
  const name = slotName(weekdayName, mealType);
  return entry ? `${name}: ${entry.body}` : `${name}, not planned`;
}

// Only a planned slot has something to clear (R33.2).
const CLEAR_ACTION = [{ name: 'clear', label: 'Clear' }];

/**
 * The meal type's icon and label, then the planned meal or a muted "＋ Add dinner" (R30.3, R30.4).
 * Tapping the row opens its editor (R32.1). The text has no line limit, so a long meal wraps (R30.3).
 */
export function SlotRow({ slot, weekdayName, onEdit, onClear }: SlotRowProps) {
  const theme = useTheme();
  const { mealType, entry } = slot;
  const { label } = MEAL_TYPES.find((t) => t.key === mealType)!;

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'clear') onClear(slot);
  };

  return (
    <Pressable
      // Static parts only, never meal text (R26.7).
      testID={`slot-${DAY_KEYS[weekday(slot.date)]}-${mealType}`}
      accessibilityRole="button"
      accessibilityLabel={slotLabel(weekdayName, slot)}
      accessibilityHint="Edits this meal"
      accessibilityActions={entry ? CLEAR_ACTION : undefined}
      onAccessibilityAction={onAccessibilityAction}
      onPress={() => onEdit(slot)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.screen }]}
    >
      <MealTypeIcon mealType={mealType} />
      <View style={styles.text}>
        <Text variant="subhead" color="inkMuted">
          {label}
        </Text>
        {entry ? (
          <Text>{entry.body}</Text>
        ) : (
          <Text color="inkMuted">＋ {COPY.placeholder(label)}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  text: { flex: 1, gap: 2 },
});
