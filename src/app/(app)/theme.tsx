import { ScrollView, StyleSheet, View } from 'react-native';

import { CATEGORIES } from '@/features/groceries/constants';
import { MEAL_TYPES } from '@/features/meals/constants';
import { CountBadge } from '@/ui/count-badge';
import { Group } from '@/ui/group';
import { Screen } from '@/ui/screen';
import { Text, type TextVariant } from '@/ui/text';
import type { ColourToken, Theme } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { MealTypeIcon } from '@/features/meals/components/meal-type-icon';

const TYPE_SCALE: TextVariant[] = [
  'largeTitle',
  'title',
  'title2',
  'headline',
  'body',
  'callout',
  'subhead',
  'footnote',
  'caption',
  'eyebrow',
];

/**
 * The design system at a glance (R15.3, specs/redesign/design.md §2–§3): every colour token as a
 * labelled swatch, the type scale, the count badges, the grocery categories and the meal-type icons.
 * Development variant only.
 */
export default function ThemePreview() {
  const theme = useTheme();
  const colours = (Object.keys(theme) as (keyof Theme)[]).filter(
    (key): key is ColourToken => typeof theme[key] === 'string',
  );

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Group title="Colours">
          {colours.map((token) => (
            <View key={token} style={styles.row} accessible>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: theme[token], borderColor: theme.border },
                ]}
              />
              <Text>{token}</Text>
              <Text variant="footnote" color="inkMuted" style={styles.value}>
                {theme[token]}
              </Text>
            </View>
          ))}
        </Group>

        <Group title="Type">
          {TYPE_SCALE.map((variant) => (
            <View key={variant} style={styles.row}>
              <Text variant={variant} style={styles.flex}>
                {variant}
              </Text>
            </View>
          ))}
        </Group>

        <Group title="Badges and icons">
          <View style={styles.row}>
            <CountBadge label="4 left" />
            <CountBadge label="1/3" tone="neutral" />
            <CountBadge label="Today" tone="accent" />
          </View>
          <View style={styles.row}>
            {MEAL_TYPES.map(({ key }) => (
              <MealTypeIcon key={key} mealType={key} />
            ))}
          </View>
          <View style={[styles.row, styles.wrap]}>
            {CATEGORIES.map(({ key, emoji, label }) => (
              <Text key={key} variant="subhead">
                {emoji} {label}
              </Text>
            ))}
          </View>
        </Group>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  wrap: { flexWrap: 'wrap' },
  flex: { flex: 1 },
  swatch: { width: 36, height: 36, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  value: { marginLeft: 'auto' },
});
