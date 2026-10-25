import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/ui/use-theme';

/** Space the list leaves below its last row, so the button never covers it. */
export const ADD_ITEM_BUTTON_CLEARANCE = 88;

/** The round "＋" over the bottom right of the list, which opens the add-item sheet (§3.4). */
export function AddItemButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      testID="add-item-button"
      accessibilityRole="button"
      accessibilityLabel="Add item"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.accent, shadowColor: theme.accentInk },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView name="plus" weight="semibold" tintColor={theme.onBrand} size={24} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    // A soft, warm lift, the one shadow in the app: it floats over the list.
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  pressed: { opacity: 0.8 },
});
