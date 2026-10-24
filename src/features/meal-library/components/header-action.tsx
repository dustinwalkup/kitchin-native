import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

export interface HeaderActionProps {
  /** Static, never household text (R26.7). */
  testID: string;
  label: string;
  /** What VoiceOver reads, when it says more than the visible label (R40.1). */
  accessibilityLabel?: string;
  onPress: () => void;
  /** Ink in the regular weight, for Cancel beside the form's Save. */
  plain?: boolean;
  disabled?: boolean;
  /** Shows a spinner in place of the label, and blocks presses, while a save is pending (R42.8). */
  busy?: boolean;
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
  plain = false,
  disabled = false,
  busy = false,
}: HeaderActionProps) {
  const theme = useTheme();
  const inactive = disabled || busy;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.action, (pressed || disabled) && styles.pressed]}
    >
      {/* The label keeps its space under the spinner, so the header doesn't shift. */}
      <Text color={plain ? 'ink' : 'accent'} bold={!plain} style={busy && styles.hidden}>
        {label}
      </Text>
      {busy ? (
        <ActivityIndicator
          testID={`${testID}-spinner`}
          color={theme.accent}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
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
  hidden: { opacity: 0 },
});
