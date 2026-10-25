import { type ReactElement, type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  type ListRenderItemInfo,
  type RefreshControlProps,
  StyleSheet,
  View,
} from 'react-native';

import type { MealType } from '@/features/meals/constants';
import { Divider, SectionHeader } from '@/ui/group';
import { SearchField } from '@/ui/search-field';

import { COPY } from '../constants';
import { filterMeals, type Library, type Meal } from '../domain';
import { useMealImageUrls } from '../hooks';
import {
  EmptyLibrary,
  LoadError,
  NoMatch,
  SkeletonRows,
  WaitingForConnection,
} from './library-states';
import { MealFilters } from './meal-filters';
import { MealRow, type MealRowProps } from './meal-row';
import { RecentMeals } from './recent-meals';

export interface MealBrowserProps {
  library: Library;
  /** The library query's state, as `useLibrary` gives it (design §3.4). */
  status: 'loading' | 'ready' | 'error' | 'waiting';
  onRetry: () => void;
  /**
   * A tap on a meal: open it in the form (R40.7) or choose it (R45.3). It should be stable, so the
   * memoised rows don't redraw as the member types (N25).
   */
  onPressMeal: (meal: Meal) => void;
  /** What a tap does, for VoiceOver, such as "Chooses this meal". */
  rowHint: string;
  /** Swipe to delete on every row, in the library only (R44.8). The picker never deletes (R45.10). */
  onDeleteMeal?: (meal: Meal) => void;
  /** A chevron on every row, where a tap opens the meal (R40.7). */
  rowDisclosure?: boolean;
  /** The empty library's action: Add meal, or New meal in the picker (R40.9, R45.12). */
  emptyAction: { label: string; onPress: () => void };
  /**
   * The meal just saved, with its `lastSaved` hand-off ID, for the Just saved row (DD55). The row
   * shows only while the search or filters hide the meal, and until the member changes them; the
   * screen passes null once they leave.
   */
  justSaved?: { id: number; mealId: string } | null;
  /** Follows the search as it changes, so the screen can start a new meal's name from it (R42.6). */
  onSearchChange?: (search: string) => void;
  /** The meals planned most recently, shown as cards above the list until a filter is set (DD-R10). */
  recent?: Meal[];
  /** Shown above the search, such as the picker's New meal (§3.10). Hidden while the library is empty. */
  header?: ReactNode;
  /** Shown at the top in every state, such as the plan sheet's mode switch (design §5.4). */
  persistentHeader?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
}

const NO_TAGS: ReadonlySet<string> = new Set();

/**
 * The library's meals with a search and one row of type and tag filters, shared by the library and
 * the picker (N29, DD53, specs/redesign/design.md §5.2). The search and filters live here, so a new
 * browser starts with neither, and the screen underneath a form keeps both (R41.9, R45.11). The
 * library's default shows every meal, of any type, so a filter never hides a meal from a slot it
 * wasn't saved for.
 *
 * The search and filters scroll with the list, so they can't crowd out the meals at large text
 * sizes (N12). They're hidden until there are meals to search (R40.9).
 */
export function MealBrowser({
  library,
  status,
  onRetry,
  onPressMeal,
  rowHint,
  onDeleteMeal,
  rowDisclosure = false,
  emptyAction,
  justSaved = null,
  onSearchChange,
  recent = [],
  header,
  persistentHeader,
  refreshControl,
}: MealBrowserProps) {
  const { meals, tags, tagsById } = library;
  const [query, setQuery] = useState('');
  const [tagIds, setTagIds] = useState(NO_TAGS);
  const [mealType, setMealType] = useState<MealType | null>(null);
  // The hand-off ID of a Just saved row the member has since changed the filters under (DD55).
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const imageUrls = useMealImageUrls(useMemo(() => meals.map((meal) => meal.imagePath), [meals]));

  // Filtering 300 meals is well inside a keystroke's 100 ms (N25), and the rows are memoised.
  const visible = useMemo(
    () => filterMeals(meals, { query, tagIds, mealType }),
    [meals, query, tagIds, mealType],
  );
  const filtering = query !== '' || tagIds.size > 0 || mealType !== null;
  // Only while the search or filters hide the meal, so it never shows twice (DD55).
  const justSavedMeal =
    justSaved !== null &&
    justSaved.id !== dismissedId &&
    !visible.some((meal) => meal.id === justSaved.mealId)
      ? meals.find((meal) => meal.id === justSaved.mealId)
      : undefined;

  function changeFilters(
    nextQuery: string,
    nextTagIds: ReadonlySet<string>,
    nextType: MealType | null,
  ) {
    if (nextQuery !== query) onSearchChange?.(nextQuery);
    setQuery(nextQuery);
    setTagIds(nextTagIds);
    setMealType(nextType);
    // Any change to the search or filters ends the Just saved row (DD55).
    if (justSaved !== null) setDismissedId(justSaved.id);
  }

  function toggleTag(id: string) {
    const next = new Set(tagIds);
    if (!next.delete(id)) next.add(id);
    changeFilters(query, next, mealType);
  }

  // R41.7
  const clearFilters = () => changeFilters('', NO_TAGS, null);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Meal>) => (
      <MealRow
        meal={item}
        tagsById={tagsById}
        imageUri={item.imagePath ? imageUrls[item.imagePath] : undefined}
        hint={rowHint}
        onPress={onPressMeal}
        onDelete={onDeleteMeal}
        disclosure={rowDisclosure}
      />
    ),
    [tagsById, imageUrls, rowHint, onPressMeal, onDeleteMeal, rowDisclosure],
  );

  const empty = status === 'ready' && meals.length === 0;
  const searchable = status === 'ready' && !empty;
  // The empty library offers its own action, so the picker doesn't show New meal twice.
  const top = empty ? null : header;
  const showRecent = searchable && !filtering && recent.length > 0;

  return (
    <FlatList
      testID="library-list"
      data={visible}
      keyExtractor={(meal) => meal.id}
      renderItem={renderItem}
      ItemSeparatorComponent={RowDivider}
      // An element, not a component, so the search field keeps focus as the list redraws.
      ListHeaderComponent={
        persistentHeader || top || searchable ? (
          <View style={styles.header}>
            {persistentHeader}
            {top}
            {searchable ? (
              <>
                <View style={styles.search}>
                  <SearchField
                    testID="library-search"
                    label={COPY.search}
                    value={query}
                    onChangeText={(text) => changeFilters(text, tagIds, mealType)}
                  />
                </View>
                <MealFilters
                  mealType={mealType}
                  onMealType={(type) => changeFilters(query, tagIds, type)}
                  tags={tags}
                  selectedTagIds={tagIds}
                  onToggleTag={toggleTag}
                  onClear={filtering ? clearFilters : undefined}
                />
                {showRecent ? (
                  <RecentMeals
                    meals={recent}
                    imageUrls={imageUrls}
                    onPress={onPressMeal}
                    hint={rowHint}
                  />
                ) : null}
                {justSavedMeal ? (
                  <JustSaved
                    meal={justSavedMeal}
                    tagsById={tagsById}
                    imageUri={
                      justSavedMeal.imagePath ? imageUrls[justSavedMeal.imagePath] : undefined
                    }
                    hint={rowHint}
                    onPress={onPressMeal}
                    onDelete={onDeleteMeal}
                    disclosure={rowDisclosure}
                  />
                ) : null}
                {showRecent && visible.length > 0 ? (
                  <View style={styles.listHeading}>
                    <SectionHeader title="All meals" />
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        <BrowserState
          status={status}
          empty={empty}
          onRetry={onRetry}
          emptyAction={emptyAction}
          onClearFilters={clearFilters}
        />
      }
      // The first tap on a row opens it, rather than only closing the keyboard.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={refreshControl}
      contentContainerStyle={[styles.content, visible.length === 0 && styles.fill]}
    />
  );
}

/** What shows in place of the meals, by the library's state (§3.8). */
function BrowserState({
  status,
  empty,
  onRetry,
  emptyAction,
  onClearFilters,
}: Pick<MealBrowserProps, 'status' | 'onRetry' | 'emptyAction'> & {
  empty: boolean;
  onClearFilters: () => void;
}) {
  switch (status) {
    case 'loading':
      return <SkeletonRows />; // R40.8
    case 'waiting':
      return <WaitingForConnection />; // R13.1; the Screen shows the offline banner
    case 'error':
      return <LoadError onRetry={onRetry} />; // R40.10
    case 'ready':
      return empty ? (
        <EmptyLibrary actionLabel={emptyAction.label} onAction={emptyAction.onPress} /> // R40.9
      ) : (
        <NoMatch onClearFilters={onClearFilters} /> // R41.8
      );
  }
}

/** The meal just saved, above the list, when the search or filters leave it out of the list (DD55). */
function JustSaved(props: MealRowProps) {
  return (
    <View testID="library-just-saved" style={styles.justSaved}>
      <View style={styles.listHeading}>
        <SectionHeader title={COPY.justSaved} />
      </View>
      <MealRow {...props} />
    </View>
  );
}

function RowDivider() {
  return <Divider inset={86} />;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  fill: { flexGrow: 1 },
  header: { gap: 10, paddingTop: 4, paddingBottom: 6 },
  search: { paddingHorizontal: 16 },
  listHeading: { paddingHorizontal: 16, paddingTop: 6 },
  justSaved: { gap: 2 },
});
