import { Alert, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/ui/text';

export interface UncheckAllButtonProps {
  /** How many checked items it would reopen, from `planUncheckAll` (R10.7). */
  uncheckCount: number;
  onUncheck: () => void;
}

/**
 * Puts checked items back on the list, for the ones bought every week, after a native confirmation
 * that states how many (R10.8). It's disabled while none can be unchecked (R10.6), and Cancel
 * changes nothing.
 */
export function UncheckAllButton({ uncheckCount, onUncheck }: UncheckAllButtonProps) {
  const disabled = uncheckCount === 0;

  const confirm = () => {
    const items = uncheckCount === 1 ? 'item' : 'items';
    Alert.alert(`Uncheck ${uncheckCount} ${items}?`, "They'll go back on the list to buy again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Uncheck', onPress: onUncheck },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Uncheck all"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={confirm}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {/* Cactus carries text only in bold (N13). */}
      <Text variant="subhead" color={disabled ? 'inkMuted' : 'cactus'} bold>
        Uncheck all
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
