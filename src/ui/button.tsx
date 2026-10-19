import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** `primary` is cactus with white bold text (R16.3); `secondary` is outlined. */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Shows a spinner and blocks presses while a request is pending. */
  loading?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: theme.radius.base },
        primary
          ? { backgroundColor: theme.cactus }
          : { backgroundColor: theme.background, borderColor: theme.controlBorder, borderWidth: 1 },
        inactive ? styles.disabled : pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? theme.onBrand : theme.ink} />
      ) : (
        <Text variant="headline" color={primary ? 'onBrand' : 'ink'}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
