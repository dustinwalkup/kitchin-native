import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { useSetWeekStart, useWeekStart } from '@/features/household/use-week-start';
import { WEEK_START_VALUES } from '@/features/household/week-start';
import { type Weekday, weekdayName } from '@/lib/calendar';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

const DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * The household's start of the week: the seven days, Monday first, with a checkmark on the chosen
 * one, as iOS's own Calendar setting lists them (R48.1, specs/meals/2-design.md §11.5, DD64).
 * Choosing a day saves it for the whole household and stays on the screen.
 */
export default function WeekStart() {
  const theme = useTheme();
  const weekStart = useWeekStart();
  const { setWeekStart, failed } = useSetWeekStart();

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.list}>
          {DAYS.map((day) => {
            const selected = day === weekStart;
            return (
              <Pressable
                key={day}
                // "week-start-sun": static, like the Meals day IDs.
                testID={`week-start-${WEEK_START_VALUES[day].slice(0, 3)}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  if (!selected) setWeekStart(day);
                }}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? theme.screen : theme.background },
                ]}
              >
                <Text>{weekdayName(day)}</Text>
                {selected ? (
                  // Terracotta on white, an ICON_PAIRS pair (3.53:1, N13).
                  <SymbolView
                    name="checkmark"
                    weight="semibold"
                    tintColor={theme.accent}
                    size={17}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </Card>
        {/* The checkmark is already back on the earlier day (R48.10). */}
        {failed ? (
          <Text testID="week-start-error" variant="footnote" color="destructive" bold>
            Couldn&apos;t change the start of the week
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  list: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 44,
  },
});
