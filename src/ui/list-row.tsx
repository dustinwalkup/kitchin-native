import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface ListRowProps {
  label: string;
  /** Shown muted at the end, such as the chosen day or the version. */
  value?: string;
  /** A row with `onPress` is a button with a chevron, unless `chevron` is false. */
  onPress?: () => void;
  chevron?: boolean;
  /** At the end, in place of the value: a checkmark, a switch, a spinner. */
  accessory?: ReactNode;
  /** Red label, for Sign out. */
  destructive?: boolean;
  /** Terracotta label, for an action such as Sign out that isn't destructive. */
  tint?: boolean;
  /** The label centred in the row, for an action row with nothing else in it, such as Sign out. */
  centered?: boolean;
  accessibilityHint?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; busy?: boolean };
  disabled?: boolean;
  testID?: string;
}

/**
 * One row of a `Group`: a label, then a muted value, accessory or chevron. A static row is one
 * element for VoiceOver; a pressable one is a button that reads its label and value together (N10).
 */
export function ListRow({
  label,
  value,
  onPress,
  chevron = onPress !== undefined,
  accessory,
  destructive = false,
  tint = false,
  centered = false,
  accessibilityHint,
  accessibilityState,
  disabled = false,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const content = (
    <>
      <Text
        color={destructive ? 'destructive' : tint ? 'accentInk' : 'ink'}
        weight={destructive || tint ? 'medium' : 'regular'}
        // Without a value, the label takes the row, so the accessory and chevron sit at the end.
        style={[styles.label, value === undefined && !centered && styles.fill]}
      >
        {label}
      </Text>
      {value !== undefined ? (
        <Text color="inkMuted" style={styles.value}>
          {value}
        </Text>
      ) : null}
      {accessory}
      {chevron ? (
        <SymbolView name="chevron.right" weight="semibold" tintColor={theme.inkMuted} size={13} />
      ) : null}
    </>
  );

  const accessibilityLabel = value ? `${label}, ${value}` : label;

  if (onPress === undefined) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel}
        style={[styles.row, centered && styles.centered]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        centered && styles.centered,
        pressed && { backgroundColor: theme.sunken },
        disabled && styles.disabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Wraps at large text sizes rather than clipping (N12).
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  centered: { justifyContent: 'center' },
  label: { flexShrink: 1 },
  fill: { flexGrow: 1 },
  value: { flex: 1, flexBasis: 80, textAlign: 'right' },
  disabled: { opacity: 0.5 },
});
