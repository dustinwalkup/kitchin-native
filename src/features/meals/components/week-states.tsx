import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY } from '../constants';

// What Meals shows in place of the week when it has no week to draw (§3.4). The layout repeats
// the grocery list states rather than importing across features (N24).

/** Loading failed with nothing loaded yet (R30.10). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <WeekMessage testID="meals-load-error" icon="alert-circle-outline" title={COPY.loadError}>
      <Button label="Retry" onPress={onRetry} />
    </WeekMessage>
  );
}

/** Offline before the first load: the fetch waits for the connection (R13.1). */
export function WaitingForConnection() {
  return (
    <WeekMessage
      testID="meals-waiting-for-connection"
      icon="wifi-off"
      title="Waiting for connection…"
    />
  );
}

function WeekMessage({
  testID,
  icon,
  title,
  children,
}: {
  testID: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  children?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View testID={testID} style={styles.message}>
      <MaterialCommunityIcons
        name={icon}
        size={48}
        color={theme.inkMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text variant="headline" accessibilityRole="header" style={styles.centred}>
        {title}
      </Text>
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  centred: { textAlign: 'center' },
  action: { marginTop: 8 },
});
