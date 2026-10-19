import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui/use-theme';

import { MEAL_TYPES, type MealType } from '../constants';

/**
 * The meal type's SF Symbol on its soft tint (DD32, R36.2). Each glyph and tint is an ICON_PAIRS
 * entry, so it meets 3:1 (N13). Decorative: the slot's label already names the meal (N10).
 */
export function MealTypeIcon({ mealType }: { mealType: MealType }) {
  const theme = useTheme();
  const { symbol, glyph, tint } = MEAL_TYPES.find((t) => t.key === mealType)!;

  return (
    <View
      testID="meal-type-icon"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { backgroundColor: theme[tint] }]}
    >
      <SymbolView name={symbol} tintColor={theme[glyph]} size={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
