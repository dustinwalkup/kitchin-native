// The grocery list query and its optimistic mutations (design §3.5.3). Screens use these hooks and
// never touch api.ts or Supabase themselves (§2.2).
import {
  queryOptions,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo } from 'react';

import { useHousehold } from '@/features/household/household-provider';
import { type ApiError, classifyError, isRetryable } from '@/lib/errors';
import { report, reportOnce } from '@/lib/reporting';
import { useToast } from '@/lib/toast';

import {
  clearCheckedItems,
  deleteItem,
  fetchList,
  insertItem,
  setItemChecked,
  setItemQuantity,
  uncheckAllItems,
} from './api';
import type { CategoryKey } from './constants';
import {
  buildSections,
  type GroceryItem,
  type GroceryItemRow,
  parseItemRow,
  progress,
  type Progress,
  type Section,
} from './domain';

export const groceryKeys = {
  all: (hid: string) => ['household', hid, 'grocery'] as const,
  list: (hid: string) => ['household', hid, 'grocery', 'list'] as const,
};
const mutationKey = (listId: string) => ['grocery-mutation', listId] as const;
// One scope per list, so its mutations run one at a time, in the order they were made (DD15).
const scope = (listId: string) => ({ id: `grocery:${listId}` });

// The cache holds the rows as fetched; `select` parses them for each render.
type ListData = Awaited<ReturnType<typeof fetchList>>;
type Rows = GroceryItemRow[];

function listQuery(householdId: string | null) {
  return queryOptions({
    // The key for a missing household is never fetched, because of skipToken.
    queryKey: groceryKeys.list(householdId ?? ''),
    queryFn: householdId === null ? skipToken : () => fetchList(householdId),
  });
}

function useHouseholdId(): string | null {
  const household = useHousehold();
  return household.status === 'ready' ? household.household.id : null;
}

// Rows that don't parse are left out (14.8) and reported once each; an unknown category is shown
// under Other (14.7) and reported once per value (§6). reportOnce does the deduplicating.
function selectList(data: ListData) {
  const items: GroceryItem[] = [];
  const reportKeys: string[] = [];
  for (const row of data.rows) {
    const parsed = parseItemRow(row);
    if (!parsed.ok) {
      reportKeys.push(`invalid_row:${parsed.id}:${parsed.field}`);
      continue;
    }
    if (parsed.unknownCategory) reportKeys.push(`unknown_category:${row.category}`);
    items.push(parsed.item);
  }
  return {
    listId: data.listId,
    items,
    sections: buildSections(items),
    progress: progress(items),
    reportKeys,
  };
}

const EMPTY = { items: [], sections: [], progress: progress([]) };

export interface GroceryList {
  listId: string | undefined;
  items: GroceryItem[];
  sections: Section[];
  progress: Progress;
  status: 'loading' | 'ready' | 'error' | 'waiting';
  /** Reloads the list. Resolves once the fetch has finished, which pull to refresh waits for. */
  refetch(): Promise<void>;
  isRefetching: boolean;
  /**
   * When the latest fetch failed while the loaded items stay on screen (R4.10), so the screen can
   * tell each failure apart. Null otherwise, including when nothing has loaded (`status: 'error'`).
   */
  refreshFailedAt: number | null;
}

export function useGroceryList(): GroceryList {
  const householdId = useHouseholdId();
  const { data, error, errorUpdatedAt, fetchStatus, refetch, isRefetching } = useQuery({
    ...listQuery(householdId),
    select: selectList,
  });

  // The facade drops what isn't reportable, such as network errors (R26.2).
  useEffect(() => {
    if (error) report(error);
  }, [error]);

  const reportKeys = data?.reportKeys;
  useEffect(() => {
    reportKeys?.forEach((key) => reportOnce(key));
  }, [reportKeys]);

  // Loaded data stays on screen while a later refetch is offline or fails (R4.10).
  let status: GroceryList['status'] = 'loading';
  if (data) status = 'ready';
  else if (fetchStatus === 'paused')
    status = 'waiting'; // R13.1
  else if (error) status = 'error';

  return {
    listId: data?.listId,
    items: data?.items ?? EMPTY.items,
    sections: data?.sections ?? EMPTY.sections,
    progress: data?.progress ?? EMPTY.progress,
    status,
    refetch: async () => {
      await refetch();
    },
    isRefetching,
    refreshFailedAt: data && error ? errorUpdatedAt : null,
  };
}

// Mutations

interface ListRef {
  householdId: string;
  listId: string;
}

function useListRef(): ListRef | null {
  const householdId = useHouseholdId();
  const { data: listId } = useQuery({ ...listQuery(householdId), select: (d) => d.listId });
  return useMemo(
    () => (householdId !== null && listId !== undefined ? { householdId, listId } : null),
    [householdId, listId],
  );
}

/** Reverses one mutation's optimistic change on the rows as they are now (DD14). */
type Undo = (rows: Rows) => Rows;

interface Optimistic {
  rows: Rows;
  undo: Undo;
  /** The affected item, for the known outcomes below. */
  id?: string;
  name?: string;
}

/**
 * Expected failures. `duplicate`: undo, and say the name is already on the list (5.6, edge case
 * 22). `gone`: another device deleted the item, so remove it too (12.5). `changed`: undo, and say
 * the other device changed the list (10.10). None is reported.
 */
type Outcome = 'duplicate' | 'gone' | 'changed' | undefined;

interface MutationSpec<V> {
  mutationFn: (v: V, list: ListRef) => Promise<unknown>;
  optimistic: (rows: Rows, v: V, list: ListRef) => Optimistic;
  outcome?: (error: ApiError) => Outcome;
}

const keep: Undo = (rows) => rows;

function patchRow(rows: Rows, id: string, change: Partial<GroceryItemRow>): Rows {
  return rows.map((r) => (r.id === id ? { ...r, ...change } : r));
}

// A re-insert skips rows that are back already, so it never overwrites a newer copy.
function reinsert(rows: Rows, removed: Rows): Rows {
  const present = new Set(rows.map((r) => r.id));
  return [...rows, ...removed.filter((r) => !present.has(r.id))];
}

const isOpenNameDuplicate = (e: ApiError) =>
  e.category === 'conflict_duplicate' && e.meta.constraint === 'grocery_items_one_open_per_name';

/**
 * The shared lifecycle (design §3.5.3): an optimistic change with an undo for the affected item
 * only, the known outcomes, a Retry toast for anything else, and one refetch after the last
 * mutation settles. Calls made before the list has loaded are ignored; the screens offer no
 * actions until then.
 */
function useGroceryMutation<V>(spec: MutationSpec<V>): (v: V) => void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useListRef();
  const listKey = groceryKeys.list(list?.householdId ?? '');
  const key = mutationKey(list?.listId ?? '');

  const setRows = (change: (rows: Rows) => Rows) =>
    queryClient.setQueryData<ListData>(listKey, (data) =>
      data ? { ...data, rows: change(data.rows) } : data,
    );

  const { mutate } = useMutation({
    mutationKey: key,
    scope: scope(list?.listId ?? ''),
    networkMode: 'online', // pauses while offline (13.2)
    // Up to 3 retries, with back-off, and only for network failures (R14.1).
    retry: (failureCount, error) => isRetryable(classifyError(error)) && failureCount < 3,
    mutationFn: (v: V) => spec.mutationFn(v, list!),

    onMutate: async (v: V) => {
      // A refetch already on its way would overwrite the optimistic change.
      await queryClient.cancelQueries({ queryKey: listKey });
      const data = queryClient.getQueryData<ListData>(listKey);
      if (!data) return { undo: keep };
      const { rows, ...applied } = spec.optimistic(data.rows, v, list!);
      queryClient.setQueryData<ListData>(listKey, { ...data, rows });
      return applied; // 12.1
    },

    onError: (e, v, applied) => {
      const error = classifyError(e);
      const undo = () => setRows(applied?.undo ?? keep);
      switch (spec.outcome?.(error)) {
        case 'duplicate':
          undo();
          toast.show({ message: `${applied?.name ?? 'That item'} is already on the list` });
          return;
        case 'gone':
          setRows((rows) => rows.filter((r) => r.id !== applied?.id));
          toast.show({ message: 'That item was removed on another device' });
          return;
        case 'changed':
          undo();
          toast.show({ message: 'The list changed on another device, so nothing was unchecked' });
          return;
      }
      undo();
      // Repeating a forbidden change fails the same way, so it gets no Retry (R14.3).
      if (error.category === 'forbidden') {
        toast.show({ message: "You don't have access to that" });
      } else {
        // The same variables, and so for an add the same id, keep the retry idempotent (12.3).
        toast.show({
          message: "Couldn't save that change",
          action: { label: 'Retry', onPress: () => mutate(v) },
        });
      }
      report(error); // 12.2
    },

    // Only the last pending mutation refetches, which reconciles with the server (12.6) and picks
    // up remote changes that the realtime handler deferred meanwhile (11.5).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: key }) === 1) {
        void queryClient.invalidateQueries({ queryKey: listKey });
      }
    },
  });

  return useCallback(
    (v: V) => {
      if (list) mutate(v);
    },
    [list, mutate],
  );
}

export function useAddItem(): (v: {
  name: string;
  category: CategoryKey;
  quantity: string | null;
}) => void {
  const add = useGroceryMutation<{
    id: string;
    name: string;
    category: CategoryKey;
    quantity: string | null;
  }>({
    mutationFn: (v, list) =>
      insertItem({ ...v, householdId: list.householdId, listId: list.listId }).catch(
        (e: ApiError) => {
          // A duplicate id means an earlier attempt already inserted this item (12.3).
          if (e.category === 'conflict_duplicate' && e.meta.constraint === 'grocery_items_pkey') {
            return;
          }
          throw e;
        },
      ),
    optimistic: (rows, v, list) => ({
      rows: rows.some((r) => r.id === v.id)
        ? rows
        : [
            ...rows,
            {
              id: v.id,
              list_id: list.listId,
              name: v.name,
              category: v.category,
              quantity: v.quantity,
              is_checked: false,
              checked_at: null,
              created_at: new Date().toISOString(),
            },
          ],
      undo: (current) => current.filter((r) => r.id !== v.id),
      id: v.id,
      name: v.name,
    }),
    outcome: (e) => (isOpenNameDuplicate(e) ? 'duplicate' : undefined),
  });
  // The id is made on the phone, once per add, so a retry can't create a second item (12.3).
  return useCallback((v) => add({ ...v, id: randomUUID() }), [add]);
}

export function useSetChecked(): (v: { id: string; isChecked: boolean }) => void {
  return useGroceryMutation<{ id: string; isChecked: boolean }>({
    mutationFn: ({ id, isChecked }) => setItemChecked(id, isChecked),
    optimistic: (rows, { id, isChecked }) => {
      const before = rows.find((r) => r.id === id);
      // Checking a checked item keeps the first check time, as the database does (7.4).
      const checkedAt = before?.is_checked ? before.checked_at : new Date().toISOString();
      return {
        rows: patchRow(rows, id, {
          is_checked: isChecked,
          checked_at: isChecked ? checkedAt : null,
        }),
        undo: before
          ? (current) =>
              patchRow(current, id, {
                is_checked: before.is_checked,
                checked_at: before.checked_at,
              })
          : keep,
        id,
        name: before?.name,
      };
    },
    outcome: (e) =>
      e.category === 'not_found' ? 'gone' : isOpenNameDuplicate(e) ? 'duplicate' : undefined,
  });
}

export function useSetQuantity(): (v: { id: string; quantity: string | null }) => void {
  return useGroceryMutation<{ id: string; quantity: string | null }>({
    mutationFn: ({ id, quantity }) => setItemQuantity(id, quantity),
    optimistic: (rows, { id, quantity }) => {
      const before = rows.find((r) => r.id === id);
      return {
        rows: patchRow(rows, id, { quantity }),
        undo: before ? (current) => patchRow(current, id, { quantity: before.quantity }) : keep,
        id,
      };
    },
    outcome: (e) => (e.category === 'not_found' ? 'gone' : undefined),
  });
}

export function useDeleteItem(): (v: { id: string }) => void {
  return useGroceryMutation<{ id: string }>({
    // Deleting an item that's already gone succeeds (9.3), so there are no known outcomes.
    mutationFn: ({ id }) => deleteItem(id),
    optimistic: (rows, { id }) => {
      const removed = rows.filter((r) => r.id === id);
      return {
        rows: rows.filter((r) => r.id !== id),
        undo: (current) => reinsert(current, removed),
      };
    },
  });
}

export function useClearChecked(): () => void {
  const clear = useGroceryMutation<void>({
    mutationFn: (_, list) => clearCheckedItems(list.listId),
    optimistic: (rows) => {
      const removed = rows.filter((r) => r.is_checked);
      return {
        rows: rows.filter((r) => !r.is_checked),
        undo: (current) => reinsert(current, removed),
      };
    },
  });
  return useCallback(() => clear(), [clear]);
}

/** `keepIds` are the checked items that stay checked, from `planUncheckAll` (R10.7). */
export function useUncheckAll(): (v: { keepIds: string[] }) => void {
  return useGroceryMutation<{ keepIds: string[] }>({
    mutationFn: ({ keepIds }, list) => uncheckAllItems(list.listId, keepIds),
    optimistic: (rows, { keepIds }) => {
      const keep = new Set(keepIds);
      const before = new Map(
        rows.filter((r) => r.is_checked && !keep.has(r.id)).map((r) => [r.id, r]),
      );
      return {
        rows: rows.map((r) =>
          before.has(r.id) ? { ...r, is_checked: false, checked_at: null } : r,
        ),
        // Puts back only the checked state, so a quantity edit made meanwhile survives (DD14).
        undo: (current) =>
          current.map((r) => {
            const b = before.get(r.id);
            return b ? { ...r, is_checked: b.is_checked, checked_at: b.checked_at } : r;
          }),
      };
    },
    // Another device opened an item with the same name after this phone planned the uncheck (10.10).
    outcome: (e) => (isOpenNameDuplicate(e) ? 'changed' : undefined),
  });
}
