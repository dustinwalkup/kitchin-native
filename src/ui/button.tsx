import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';
import type { ColourToken } from './theme';
import { useTheme } from './use-theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /**
   * `primary` is terracotta with white bold text, for the one action a screen is about.
   * `secondary` is a quiet surface button with a soft edge. `text` is a terracotta label alone.
   */
  variant?: 'primary' | 'secondary' | 'text';
  /** `small` is 34 pt tall, with slop that keeps the touch target at 44 pt (N11). */
  size?: 'regular' | 'small';
  /** A leading glyph, such as a plus. Decorative: the label says what the button does. */
  icon?: ReactNode;
  /** Red text, for a destructive `secondary` or `text` button. */
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a spinner and blocks presses while a request is pending. */
  loading?: boolean;
  /** Stretches to its container's width. */
  block?: boolean;
  /** Static parts and IDs only, never household text (R26.7). */
  testID?: string;
}

const SMALL_SLOP = { top: 5, bottom: 5, left: 0, right: 0 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  icon,
  destructive = false,
  disabled = false,
  loading = false,
  block = false,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const small = size === 'small';
  const textColor: ColourToken =
    variant === 'primary'
      ? 'onBrand'
      : destructive
        ? 'destructive'
        : variant === 'text'
          ? 'accentInk'
          : 'ink';

  const surface =
    variant === 'primary'
      ? { backgroundColor: theme.accent }
      : variant === 'secondary'
        ? { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }
        : null;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={small ? SMALL_SLOP : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small ? styles.small : styles.regular,
        variant === 'text' && styles.textOnly,
        { borderRadius: theme.radius.pill },
        surface,
        block && styles.block,
        inactive ? styles.disabled : pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme[textColor]} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            variant={small ? 'subhead' : 'headline'}
            color={textColor}
            weight="semibold"
            style={styles.label}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  regular: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12 },
  small: { minHeight: 34, paddingHorizontal: 14, paddingVertical: 6 },
  // A text button needs no padding to look like a button, but keeps its touch target.
  textOnly: { minHeight: 44, paddingHorizontal: 8 },
  block: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  label: { textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
