import { SymbolView } from 'expo-symbols';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/ui/use-theme';

import { COPY } from '../constants';

/**
 * "Search meals", with a magnifying glass and the native clear button (R41.1). The list follows
 * each keystroke, so there's no Search button, and Return only closes the keyboard.
 */
export function SearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: theme.background,
          borderColor: theme.controlBorder,
          borderRadius: theme.radius.base,
        },
      ]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SymbolView name="magnifyingglass" tintColor={theme.inkMuted} size={17} />
      </View>
      <TextInput
        testID="library-search"
        accessibilityLabel={COPY.search}
        value={value}
        onChangeText={onChangeText}
        placeholder={COPY.search}
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
    borderWidth: 1,
  },
  input: { flex: 1, minHeight: 44, paddingVertical: 10, paddingRight: 8, fontSize: 17 },
});
