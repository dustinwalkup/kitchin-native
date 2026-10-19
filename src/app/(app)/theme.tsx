import { ScrollView, StyleSheet, View } from 'react-native';

import type { CategoryKey } from '@/features/groceries/constants';
import { Card } from '@/ui/card';
import { CategoryBadge } from '@/ui/category-badge';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import type { ColourToken, Theme } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Every colour token as a labelled swatch, to compare with the legacy app (R15.3, R16.1). */
export default function ThemePreview() {
  const theme = useTheme();
  const colours = (Object.keys(theme) as (keyof Theme)[]).filter(
    (key): key is ColourToken => typeof theme[key] === 'string',
  );
  const categories = Object.keys(theme.category) as CategoryKey[];

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headline">Colours</Text>
        <Card style={styles.list}>
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
        </Card>

        <Text variant="headline">Category badges</Text>
        <Card style={styles.list}>
          {categories.map((category) => (
            <View key={category} style={styles.row} accessible>
              <CategoryBadge category={category} label={category} />
              <Text variant="footnote" color="inkMuted" style={styles.value}>
                {theme.category[category].fg} on {theme.category[category].bg}
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  value: { marginLeft: 'auto' },
});
