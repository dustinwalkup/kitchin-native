import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** `primary` is cactus with white bold text (R16.3); `secondary` is outlined. */
  variant?: 'primary' | 'secondary';
  /**
   * `accent` makes a primary button terracotta, and a secondary button's text bold terracotta, for
   * the meal library (DD57). The default is cactus.
   */
  tone?: 'cactus' | 'accent';
  disabled?: boolean;
  /** Shows a spinner and blocks presses while a request is pending. */
  loading?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  tone = 'cactus',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const accent = tone === 'accent';
  const inactive = disabled || loading;
  // Terracotta carries text only in bold (N13), so accent text is always bold.
  const textColor = primary ? 'onBrand' : accent ? 'accent' : 'ink';

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
          ? { backgroundColor: theme[tone] }
          : { backgroundColor: theme.background, borderColor: theme.controlBorder, borderWidth: 1 },
        inactive ? styles.disabled : pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme[textColor]} />
      ) : (
        <Text variant="headline" color={textColor} bold={accent}>
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
