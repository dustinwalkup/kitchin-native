import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

// The buttons are 30 pt; the slop brings each touch target to 44 pt (N11).
const STEP_SLOP = { top: 7, bottom: 7, left: 7, right: 7 };

/**
 * A round − or + inside the stepper. Hidden from VoiceOver, which adjusts the whole control. A
 * disabled button still takes the touch and ignores it, so a tap at a limit never falls through to
 * whatever the stepper sits in, such as a grocery row that checks its item.
 */
export function StepButton({
  kind,
  onPress,
  disabled = false,
  testID,
}: {
  kind: 'decrement' | 'increment';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      accessibilityState={{ disabled }}
      hitSlop={STEP_SLOP}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.step,
        pressed && !disabled && { backgroundColor: theme.sunken },
        disabled && styles.disabled,
      ]}
    >
      <SymbolView
        name={kind === 'decrement' ? 'minus' : 'plus'}
        weight="semibold"
        tintColor={theme.ink}
        size={13}
      />
    </Pressable>
  );
}

export interface QuantityStepperProps {
  /** What the stepper shows between − and +. */
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
  /** What VoiceOver calls it, such as "Apples quantity" (N10). */
  label: string;
  /** In place of the value, such as a field to type a quantity with a unit. */
  children?: ReactNode;
  /** A stepper inside a row the row reads as one element, so the row carries the actions. */
  accessible?: boolean;
  testID?: string;
}

const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

/**
 * "− 2 +" in a soft pill (specs/redesign/design.md §4.1). On its own it's one adjustable element:
 * VoiceOver swipes up and down to change it.
 */
export function QuantityStepper({
  value,
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
  label,
  children,
  accessible = true,
  testID,
}: QuantityStepperProps) {
  const theme = useTheme();

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'increment' && canIncrement) onIncrement();
    if (nativeEvent.actionName === 'decrement' && canDecrement) onDecrement();
  };

  // With a field inside, VoiceOver reaches the field instead, and the field takes the typing.
  const adjustable = accessible && children === undefined;

  return (
    <View
      testID={testID}
      accessible={adjustable}
      accessibilityRole={adjustable ? 'adjustable' : undefined}
      accessibilityLabel={adjustable ? label : undefined}
      accessibilityValue={adjustable ? { text: value } : undefined}
      accessibilityActions={adjustable ? ADJUST_ACTIONS : undefined}
      onAccessibilityAction={adjustable ? onAccessibilityAction : undefined}
      style={[styles.stepper, { borderColor: theme.border, backgroundColor: theme.background }]}
    >
      <StepButton kind="decrement" onPress={onDecrement} disabled={!canDecrement} />
      {children ?? (
        <Text variant="subhead" weight="semibold" style={styles.value}>
          {value}
        </Text>
      )}
      <StepButton kind="increment" onPress={onIncrement} disabled={!canIncrement} />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    padding: 2,
    gap: 2,
  },
  step: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 22, textAlign: 'center' },
  disabled: { opacity: 0.3 },
});
