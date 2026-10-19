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

/** A 22 pt box inside a 44 pt target (N11). */
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
 * The 22 pt box on its own, for a control that is the touch target itself, such as a grocery row
 * (§3.4). That control carries the role, label and state for VoiceOver.
 */
export function CheckboxMark({ checked }: { checked: boolean }) {
  const theme = useTheme();

  return (
    <View
      testID="checkbox-mark"
      style={[
        styles.box,
        checked
          ? { backgroundColor: theme.primary, borderColor: theme.primary }
          : { backgroundColor: theme.background, borderColor: theme.controlBorder },
      ]}
    >
      {checked ? (
        <MaterialCommunityIcons name="check-bold" size={16} color={theme.onBrand} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  target: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
