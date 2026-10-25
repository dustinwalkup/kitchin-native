import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MEAL_TYPES } from '@/features/meals/constants';
import { SectionHeader } from '@/ui/group';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY } from '../constants';
import type { Meal } from '../domain';
import { MealImage } from './meal-image';

export interface RecentMealsProps {
  meals: Meal[];
  imageUrls: Readonly<Record<string, string>>;
  onPress: (meal: Meal) => void;
  /** What a tap does, for VoiceOver, as on the rows. */
  hint: string;
}

/**
 * Recently used: the meals the household planned last, as photo cards in a sideways row, so this
 * week's repeats are one tap away (specs/redesign/design.md DD-R10). The meals also appear in the
 * list below, so this is a shortcut, never the only way to a meal.
 */
export function RecentMeals({ meals, imageUrls, onPress, hint }: RecentMealsProps) {
  const theme = useTheme();
  if (meals.length === 0) return null;

  return (
    <View testID="recent-meals" style={styles.section}>
      <View style={styles.heading}>
        <SectionHeader title={COPY.recentlyUsed} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.row}
      >
        {meals.map((meal) => {
          const type = MEAL_TYPES.find((t) => t.key === meal.mealType);
          return (
            <Pressable
              key={meal.id}
              testID={`recent-meal-${meal.id}`}
              accessibilityRole="button"
              accessibilityLabel={type ? `${meal.name}, ${type.label.toLowerCase()}` : meal.name}
              accessibilityHint={hint}
              onPress={() => onPress(meal)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: theme.background, borderRadius: theme.radius.card },
                pressed && styles.pressed,
              ]}
            >
              <MealImage
                path={meal.imagePath}
                uri={meal.imagePath ? imageUrls[meal.imagePath] : undefined}
                mealType={meal.mealType}
                width="100%"
                aspectRatio={4 / 3}
                radius={0}
                symbolSize={26}
              />
              <View style={styles.caption}>
                <Text variant="footnote" weight="semibold" numberOfLines={2}>
                  {meal.name}
                </Text>
                {type ? (
                  <Text variant="caption" color="inkMuted">
                    {type.label}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { paddingHorizontal: 16 },
  row: { gap: 10, paddingHorizontal: 16 },
  card: { width: 128, overflow: 'hidden' },
  caption: { gap: 1, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  pressed: { opacity: 0.75 },
});
