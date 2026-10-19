import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './text';
import { useTheme } from './use-theme';

/**
 * Marks the development variant (R24.2). The root layout renders it only in development. It
 * never takes touches.
 */
export function DevBadge() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel="Development build"
      style={[styles.badge, { top: insets.top + 4, backgroundColor: theme.ink }]}
    >
      <Text variant="footnote" color="onBrand">
        DEV
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
