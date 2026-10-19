import { StyleSheet, View } from 'react-native';

import type { CategoryKey } from '@/features/groceries/constants';

import { Text } from './text';
import { useTheme } from './use-theme';

/** A label in its category's legacy badge colours, such as "2 left" (R16.4). */
export function CategoryBadge({ category, label }: { category: CategoryKey; label: string }) {
  const theme = useTheme();
  const { bg, fg } = theme.category[category];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="footnote" style={[styles.label, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  label: { fontWeight: '600' },
});
