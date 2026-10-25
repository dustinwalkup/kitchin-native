import { StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';

// Uneven widths, so the placeholder reads as a list of names.
const NAME_WIDTHS = ['62%', '40%', '74%', '48%', '56%', '35%'] as const;

/**
 * Placeholder rows in the shape of the progress panel and a section, for the first load (R4.9). The
 * blocks are hidden from VoiceOver, which reads "Loading groceries" instead.
 */
export function SkeletonRows() {
  return (
    <View
      testID="skeleton-rows"
      accessible
      accessibilityLabel="Loading groceries"
      style={styles.container}
    >
      <Card style={styles.progress}>
        <Skeleton width={120} height={14} />
        <Skeleton height={6} />
      </Card>
      <View style={styles.heading}>
        <Skeleton width={24} height={24} radius={12} />
        <Skeleton width={110} height={18} />
      </View>
      <Card style={styles.rows}>
        {NAME_WIDTHS.map((width) => (
          <View key={width} style={styles.row}>
            <Skeleton width={24} height={24} radius={7} />
            <Skeleton width={width} height={16} />
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 4, gap: 14 },
  progress: { gap: 12 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingTop: 6,
  },
  rows: { gap: 22, paddingVertical: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
