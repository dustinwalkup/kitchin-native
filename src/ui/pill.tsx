import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

/** A small, non-blocking status indicator, such as "Reconnecting…" (R13.4). */
export function Pill({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.pill, { backgroundColor: theme.sunken }]}>
      <View style={[styles.dot, { backgroundColor: theme.accent }]} />
      <Text variant="footnote" color="inkMuted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
