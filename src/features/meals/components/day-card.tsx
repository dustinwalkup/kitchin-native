import { memo, type ReactNode, useMemo } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { formatDay } from '@/lib/calendar';
import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY, DAY_ACCENTS, DAY_KEYS, MEAL_TYPES, type MealType } from '../constants';
import type { Day, Slot } from '../domain';
import { SlotRow, slotName } from './slot-row';

export interface DayCardProps {
  day: Day;
  isToday: boolean;
  /** The day's open slot, or `null`. Only the day being edited gets a new value (§3.3.6). */
  editing: MealType | null;
  /** Draws the open slot's editor (§3.5), given the slot and its name, such as "Thursday dinner". */
  renderEditor: (slot: Slot, name: string) => ReactNode;
  onEdit: (slot: Slot) => void;
  onClear: (slot: Slot) => void;
  /** Today's card reports where it is, so the screen can scroll to it (R31.1). */
  onLayout?: (event: LayoutChangeEvent) => void;
}

/** "2 of 3 meals planned" (R30.5). */
export function plannedLabel(planned: number): string {
  return `${planned} of ${MEAL_TYPES.length} meals planned`;
}

/**
 * One day: its accent edge (R36.3), weekday and date (R30.1), the Today pill (R30.6), the planned
 * count (R30.5) and a slot per meal type in the fixed order (R30.2). Memoised, so opening a slot
 * on one day doesn't redraw the other six.
 */
export const DayCard = memo(function DayCard({
  day,
  isToday,
  editing,
  renderEditor,
  onEdit,
  onClear,
  onLayout,
}: DayCardProps) {
  const theme = useTheme();
  const { weekday: weekdayName, date } = useMemo(() => formatDay(day.date), [day.date]);
  const header = [`${weekdayName} ${date}`, isToday && 'today', plannedLabel(day.planned)]
    .filter(Boolean)
    .join(', ');

  return (
    <View testID={`day-${DAY_KEYS[day.weekday]}`} onLayout={onLayout}>
      <Card
        style={[
          styles.card,
          // Decorative, so not contrast-checked (R36.4).
          { borderLeftWidth: 4, borderLeftColor: theme[DAY_ACCENTS[day.weekday]] },
        ]}
      >
        {/* One element for VoiceOver: "Thursday October 22, today, 2 of 3 meals planned" (N10). */}
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={header}
          style={styles.header}
        >
          <View style={styles.title}>
            <Text variant="headline">{weekdayName}</Text>
            {isToday ? <TodayPill /> : null}
          </View>
          <View style={styles.title}>
            <Text variant="subhead" color="inkMuted">
              {date}
            </Text>
            <View style={[styles.count, { borderColor: theme.border }]}>
              <Text
                variant="footnote"
                color="inkMuted"
                accessibilityLabel={plannedLabel(day.planned)}
              >
                {day.planned}/{MEAL_TYPES.length}
              </Text>
            </View>
          </View>
        </View>
        {day.slots.map((slot) =>
          slot.mealType === editing ? (
            <View key={slot.mealType}>
              {renderEditor(slot, slotName(weekdayName, slot.mealType))}
            </View>
          ) : (
            <SlotRow
              key={slot.mealType}
              slot={slot}
              weekdayName={weekdayName}
              onEdit={onEdit}
              onClear={onClear}
            />
          ),
        )}
      </Card>
    </View>
  );
});

/** White bold text on terracotta, the pair TEXT_PAIRS allows for it (R30.6, R36.1). */
function TodayPill() {
  const theme = useTheme();

  return (
    <View testID="today-pill" style={[styles.pill, { backgroundColor: theme.accent }]}>
      <Text variant="footnote" color="onBrand">
        {COPY.today}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, gap: 4, paddingVertical: 12 },
  // Wraps at large text sizes rather than clipping (N12).
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 4,
  },
  title: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  count: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
});
