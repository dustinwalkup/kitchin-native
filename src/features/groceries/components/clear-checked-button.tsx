import { Alert, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/ui/text';

export interface ClearCheckedButtonProps {
  checkedCount: number;
  onClear: () => void;
}

/**
 * Removes every checked item after a native confirmation that states how many (R10.2). It's
 * disabled while nothing is checked (R10.1), and Cancel changes nothing (R10.5).
 */
export function ClearCheckedButton({ checkedCount, onClear }: ClearCheckedButtonProps) {
  const disabled = checkedCount === 0;

  const confirm = () => {
    const items = checkedCount === 1 ? 'item' : 'items';
    Alert.alert(`Clear ${checkedCount} checked ${items}?`, "They'll be removed from the list.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: onClear },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Clear checked"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={confirm}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {/* Cactus carries text only in bold (N13). */}
      <Text variant="subhead" color={disabled ? 'inkMuted' : 'cactus'} bold>
        Clear checked
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
