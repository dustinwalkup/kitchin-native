import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Edges, SafeAreaView } from 'react-native-safe-area-context';

import { useIsOnline } from '@/lib/query-client';

import { Banner } from './banner';
import { useTheme } from './use-theme';

export interface ScreenProps {
  children: ReactNode;
  /** Safe-area edges to pad. Defaults to all four. */
  edges?: Edges;
}

/** A screen's root: safe area, the sand background and, while offline, the offline banner. */
export function Screen({ children, edges }: ScreenProps) {
  const theme = useTheme();

  return (
    <SafeAreaView edges={edges} style={[styles.screen, { backgroundColor: theme.screen }]}>
      <OfflineBanner />
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

/** Every screen shows it, so it appears wherever the member is when the connection drops (R13.1). */
function OfflineBanner() {
  const isOnline = useIsOnline();
  return isOnline ? null : <Banner message="Offline — changes will send when you're back online" />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1 },
});
