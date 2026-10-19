import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import type { Progress } from '../domain';

/**
 * "3 of 12 checked", a cactus bar and the bold cactus percentage (R4.7, R16.3). An empty list has
 * no percentage (R4.8). VoiceOver reads the summary as one element. `children`, such as Clear
 * checked, go below it.
 */
export function ProgressHeader({
  progress,
  children,
}: {
  progress: Progress;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const { checked, total, percent } = progress;
  const summary = `${checked} of ${total} checked`;

  return (
    <Card style={styles.card}>
      <View
        testID="progress-header"
        accessible
        accessibilityLabel={percent === null ? summary : `${summary}, ${percent}%`}
        style={styles.content}
      >
        <View style={styles.row}>
          <Text variant="subhead">{summary}</Text>
          {percent === null ? null : (
            // Cactus carries text only in bold (N13).
            <Text variant="headline" color="cactus" bold>
              {percent}%
            </Text>
          )}
        </View>
        {percent === null ? null : (
          <View style={[styles.track, { backgroundColor: theme.border }]}>
            <View
              testID="progress-fill"
              style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.cactus }]}
            />
          </View>
        )}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16 },
  content: { gap: 8 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
