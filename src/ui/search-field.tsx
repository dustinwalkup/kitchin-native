import { SymbolView } from 'expo-symbols';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from './use-theme';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** The placeholder, which VoiceOver also reads as the field's name. */
  label: string;
  testID?: string;
}

/**
 * A search field: a magnifying glass, the placeholder and the native clear button, on the sunken
 * track. The list follows each keystroke, so there's no Search button, and Return only closes the
 * keyboard.
 */
export function SearchField({ value, onChangeText, label, testID }: SearchFieldProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.field, { backgroundColor: theme.sunken, borderRadius: theme.radius.base }]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SymbolView name="magnifyingglass" tintColor={theme.inkMuted} size={16} />
      </View>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={theme.inkMuted}
        clearButtonMode="while-editing"
        returnKeyType="done"
        // Matching ignores case, and a corrected word would hide what the member typed (R41.1).
        autoCapitalize="none"
        autoCorrect={false}
        allowFontScaling
        maxFontSizeMultiplier={2}
        style={[styles.input, { color: theme.ink }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingLeft: 12,
  },
  input: { flex: 1, minHeight: 44, paddingVertical: 10, paddingRight: 8, fontSize: 17 },
});
