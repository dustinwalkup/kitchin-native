import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import {
  ADD_ITEM_BUTTON_CLEARANCE,
  AddItemButton,
} from '@/features/groceries/components/add-item-button';
import { CategorySectionHeader } from '@/features/groceries/components/category-section-header';
import { ClearCheckedButton } from '@/features/groceries/components/clear-checked-button';
import { ItemRow } from '@/features/groceries/components/item-row';
import {
  GroceriesEmptyState,
  LoadError,
  WaitingForConnection,
} from '@/features/groceries/components/list-states';
import { ProgressHeader } from '@/features/groceries/components/progress-header';
import { SkeletonRows } from '@/features/groceries/components/skeleton-rows';
import { UncheckAllButton } from '@/features/groceries/components/uncheck-all-button';
import { planUncheckAll } from '@/features/groceries/domain';
import {
  type GroceryList,
  useClearChecked,
  useDeleteItem,
  useGroceryList,
  useSetChecked,
  useSetQuantity,
  useUncheckAll,
} from '@/features/groceries/hooks';
import { useIsOnline } from '@/lib/query-client';
import { useToast } from '@/lib/toast';
import { FormScrollView } from '@/ui/form-scroll-view';
import { Screen } from '@/ui/screen';
import { useTheme } from '@/ui/use-theme';

/** The household's list by store section, with its progress and loading states (R4, R13.1). */
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

  const sections = list.sections.map((section) => ({ ...section, data: section.items }));
  const openAddItem = () => router.push('/add-item');

  return (
    <Screen edges={['left', 'right']}>
      <SectionList
        testID="groceries-list"
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <CategorySectionHeader category={section.category} openCount={section.openCount} />
        )}
        renderItem={({ item, index, section }) => (
          <ItemRow
            item={item}
            first={index === 0}
            last={index === section.data.length - 1}
            onSetChecked={setChecked}
            onSetQuantity={setQuantity}
            onDelete={deleteItem}
          />
        )}
        ListHeaderComponent={
          list.progress.total > 0 ? (
            <ProgressHeader progress={list.progress}>
              <View style={styles.actions}>
                <UncheckAllButton
                  uncheckCount={uncheckIds.length}
                  onUncheck={() => uncheckAll({ keepIds })}
                />
                <ClearCheckedButton checkedCount={list.progress.checked} onClear={clearChecked} />
              </View>
            </ProgressHeader>
          ) : undefined
        }
        ListEmptyComponent={
          <ListState status={list.status} onRetry={list.refetch} onAdd={openAddItem} />
        }
        // Headers sit on the sand background with no fill, so a pinned one would overlap the rows.
        stickySectionHeadersEnabled={false}
        // Enough rows to fill a Pro Max screen on the first frame (N3).
        initialNumToRender={20}
        // Scrolling, or a tap elsewhere, closes the quantity editor, which saves it (R8.3).
        keyboardDismissMode="on-drag"
        // Keeps a row's quantity editor clear of the keyboard toolbar.
        renderScrollComponent={(props) => <FormScrollView {...props} />}
        contentContainerStyle={sections.length === 0 ? styles.fill : styles.content}
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
  // Apart, so the destructive Clear checked isn't a slip of the thumb away.
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  content: { paddingBottom: ADD_ITEM_BUTTON_CLEARANCE },
  fill: { flexGrow: 1 },
});
