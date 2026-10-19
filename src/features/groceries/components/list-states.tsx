import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { EMPTY_STATE } from '../constants';

// What Groceries shows in place of the list when it has no items to draw (§3.4).

/** Loading failed with nothing loaded yet (R4.10). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <ListMessage testID="load-error" icon="alert-circle-outline" title="Couldn't load groceries">
      <Button label="Retry" onPress={onRetry} />
    </ListMessage>
  );
}

/** Offline before the first load: the fetch waits for the connection (R13.1). */
export function WaitingForConnection() {
  return (
    <ListMessage testID="waiting-for-connection" icon="wifi-off" title="Waiting for connection…" />
  );
}

/** No items yet (R4.8), with a button that opens the add-item sheet. */
export function GroceriesEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <ListMessage
      testID="groceries-empty"
      icon="cart-outline"
      title={EMPTY_STATE.title}
      description={EMPTY_STATE.description}
    >
      <Button label="Add an item" onPress={onAdd} />
    </ListMessage>
  );
}

function ListMessage({
  testID,
  icon,
  title,
  description,
  children,
}: {
  testID: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  description?: string;
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
      {description ? (
        <Text variant="subhead" color="inkMuted" style={styles.centred}>
          {description}
        </Text>
      ) : null}
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  centred: { textAlign: 'center' },
  action: { marginTop: 8 },
});
