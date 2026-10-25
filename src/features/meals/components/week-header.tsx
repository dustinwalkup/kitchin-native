import { type SFSymbol, SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatWeekRange, type IsoDate, type Weekday, weekStartOf } from '@/lib/calendar';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

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
 * ‹, the week's dates and ›, with This week below while another week shows (R30.7, R31.2, R31.3,
 * DD29). A white band, so the terracotta arrows are the measured ICON_PAIRS entry.
 */
export function WeekHeader({
  weekStart,
  start,
  today,
  onPrevious,
  onNext,
  onThisWeek,
}: WeekHeaderProps) {
  const theme = useTheme();
  const isCurrentWeek = weekStartOf(today, start) === weekStart;

  return (
    <View
      style={[styles.band, { backgroundColor: theme.background, borderBottomColor: theme.border }]}
    >
      <View style={styles.row}>
        <ArrowButton
          testID="week-previous"
          label="Previous week"
          symbol="chevron.left"
          onPress={onPrevious}
        />
        <Text variant="headline" accessibilityRole="header" style={styles.range}>
          {formatWeekRange(weekStart, today)}
        </Text>
        <ArrowButton testID="week-next" label="Next week" symbol="chevron.right" onPress={onNext} />
      </View>
      {isCurrentWeek ? null : (
        <Pressable
          testID="week-this"
          accessibilityRole="button"
          accessibilityLabel="This week"
          onPress={onThisWeek}
          style={({ pressed }) => [
            styles.thisWeek,
            { borderColor: theme.controlBorder, borderRadius: theme.radius.base },
            pressed && styles.pressed,
          ]}
        >
          <Text variant="subhead" bold>
            This week
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** A 44 × 44 pt arrow (N11). */
function ArrowButton({
  testID,
  label,
  symbol,
  onPress,
}: {
  testID: string;
  label: string;
  symbol: SFSymbol;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
    >
      <SymbolView name={symbol} weight="semibold" tintColor={theme.accent} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  band: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  range: { flex: 1, textAlign: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  thisWeek: {
    alignSelf: 'flex-end',
    minWidth: 44,
    minHeight: 44,
    marginHorizontal: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
