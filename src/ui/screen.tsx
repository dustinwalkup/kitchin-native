import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Edges, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from './use-theme';

export interface ScreenProps {
  children: ReactNode;
  /** Shown above the content, such as the offline banner (R13.1). */
  banner?: ReactNode;
  /** Safe-area edges to pad. Defaults to all four. */
  edges?: Edges;
}

/** A screen's root: safe area, the sand background and a slot for a banner. */
export function Screen({ children, banner, edges }: ScreenProps) {
  const theme = useTheme();

  return (
    <SafeAreaView edges={edges} style={[styles.screen, { backgroundColor: theme.screen }]}>
      {banner}
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1 },
});
