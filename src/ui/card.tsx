import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from './use-theme';

/**
 * A white surface on the ivory page, with no border or shadow: the difference in fill is the edge
 * (specs/redesign/design.md DD-R2). For content that belongs together, such as a day's meals or a
 * category's items. Lists of rows use `Group`, which adds dividers.
 */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.background, borderRadius: theme.radius.card },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
});
