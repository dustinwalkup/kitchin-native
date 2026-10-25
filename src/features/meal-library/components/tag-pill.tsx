import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { MEAL_TYPES, type MealType } from '@/features/meals/constants';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

/**
 * A tag on a meal in the list: its name, `ink` on blush (DD57 as redesigned). Not interactive; the
 * row it sits in is read as one element (N27). A long name wraps inside the pill rather than
 * running past the row (R40.5).
 */
export function TagPill({ name }: { name: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
      <Text variant="caption">{name}</Text>
    </View>
  );
}

/**
 * A meal's type, set apart from its tags: the type's glyph and name on the neutral tone, so it never
 * reads as one more tag (specs/redesign/design.md DD-R6).
 */
export function TypePill({ mealType }: { mealType: MealType }) {
  const theme = useTheme();
  const { label, symbol, glyph } = MEAL_TYPES.find((t) => t.key === mealType)!;

  return (
    <View testID="type-pill" style={[styles.pill, styles.type, { backgroundColor: theme.sunken }]}>
      <SymbolView name={symbol} tintColor={theme[glyph]} size={11} />
      <Text variant="caption" color="inkMuted" weight="semibold">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexShrink: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  type: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
