import { StyleSheet, View } from 'react-native';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

/**
 * A tag on a meal in the list: its name, `ink` on `accentSoft` (DD57, 10.50:1). Not interactive;
 * the row it sits in is read as one element (N27). A long name wraps inside the pill rather than
 * running past the row (R40.5).
 */
export function TagPill({ name }: { name: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
      <Text variant="footnote">{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexShrink: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
});
