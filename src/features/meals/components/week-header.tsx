import { StyleSheet, View } from 'react-native';

import { formatWeekRange, type IsoDate, type Weekday, weekStartOf } from '@/lib/calendar';
import { Button } from '@/ui/button';
import { IconButton } from '@/ui/icon-button';
import { Text } from '@/ui/text';

export interface WeekHeaderProps {
  weekStart: IsoDate;
  /** The household's start day, which the week is laid out from (R48.4). */
  start: Weekday;
  /** The household's today (R34.1), which decides whether This week shows. */
  today: IsoDate;
  onPrevious: () => void;
  onNext: () => void;
  onThisWeek: () => void;
}

/**
 * ‹, the week's dates and ›, on the page itself, with "Back to this week" beneath while another
 * week shows (R30.7, R31.2, R31.3, DD29). The arrows are `accentInk` on the ivory page, an
 * ICON_PAIRS pair; `accent` there would be under 3:1.
 */
export function WeekHeader({
  weekStart,
  start,
  today,
  onPrevious,
  onNext,
  onThisWeek,
}: WeekHeaderProps) {
  const isCurrentWeek = weekStartOf(today, start) === weekStart;

  return (
    <View style={styles.band}>
      <View style={styles.row}>
        <IconButton
          testID="week-previous"
          symbol="chevron.left"
          label="Previous week"
          tint="accentInk"
          onPress={onPrevious}
        />
        <Text variant="headline" accessibilityRole="header" style={styles.range}>
          {formatWeekRange(weekStart, today)}
        </Text>
        <IconButton
          testID="week-next"
          symbol="chevron.right"
          label="Next week"
          tint="accentInk"
          onPress={onNext}
        />
      </View>
      {isCurrentWeek ? null : (
        <View style={styles.thisWeek}>
          <Button
            testID="week-this"
            label="Back to this week"
            variant="text"
            size="small"
            onPress={onThisWeek}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { paddingHorizontal: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  range: { flex: 1, textAlign: 'center' },
  thisWeek: { alignItems: 'center', marginTop: -6 },
});
