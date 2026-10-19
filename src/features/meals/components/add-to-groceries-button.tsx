import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/ui/use-theme';

import { COPY } from '../constants';

/**
 * The cart-plus in the Meals header, which opens the add-item sheet over Meals (R37.1, DD33). It
 * takes nothing from the week, so no meal text reaches the sheet (R37.4).
 */
export function AddToGroceriesButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      testID="add-to-groceries"
      accessibilityRole="button"
      accessibilityLabel={COPY.addToGroceries}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {/* Terracotta on the white header, an ICON_PAIRS entry (N13). */}
      <SymbolView name="cart.badge.plus" tintColor={theme.accent} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44 × 44 pt (N11).
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
