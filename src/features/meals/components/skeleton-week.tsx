import { StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';

import { DAY_KEYS, MEAL_TYPES } from '../constants';

// Uneven widths, so each placeholder card reads as three meals.
const MEAL_WIDTHS = ['58%', '72%', '44%'] as const;

/**
 * Seven placeholder day cards for the first load (R30.9). Skeleton stays still under Reduce Motion
 * (N14). The blocks are hidden from VoiceOver, which reads "Loading meals" instead.
 */
export function SkeletonWeek() {
  return (
    <View testID="skeleton-week" accessible accessibilityLabel="Loading meals" style={styles.week}>
      {DAY_KEYS.map((day) => (
        <Card key={day} style={styles.card}>
          <Skeleton width={120} height={20} />
          {MEAL_TYPES.map(({ key }, i) => (
            <View key={key} style={styles.row}>
              <Skeleton width={32} height={32} radius={16} />
              <Skeleton width={MEAL_WIDTHS[i]} height={16} />
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  week: { gap: 12, paddingVertical: 16 },
  card: { marginHorizontal: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
