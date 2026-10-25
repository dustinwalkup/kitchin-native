import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface SheetAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner in place of the label, and blocks presses, while a save is pending. */
  busy?: boolean;
  testID?: string;
}

export interface SheetHeaderProps {
  title: string;
  /** A quiet text action, such as Cancel or Done. */
  left?: SheetAction;
  /** The sheet's action, such as Add or Save, as a small terracotta button. */
  right?: SheetAction;
}

/**
 * A sheet's own header: the grabber's space, a quiet action on the left, the title, and the
 * sheet's action on the right (specs/redesign/design.md §3.4). Native sheets cover the app's
 * headers, so the grocery sheets draw this one.
 */
export function SheetHeader({ title, left, right }: SheetHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={[styles.side, styles.start]}>{left ? <TextAction {...left} /> : null}</View>
      <Text variant="headline" accessibilityRole="header" numberOfLines={2} style={styles.title}>
        {title}
      </Text>
      <View style={[styles.side, styles.end]}>{right ? <PrimaryAction {...right} /> : null}</View>
    </View>
  );
}

function TextAction({ label, onPress, disabled = false, testID }: SheetAction) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.text, (pressed || disabled) && styles.dimmed]}
    >
      <Text color="inkMuted">{label}</Text>
    </Pressable>
  );
}

function PrimaryAction({ label, onPress, disabled = false, busy = false, testID }: SheetAction) {
  const theme = useTheme();
  const inactive = disabled || busy;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: theme.accent, borderRadius: theme.radius.pill },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      {/* The label keeps its space under the spinner, so the header doesn't shift. */}
      <Text variant="subhead" color="onBrand" style={busy && styles.hidden}>
        {label}
      </Text>
      {busy ? (
        <ActivityIndicator
          testID={testID ? `${testID}-spinner` : undefined}
          color={theme.onBrand}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 8,
  },
  // Equal sides keep the title centred whatever the actions say.
  side: { flex: 1, flexDirection: 'row' },
  start: { justifyContent: 'flex-start' },
  end: { justifyContent: 'flex-end', paddingRight: 8 },
  title: { flexShrink: 1, maxWidth: '60%', textAlign: 'center' },
  text: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center' },
  primary: {
    minHeight: 34,
    minWidth: 60,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.45 },
  hidden: { opacity: 0 },
});
