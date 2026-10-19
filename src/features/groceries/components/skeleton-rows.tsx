import { StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';

// Uneven widths, so the placeholder reads as a list of names.
const NAME_WIDTHS = ['62%', '40%', '74%', '48%', '56%', '35%'] as const;

/**
 * Placeholder rows in the shape of a section, for the first load (R4.9). The blocks are hidden
 * from VoiceOver, which reads "Loading groceries" instead.
 */
export function SkeletonRows() {
  return (
    <View
      testID="skeleton-rows"
      accessible
      accessibilityLabel="Loading groceries"
      style={styles.container}
    >
      <Skeleton width={140} height={20} />
      <Card style={styles.card}>
        {NAME_WIDTHS.map((width) => (
          <View key={width} style={styles.row}>
            <Skeleton width={22} height={22} />
            <Skeleton width={width} height={16} />
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 20, gap: 12 },
  card: { gap: 20, paddingVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
