import { memo, useMemo } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { formatDay, formatDayShort } from '@/lib/calendar';
import { CountBadge } from '@/ui/count-badge';
import { Divider } from '@/ui/group';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY, DAY_KEYS, MEAL_TYPES } from '../constants';
import type { Day, MealEntry, Slot } from '../domain';
import { type SlotPhoto, SlotRow } from './slot-row';

export interface DayCardProps {
  day: Day;
  isToday: boolean;
  onEdit: (slot: Slot) => void;
  onClear: (slot: Slot) => void;
  /** The photo for a planned meal chosen from the library, if it has one (DD-R10). */
  photoFor?: (entry: MealEntry) => SlotPhoto | undefined;
  /** Today's card reports where it is, so the screen can scroll to it (R31.1). */
  onLayout?: (event: LayoutChangeEvent) => void;
}

/** "2 of 3 meals planned" (R30.5). */
export function plannedLabel(planned: number): string {
  return `${planned} of ${MEAL_TYPES.length} meals planned`;
}

/**
 * One day on a white surface (specs/redesign/design.md §5.1): "Thu  Oct 22", Today when it is, the
 * planned count, then a row per meal type in the fixed order, divided by hairlines (R30.1, R30.2,
 * R30.5, R30.6). The surface on the ivory page is the grouping; only today gets an edge, in
 * terracotta. Memoised, so a change to one day doesn't redraw the other six.
 */
export const DayCard = memo(function DayCard({
  day,
  isToday,
  onEdit,
  onClear,
  photoFor,
  onLayout,
}: DayCardProps) {
  const theme = useTheme();
  const full = useMemo(() => formatDay(day.date), [day.date]);
  const short = useMemo(() => formatDayShort(day.date), [day.date]);
  const header = [`${full.weekday} ${full.date}`, isToday && 'today', plannedLabel(day.planned)]
    .filter(Boolean)
    .join(', ');
  const complete = day.planned === MEAL_TYPES.length;

  return (
    <View
      testID={`day-${DAY_KEYS[day.weekday]}`}
      onLayout={onLayout}
      style={[
        styles.card,
        { backgroundColor: theme.background, borderRadius: theme.radius.card },
        isToday && { borderColor: theme.accent, borderWidth: 1 },
      ]}
    >
      {/* One element for VoiceOver: "Thursday October 22, today, 2 of 3 meals planned" (N10). */}
      <View accessible accessibilityRole="header" accessibilityLabel={header} style={styles.header}>
        <View style={styles.title}>
          <Text variant="title2">{short.weekday}</Text>
          <Text variant="subhead" color="inkMuted">
            {short.date}
          </Text>
          {isToday ? (
            <View testID="today-pill">
              <CountBadge label={COPY.today} tone="accent" />
            </View>
          ) : null}
        </View>
        <CountBadge
          label={`${day.planned}/${MEAL_TYPES.length}`}
          tone={complete ? 'sage' : 'neutral'}
          accessibilityLabel={plannedLabel(day.planned)}
        />
      </View>
      {day.slots.map((slot) => (
        <View key={slot.mealType}>
          <Divider inset={46} />
          <SlotRow
            slot={slot}
            weekdayName={full.weekday}
            photo={slot.entry && photoFor ? photoFor(slot.entry) : undefined}
            onEdit={onEdit}
            onClear={onClear}
          />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, overflow: 'hidden' },
  // Wraps at large text sizes rather than clipping (N12).
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
});
