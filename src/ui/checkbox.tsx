import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from './use-theme';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What VoiceOver reads, for example the item name (N10). */
  label: string;
  disabled?: boolean;
}

/** A 24 pt box inside a 44 pt target (N11). */
export function Checkbox({ checked, onChange, label, disabled = false }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.target}
    >
      <CheckboxMark checked={checked} />
    </Pressable>
  );
}

/**
 * The 24 pt box on its own, for a control that is the touch target itself, such as a grocery row
 * (§3.4). That control carries the role, label and state for VoiceOver. Checked, it fills with
 * sage and shows a tick, so completion reads by shape as well as colour (R4.6).
 */
export function CheckboxMark({ checked }: { checked: boolean }) {
  const theme = useTheme();

  return (
    <View
      testID="checkbox-mark"
      style={[
        styles.box,
        checked
          ? { backgroundColor: theme.sage, borderColor: theme.sage }
          : { backgroundColor: theme.background, borderColor: theme.controlBorder },
      ]}
    >
      {checked ? (
        <MaterialCommunityIcons name="check-bold" size={15} color={theme.onBrand} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  target: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
