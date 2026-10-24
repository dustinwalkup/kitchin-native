import { type ReactElement, type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  type RefreshControlProps,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/ui/text';

import { COPY } from '../constants';
import { filterMeals, type Library, type Meal } from '../domain';
import {
  EmptyLibrary,
  LoadError,
  NoMatch,
  SkeletonRows,
  WaitingForConnection,
} from './library-states';
import { MealRow, type MealRowProps } from './meal-row';
import { SearchField } from './search-field';
import { TagFilter } from './tag-filter';

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
  /** The empty library's action: Add meal, or "+ Add new meal" in the picker (R40.9, R45.12). */
  emptyAction: { label: string; onPress: () => void };
  /**
   * The meal just saved, with its `lastSaved` hand-off ID, for the Just saved row (DD55). The row
   * shows until the member changes the search or tags; the screen passes null once they leave.
   */
  justSaved?: { id: number; mealId: string } | null;
  /** Follows the search as it changes, so the screen can start a new meal's name from it (R42.6). */
  onSearchChange?: (search: string) => void;
  /** Shown above the search, such as the picker's "+ Add new meal" (§3.10). */
  header?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
}

const NO_TAGS: ReadonlySet<string> = new Set();

/**
 * The library's meals with a search, Filter by tags and Clear filters, shared by the library and
 * the picker (N29, DD53). The search and selected tags live here, so a new browser starts with
 * neither, and the screen underneath a form keeps both (R41.9, R45.11).
 *
 * The search and filter scroll with the list, so an open filter can't crowd out the meals at large
 * text sizes (N12). They're hidden until there are meals to search (R40.9).
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
  header,
  refreshControl,
}: MealBrowserProps) {
  const { meals, tags, tagsById } = library;
  const [query, setQuery] = useState('');
  const [tagIds, setTagIds] = useState(NO_TAGS);
  // The hand-off ID of a Just saved row the member has since changed the filters under (DD55).
  const [dismissedId, setDismissedId] = useState<number | null>(null);

  // Filtering 300 meals is well inside a keystroke's 100 ms (N25), and the rows are memoised.
  const visible = useMemo(() => filterMeals(meals, { query, tagIds }), [meals, query, tagIds]);
  const filtering = query !== '' || tagIds.size > 0;
  const justSavedMeal =
    justSaved !== null && justSaved.id !== dismissedId
      ? meals.find((meal) => meal.id === justSaved.mealId)
      : undefined;

  function changeFilters(nextQuery: string, nextTagIds: ReadonlySet<string>) {
    if (nextQuery !== query) onSearchChange?.(nextQuery);
    setQuery(nextQuery);
    setTagIds(nextTagIds);
    // Any change to the search or tags ends the Just saved row (DD55).
    if (justSaved !== null) setDismissedId(justSaved.id);
  }

  function toggleTag(id: string) {
    const next = new Set(tagIds);
    if (!next.delete(id)) next.add(id);
    changeFilters(query, next);
  }

  // R41.7
  const clearFilters = () => changeFilters('', NO_TAGS);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Meal>) => (
      <MealRow
        meal={item}
        tagsById={tagsById}
        hint={rowHint}
        onPress={onPressMeal}
        onDelete={onDeleteMeal}
        disclosure={rowDisclosure}
      />
    ),
    [tagsById, rowHint, onPressMeal, onDeleteMeal, rowDisclosure],
  );

  const empty = status === 'ready' && meals.length === 0;
  const searchable = status === 'ready' && !empty;
  // The empty library offers its own action, so the picker doesn't show "+ Add new meal" twice.
  const top = empty ? null : header;

  return (
    <FlatList
      testID="library-list"
      data={visible}
      keyExtractor={(meal) => meal.id}
      renderItem={renderItem}
      ItemSeparatorComponent={RowGap}
      // An element, not a component, so the search field keeps focus as the list redraws.
      ListHeaderComponent={
        top || searchable ? (
          <View style={styles.header}>
            {top}
            {searchable ? (
              <>
                <SearchField value={query} onChangeText={(text) => changeFilters(text, tagIds)} />
                <TagFilter
                  tags={tags}
                  selected={tagIds}
                  onToggle={toggleTag}
                  action={filtering ? <ClearFiltersButton onPress={clearFilters} /> : null}
                />
                {justSavedMeal ? (
                  <JustSaved
                    meal={justSavedMeal}
                    tagsById={tagsById}
                    hint={rowHint}
                    onPress={onPressMeal}
                    onDelete={onDeleteMeal}
                    disclosure={rowDisclosure}
                  />
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

/** The meal just saved, above the list whatever the filters; it's in its usual place too (DD55). */
function JustSaved(props: MealRowProps) {
  return (
    <View testID="library-just-saved" style={styles.justSaved}>
      <Text variant="footnote" color="inkMuted" bold accessibilityRole="header" style={styles.caps}>
        {COPY.justSaved}
      </Text>
      <MealRow {...props} />
    </View>
  );
}

/** Shown beside Filter by tags while there's a search or a selected tag (R41.7). */
function ClearFiltersButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      testID="library-clear-filters"
      accessibilityRole="button"
      accessibilityLabel={COPY.clearFilters}
      onPress={onPress}
      style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
    >
      {/* Terracotta carries text only in bold (N13). */}
      <Text variant="subhead" color="accent" bold>
        {COPY.clearFilters}
      </Text>
    </Pressable>
  );
}

function RowGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  fill: { flexGrow: 1 },
  header: { gap: 12, paddingBottom: 12 },
  justSaved: { gap: 8 },
  caps: { textTransform: 'uppercase', letterSpacing: 0.5 },
  gap: { height: 12 },
  clear: {
    minHeight: 44,
    minWidth: 44,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
