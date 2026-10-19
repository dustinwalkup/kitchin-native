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
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.target}
    >
      <View
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
    </Pressable>
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
