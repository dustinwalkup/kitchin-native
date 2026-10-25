import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui/use-theme';

import { MEAL_TYPES, type MealType } from '../constants';

/**
 * The meal type's SF Symbol in its own colour: a sunrise, the sun or the moon (DD32, R36.2, as
 * redesigned in specs/redesign/design.md §5.1). Each colour is an ICON_PAIRS entry on white, so it
 * meets 3:1 (N13). Decorative: the slot's label already names the meal (N10).
 */
export function MealTypeIcon({ mealType, size = 18 }: { mealType: MealType; size?: number }) {
  const theme = useTheme();
  const { symbol, glyph } = MEAL_TYPES.find((t) => t.key === mealType)!;

  return (
    <View
      testID="meal-type-icon"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.icon, { width: size + 6, height: size + 6 }]}
    >
      <SymbolView name={symbol} tintColor={theme[glyph]} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
});
