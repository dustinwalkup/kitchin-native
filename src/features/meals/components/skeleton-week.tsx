import { StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';

import { DAY_KEYS, MEAL_TYPES } from '../constants';

// Uneven widths, so each placeholder day reads as three meals.
const MEAL_WIDTHS = ['48%', '62%', '38%'] as const;

/**
 * Seven placeholder days for the first load (R30.9). Skeleton stays still under Reduce Motion
 * (N14). The blocks are hidden from VoiceOver, which reads "Loading meals" instead.
 */
export function SkeletonWeek() {
  return (
    <View testID="skeleton-week" accessible accessibilityLabel="Loading meals" style={styles.week}>
      {DAY_KEYS.map((day) => (
        <Card key={day} style={styles.card}>
          <Skeleton width={96} height={20} />
          {MEAL_TYPES.map(({ key }, i) => (
            <View key={key} style={styles.row}>
              <Skeleton width={20} height={20} radius={10} />
              <Skeleton width={64} height={14} />
              <Skeleton width={MEAL_WIDTHS[i]} height={16} />
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  week: { gap: 12, paddingVertical: 8 },
  card: { marginHorizontal: 16, gap: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
