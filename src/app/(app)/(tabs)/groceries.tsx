import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import {
  ADD_ITEM_BUTTON_CLEARANCE,
  AddItemButton,
} from '@/features/groceries/components/add-item-button';
import { CategorySectionHeader } from '@/features/groceries/components/category-section-header';
import { ItemRow } from '@/features/groceries/components/item-row';
import {
  confirmClearChecked,
  confirmUncheckAll,
} from '@/features/groceries/components/list-actions';
import {
  GroceriesEmptyState,
  LoadError,
  WaitingForConnection,
} from '@/features/groceries/components/list-states';
import { ProgressHeader } from '@/features/groceries/components/progress-header';
import { SkeletonRows } from '@/features/groceries/components/skeleton-rows';
import type { CategoryKey } from '@/features/groceries/constants';
import { planUncheckAll, visibleSections } from '@/features/groceries/domain';
import {
  type GroceryList,
  useClearChecked,
  useDeleteItem,
  useGroceryList,
  useSetChecked,
  useSetQuantity,
  useUncheckAll,
} from '@/features/groceries/hooks';
import { ReconnectingPill } from '@/features/household/components/reconnecting-pill';
import { useIsOnline } from '@/lib/query-client';
import { useToast } from '@/lib/toast';
import { useStoredFlag } from '@/lib/use-stored-flag';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { FormScrollView } from '@/ui/form-scroll-view';
import { Screen } from '@/ui/screen';
import { useTheme } from '@/ui/use-theme';

const NONE_COLLAPSED: ReadonlySet<CategoryKey> = new Set();

/**
 * The household's list by store section, built for a phone held in one hand in the shop (R4, R13.1,
 * specs/redesign/design.md §4.1): a compact progress panel, sections that collapse, and rows that
 * check with a tap anywhere on them.
 */
export default function Groceries() {
  const theme = useTheme();
  const router = useRouter();
  const list = useGroceryList();
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  useRefreshFailedToast(list);
  // Once here rather than in each row: a list can have hundreds of rows (N3).
  const setChecked = useSetChecked();
  const setQuantity = useSetQuantity();
  const deleteItem = useDeleteItem();
  const clearChecked = useClearChecked();
  const uncheckAll = useUncheckAll();
  const { uncheckIds, keepIds } = planUncheckAll(list.items);
  const [hideChecked, setHideChecked] = useStoredFlag('groceries.hideChecked', false);
  const [collapsed, setCollapsed] = useState(NONE_COLLAPSED);

  const sections = visibleSections(list.sections, { hideChecked, collapsed });
  const openAddItem = () => router.push('/add-item');
  const { checked } = list.progress;

  // Stable, so the memoised rows don't redraw as the list changes around them (N3).
  const openEdit = useCallback(
    (id: string) => router.push({ pathname: '/edit-item', params: { id } }),
    [router],
  );
  const toggleSection = useCallback((category: CategoryKey) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });
  }, []);

  return (
    <Screen edges={['left', 'right']}>
      <Tabs.Screen
        options={{
          // Beside the title, where it doesn't cover the list (§3.4, R13.4).
          headerRight: () => <ReconnectingPill />,
        }}
      />
      <SectionList
        testID="groceries-list"
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <CategorySectionHeader
            category={section.category}
            openCount={section.openCount}
            collapsed={section.collapsed}
            onToggle={toggleSection}
          />
        )}
        renderItem={({ item, index, section }) => (
          <ItemRow
            item={item}
            first={index === 0}
            last={index === section.data.length - 1}
            onSetChecked={setChecked}
            onSetQuantity={setQuantity}
            onDelete={deleteItem}
            onEdit={openEdit}
          />
        )}
        ListHeaderComponent={
          list.progress.total > 0 ? (
            <ProgressHeader
              progress={list.progress}
              hideChecked={hideChecked}
              onHideCheckedChange={setHideChecked}
              uncheckCount={uncheckIds.length}
              onUncheckAll={() =>
                confirmUncheckAll(uncheckIds.length, () => uncheckAll({ keepIds }))
              }
              onClearChecked={() => confirmClearChecked(checked, clearChecked)}
            />
          ) : undefined
        }
        ListFooterComponent={
          list.status === 'ready' && hideChecked && checked > 0 ? (
            <ShowChecked count={checked} onPress={() => setHideChecked(false)} />
          ) : undefined
        }
        ListEmptyComponent={
          list.status === 'ready' && list.items.length > 0 ? (
            // Everything is checked and hidden.
            <EmptyState
              testID="groceries-all-hidden"
              emoji="🎉"
              title="Everything's checked off"
              fill={false}
            />
          ) : (
            <ListState status={list.status} onRetry={list.refetch} onAdd={openAddItem} />
          )
        }
        // Headers sit on the ivory page with no fill, so a pinned one would overlap the rows.
        stickySectionHeadersEnabled={false}
        // Enough rows to fill a Pro Max screen on the first frame (N3).
        initialNumToRender={20}
        // Scrolling, or a tap elsewhere, closes the quantity editor, which saves it (R8.3).
        keyboardDismissMode="on-drag"
        // Keeps a row's quantity editor clear of the keyboard toolbar.
        renderScrollComponent={(props) => <FormScrollView {...props} />}
        contentContainerStyle={list.items.length === 0 ? styles.fill : styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.inkMuted}
          />
        }
      />
      {/* Adding needs the loaded list, to check for an item that's already on it (R5.6). */}
      {list.status === 'ready' ? <AddItemButton onPress={openAddItem} /> : null}
    </Screen>
  );
}

/** Below the last section while checked items are hidden: how many, and a way to show them. */
function ShowChecked({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <View style={styles.footer}>
      <Button
        testID="show-checked"
        variant="text"
        size="small"
        label={`Show ${count} checked ${count === 1 ? 'item' : 'items'}`}
        onPress={onPress}
      />
    </View>
  );
}

/** What shows in place of the sections, by the list's state (§3.4). */
function ListState({
  status,
  onRetry,
  onAdd,
}: Pick<GroceryList, 'status'> & { onRetry: () => void; onAdd: () => void }) {
  switch (status) {
    case 'loading':
      return <SkeletonRows />; // 4.9
    case 'waiting':
      return <WaitingForConnection />; // 13.1; the Screen shows the offline banner
    case 'error':
      return <LoadError onRetry={onRetry} />; // 4.10
    case 'ready':
      return <GroceriesEmptyState onAdd={onAdd} />; // 4.8
  }
}

/**
 * Pull to refresh reloads from the backend (R4.11). The spinner follows the member's own pull
 * only, so background refetches from live updates don't move the list. Offline, the fetch waits
 * for the connection, so the spinner goes away and the banner explains (R13.1).
 */
function usePullToRefresh(refetch: () => Promise<void>) {
  const isOnline = useIsOnline();
  const [pulling, setPulling] = useState(false);

  const onRefresh = async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  };

  return { refreshing: pulling && isOnline, onRefresh };
}

/** A failed reload keeps the loaded items on screen, and says so with a Retry (R4.10). */
function useRefreshFailedToast({ refreshFailedAt, refetch }: GroceryList) {
  const toast = useToast();
  const showToast = useEffectEvent(() =>
    toast.show({
      message: "Couldn't load groceries",
      action: { label: 'Retry', onPress: () => void refetch() },
    }),
  );

  useEffect(() => {
    if (refreshFailedAt !== null) showToast();
  }, [refreshFailedAt]);
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: ADD_ITEM_BUTTON_CLEARANCE },
  fill: { flexGrow: 1 },
  footer: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 16 },
});
