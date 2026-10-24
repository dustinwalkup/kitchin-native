import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/ui/text';

export interface HeaderActionProps {
  /** Static, never household text (R26.7). */
  testID: string;
  label: string;
  /** What VoiceOver reads, when it says more than the visible label (R40.1). */
  accessibilityLabel?: string;
  onPress: () => void;
}

/**
 * A text action in a native header, such as Library or Add meal: bold terracotta on the white
 * header (R40.12, N13), with a visible label (N26) and a 44 × 44 pt target (N11).
 */
export function HeaderAction({
  testID,
  label,
  accessibilityLabel = label,
  onPress,
}: HeaderActionProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Text color="accent" bold>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
