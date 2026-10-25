import { type SFSymbol, SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import type { ColourToken } from './theme';
import { useTheme } from './use-theme';

export interface IconButtonProps {
  symbol: SFSymbol;
  /** What VoiceOver reads; the glyph has no visible label (N10). */
  label: string;
  onPress: () => void;
  /** The glyph's colour: ink for chrome, accent for the action a screen offers. */
  tint?: ColourToken;
  size?: number;
  disabled?: boolean;
  testID?: string;
}

/** A glyph in a 44 × 44 pt target (N11), such as a header's menu or the week's arrows. */
export function IconButton({
  symbol,
  label,
  onPress,
  tint = 'ink',
  size = 20,
  disabled = false,
  testID,
}: IconButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}
    >
      <SymbolView name={symbol} weight="semibold" tintColor={theme[tint]} size={size} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.45 },
});
