import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { reportCrash } from '@/lib/reporting';

import { Button } from './button';
import { Screen } from './screen';
import { Text } from './text';

/** Shown in place of a screen that failed to render (R14.6), in plain words only (R14.9). */
export function CrashScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen>
      <View style={styles.content}>
        <Text variant="title" accessibilityRole="header">
          Something went wrong
        </Text>
        <Button label="Try again" onPress={onRetry} />
      </View>
    </Screen>
  );
}

/**
 * Expo Router's per-route error boundary. The root and `(app)` layouts export it, so a failing tab
 * leaves the root mounted (§3.9). It reports each error once and shows none of its details.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportCrash(error), [error]);
  return <CrashScreen onRetry={retry} />;
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', padding: 16, gap: 16 },
});
