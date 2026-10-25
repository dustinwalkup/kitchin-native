import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MEAL_TYPES, type MealType } from '@/features/meals/constants';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { useTheme } from '@/ui/use-theme';

import { COPY } from '../constants';
import type { Tag } from '../domain';
import { TagChip } from './tag-chip';

export interface MealFiltersProps {
  /** One type, or null for All. */
  mealType: MealType | null;
  onMealType: (mealType: MealType | null) => void;
  /** Every household tag, Family Favorite first, then alphabetical (R43.10, DD-R8). */
  tags: Tag[];
  selectedTagIds: ReadonlySet<string>;
  onToggleTag: (id: string) => void;
  /** Shown at the end while there's a search, a type or a tag (R41.7). */
  onClear?: () => void;
}

/** What VoiceOver reads for the bar's tags: "Filter by tags, 2 selected" (N27). */
export function filterLabel(count: number): string {
  return count === 0 ? COPY.filter : `${COPY.filter}, ${count} selected`;
}

/**
 * One scrolling row of filters (R41.2 as redesigned, specs/redesign/design.md §5.2): the meal types,
 * one at a time with All, then a hairline, then the tags, any number at once. Types and tags combine,
 * as tags and the search already did (K23). It scrolls sideways, so a long tag list or a large text
 * size never pushes the meals down the screen (N12).
 */
export function MealFilters({
  mealType,
  onMealType,
  tags,
  selectedTagIds,
  onToggleTag,
  onClear,
}: MealFiltersProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.bar}
      accessibilityLabel={filterLabel(selectedTagIds.size)}
    >
      <Chip
        testID="type-chip-all"
        label={COPY.allMeals}
        accessibilityLabel="All meals"
        selected={mealType === null}
        onPress={() => onMealType(null)}
      />
      {MEAL_TYPES.map(({ key, label, symbol, glyph }) => (
        <Chip
          key={key}
          testID={`type-chip-${key}`}
          label={label}
          selected={mealType === key}
          onPress={() => onMealType(mealType === key ? null : key)}
          leading={<SymbolView name={symbol} tintColor={theme[glyph]} size={12} />}
        />
      ))}
      {tags.length > 0 ? <View style={[styles.rule, { backgroundColor: theme.border }]} /> : null}
      {tags.map((tag) => (
        <TagChip
          key={tag.id}
          id={tag.id}
          name={tag.name}
          tagKey={tag.key}
          selected={selectedTagIds.has(tag.id)}
          onPress={() => onToggleTag(tag.id)}
        />
      ))}
      {onClear ? (
        <Button
          testID="library-clear-filters"
          label={COPY.clearFilters}
          variant="text"
          size="small"
          onPress={onClear}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  rule: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: 4 },
});
