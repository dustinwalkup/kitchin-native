import * as Sentry from '@sentry/react-native';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/errors';
import { queryClient as appQueryClient } from '@/lib/query-client';
import { report } from '@/lib/reporting';
import { makeRow } from '@/test/factories';

import {
  clearCheckedItems,
  deleteItem,
  fetchList,
  insertItem,
  setItemChecked,
  setItemQuantity,
  uncheckAllItems,
  updateItemDetails,
} from './api';
import type { GroceryItemRow } from './domain';
import {
  useAddItem,
  useClearChecked,
  useDeleteItem,
  useEditItem,
  useGroceryList,
  useSetChecked,
  useSetQuantity,
  useUncheckAll,
} from './hooks';

jest.mock('./api', () => ({
  fetchList: jest.fn(),
  insertItem: jest.fn(),
  setItemChecked: jest.fn(),
  setItemQuantity: jest.fn(),
  deleteItem: jest.fn(),
  clearCheckedItems: jest.fn(),
  uncheckAllItems: jest.fn(),
  updateItemDetails: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const mockShowToast = jest.fn();
jest.mock('@/lib/toast', () => ({ useToast: () => ({ show: mockShowToast }) }));

// `report` is a mock, so tests can assert on it. `reportOnce` is real, because its once-per-key
// behaviour is what U-MUT-18 checks; it ends at the global Sentry mock.
jest.mock('@/lib/reporting', () => ({
  ...jest.requireActual('@/lib/reporting'),
  report: jest.fn(),
}));

let mockHousehold: { status: string; household?: { id: string } } = {
  status: 'ready',
  household: { id: 'household-1' },
};
jest.mock('@/features/household/household-provider', () => ({
  useHousehold: () => mockHousehold,
}));

const LIST_ID = 'list-1';
const EARLIER = '2026-10-18T09:00:00+00:00';
const T = '2026-10-18T12:00:00+00:00';

const ROWS: GroceryItemRow[] = [
  makeRow({ id: 'bread', name: 'Bread', category: 'bakery', created_at: EARLIER }),
  makeRow({ id: 'bagels', name: 'Bagels', category: 'bakery', created_at: T }),
  makeRow({ id: 'rice', name: 'Rice', category: 'pantry', quantity: '1 kg' }),
  makeRow({ id: 'milk', name: 'Milk', category: 'dairy', is_checked: true, checked_at: T }),
  makeRow({ id: 'peas', name: 'Peas', category: 'frozen', is_checked: true, checked_at: T }),
];

// A fake backend behind the mocked api.ts, so the refetch after each mutation returns what the
// database would hold. A test overrides a call to make it fail or wait.
let server: GroceryItemRow[];
let apiCalls: string[];

function patchServer(id: string, change: Partial<GroceryItemRow>) {
  if (!server.some((r) => r.id === id)) {
    throw new ApiError('not_found', { table: 'grocery_items', operation: 'update', recordId: id });
  }
  server = server.map((r) => (r.id === id ? { ...r, ...change } : r));
}

const fail = (category: ConstructorParameters<typeof ApiError>[0], constraint?: string) =>
  new ApiError(category, { table: 'grocery_items', operation: 'test', constraint });

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let queryClient: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  mockHousehold = { status: 'ready', household: { id: 'household-1' } };
  server = ROWS.map((r) => ({ ...r }));
  apiCalls = [];

  let uuid = 0;
  jest.mocked(randomUUID).mockImplementation(() => `new-${++uuid}`);
  jest.mocked(fetchList).mockImplementation(async () => ({
    listId: LIST_ID,
    rows: server.map((r) => ({ ...r })),
  }));
  jest.mocked(insertItem).mockImplementation(async (v) => {
    apiCalls.push(`insert ${v.id}`);
    server.push(
      makeRow({
        id: v.id,
        name: v.name,
        category: v.category,
        quantity: v.quantity,
        created_at: T,
      }),
    );
  });
  jest.mocked(setItemChecked).mockImplementation(async (id, isChecked) => {
    apiCalls.push(`check ${id} ${isChecked}`);
    patchServer(id, { is_checked: isChecked, checked_at: isChecked ? T : null });
  });
  jest.mocked(setItemQuantity).mockImplementation(async (id, quantity) => {
    apiCalls.push(`quantity ${id} ${quantity}`);
    patchServer(id, { quantity });
  });
  jest.mocked(updateItemDetails).mockImplementation(async (id, changes) => {
    apiCalls.push(`edit ${id} ${JSON.stringify(changes)}`);
    patchServer(id, changes);
  });
  jest.mocked(deleteItem).mockImplementation(async (id) => {
    apiCalls.push(`delete ${id}`);
    server = server.filter((r) => r.id !== id);
  });
  jest.mocked(clearCheckedItems).mockImplementation(async () => {
    apiCalls.push('clear');
    const ids = server.filter((r) => r.is_checked).map((r) => r.id);
    server = server.filter((r) => !r.is_checked);
    return ids;
  });
  jest.mocked(uncheckAllItems).mockImplementation(async (_, keepIds) => {
    apiCalls.push('uncheck all');
    const ids = server.filter((r) => r.is_checked && !keepIds.includes(r.id)).map((r) => r.id);
    server = server.map((r) =>
      ids.includes(r.id) ? { ...r, is_checked: false, checked_at: null } : r,
    );
    return ids;
  });

  // The app's defaults, without the back-off delay between retries. `clear()` leaves 5-minute
  // garbage-collection timers behind (a settled mutation's, and the one a fetch still pending at
  // `clear()` schedules when it's cancelled), which would keep Jest from exiting. With an infinite
  // gcTime none is scheduled.
  const defaults = appQueryClient.getDefaultOptions();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { ...defaults.queries, retryDelay: 0, gcTime: Infinity },
      mutations: { ...defaults.mutations, retryDelay: 0, gcTime: Infinity },
    },
  });
});

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

function useGroceries() {
  return {
    list: useGroceryList(),
    add: useAddItem(),
    check: useSetChecked(),
    setQuantity: useSetQuantity(),
    edit: useEditItem(),
    remove: useDeleteItem(),
    clearChecked: useClearChecked(),
    uncheckAll: useUncheckAll(),
  };
}

async function renderGroceries({ waitForReady = true } = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(useGroceries, { wrapper });
  if (waitForReady) await waitFor(() => expect(hook.result.current.list.status).toBe('ready'));
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderGroceries>>;

const itemIds = ({ result }: Hook) => result.current.list.items.map((i) => i.id).sort();
const item = ({ result }: Hook, id: string) => result.current.list.items.find((i) => i.id === id);

/** Lets pending promises and timers run, for checks that something has *not* happened. */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 10)));

/**
 * Waits until every grocery mutation has settled and the follow-up refetch has finished. TanStack
 * tells React about cache changes on a timer, so the final render comes one flush later.
 */
async function settle() {
  await waitFor(() => {
    expect(queryClient.isMutating()).toBe(0);
    expect(queryClient.isFetching()).toBe(0);
  });
  await flush();
}

const lastToast = () => mockShowToast.mock.calls.at(-1)?.[0];

describe('useGroceryList', () => {
  it('exposes the list id, the parsed items, the sections and the progress', async () => {
    const hook = await renderGroceries();
    const { list } = hook.result.current;

    expect(list.listId).toBe(LIST_ID);
    expect(itemIds(hook)).toEqual(['bagels', 'bread', 'milk', 'peas', 'rice']);
    expect(list.sections.map((s) => s.category)).toEqual(['dairy', 'pantry', 'frozen', 'bakery']);
    expect(list.progress).toEqual({ checked: 2, total: 5, percent: 40 });
    expect(fetchList).toHaveBeenCalledWith('household-1');
  });

  it('U-MUT-19 is loading on the first fetch', async () => {
    jest.mocked(fetchList).mockReturnValue(new Promise(() => {}));
    const { result } = await renderGroceries({ waitForReady: false });

    expect(result.current.list.status).toBe('loading');
    expect(result.current.list.items).toEqual([]);
    expect(result.current.list.progress).toEqual({ checked: 0, total: 0, percent: null });
  });

  it('U-MUT-19 is waiting when the first fetch is paused offline', async () => {
    onlineManager.setOnline(false);
    const { result } = await renderGroceries({ waitForReady: false });

    expect(result.current.list.status).toBe('waiting');
    expect(fetchList).not.toHaveBeenCalled();
  });

  it('U-MUT-19 is error when the first fetch fails, and reports the error', async () => {
    const error = fail('server');
    jest.mocked(fetchList).mockRejectedValue(error);
    const { result } = await renderGroceries({ waitForReady: false });

    await waitFor(() => expect(result.current.list.status).toBe('error'));
    expect(report).toHaveBeenCalledWith(error);
  });

  it('U-MUT-19 stays ready, with the loaded items, when a later refetch fails', async () => {
    const hook = await renderGroceries();
    jest.mocked(fetchList).mockRejectedValue(fail('server'));

    await act(() => hook.result.current.list.refetch());
    await waitFor(() => expect(report).toHaveBeenCalled());

    expect(hook.result.current.list.status).toBe('ready');
    expect(itemIds(hook)).toHaveLength(5);
  });

  it('marks each failed refetch with loaded items, and clears the mark once one succeeds (R4.10)', async () => {
    const hook = await renderGroceries();
    expect(hook.result.current.list.refreshFailedAt).toBeNull();

    jest.mocked(fetchList).mockRejectedValueOnce(fail('server'));
    await act(() => hook.result.current.list.refetch());
    await flush();
    const firstFailure = hook.result.current.list.refreshFailedAt;
    expect(firstFailure).toEqual(expect.any(Number));

    // A second failure gets its own mark, even in the same millisecond on a fast machine.
    const now = jest.spyOn(Date, 'now').mockReturnValue(firstFailure! + 1000);
    jest.mocked(fetchList).mockRejectedValueOnce(fail('server'));
    await act(() => hook.result.current.list.refetch());
    await flush();
    expect(hook.result.current.list.refreshFailedAt).toBe(firstFailure! + 1000);
    now.mockRestore();

    await act(() => hook.result.current.list.refetch());
    await flush();
    expect(hook.result.current.list.refreshFailedAt).toBeNull();
  });

  it('leaves refreshFailedAt null when nothing has loaded', async () => {
    jest.mocked(fetchList).mockRejectedValue(fail('server'));
    const { result } = await renderGroceries({ waitForReady: false });

    await waitFor(() => expect(result.current.list.status).toBe('error'));
    expect(result.current.list.refreshFailedAt).toBeNull();
  });

  it('resolves refetch only once the reload has finished', async () => {
    const hook = await renderGroceries();
    const reload = deferred();
    jest
      .mocked(fetchList)
      .mockReturnValueOnce(reload.promise.then(() => ({ listId: LIST_ID, rows: [] })));

    let finished = false;
    let refetching!: Promise<void>;
    await act(async () => {
      refetching = hook.result.current.list.refetch().then(() => void (finished = true));
    });
    await flush();
    expect(finished).toBe(false);

    await act(async () => {
      reload.resolve();
      await refetching;
    });
    expect(finished).toBe(true);
    await flush();
    expect(itemIds(hook)).toEqual([]);
  });

  it('runs no query until the household is ready', async () => {
    mockHousehold = { status: 'loading' };
    const { result } = await renderGroceries({ waitForReady: false });

    expect(result.current.list.status).toBe('loading');
    expect(fetchList).not.toHaveBeenCalled();
  });

  it('U-MUT-18 leaves an invalid row out and reports it once, across re-renders and refetches', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { name: _, ...nameless } = makeRow({ id: 'invalid-18' });
    server.push(nameless as GroceryItemRow);
    const hook = await renderGroceries();

    expect(itemIds(hook)).not.toContain('invalid-18');
    await hook.rerender({});
    await act(() => hook.result.current.list.refetch());
    await act(() => hook.result.current.list.refetch());

    const reports = jest
      .mocked(Sentry.captureMessage)
      .mock.calls.filter(([key]) => key === 'invalid_row:invalid-18:name');
    expect(reports).toHaveLength(1);
    expect(itemIds(hook)).toHaveLength(5);
  });

  it('shows an unknown category under Other and reports the value once', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    server.push(makeRow({ id: 'snack', name: 'Crisps', category: 'snacks-18' }));
    const hook = await renderGroceries();
    await act(() => hook.result.current.list.refetch());

    expect(item(hook, 'snack')?.category).toBe('other');
    const reports = jest
      .mocked(Sentry.captureMessage)
      .mock.calls.filter(([key]) => key === 'unknown_category:snacks-18');
    expect(reports).toHaveLength(1);
  });
});

describe('add', () => {
  it('U-MUT-01 shows the item before insertItem resolves', async () => {
    const insert = deferred();
    jest.mocked(insertItem).mockReturnValueOnce(insert.promise);
    const hook = await renderGroceries();

    await act(() => hook.result.current.add({ name: 'Eggs', category: 'dairy', quantity: '12' }));

    await waitFor(() =>
      expect(item(hook, 'new-1')).toMatchObject({ name: 'Eggs', isChecked: false }),
    );
    expect(insertItem).toHaveBeenCalledWith({
      id: 'new-1',
      householdId: 'household-1',
      listId: LIST_ID,
      name: 'Eggs',
      category: 'dairy',
      quantity: '12',
    });
    insert.resolve();
    await settle();
  });

  it('U-MUT-02 removes the item when the add fails, and Retry repeats it with the same id', async () => {
    jest.mocked(insertItem).mockRejectedValueOnce(fail('server'));
    const hook = await renderGroceries();

    await act(() => hook.result.current.add({ name: 'Eggs', category: 'dairy', quantity: null }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(item(hook, 'new-1')).toBeUndefined();
    expect(lastToast()).toMatchObject({
      message: "Couldn't save that change",
      action: { label: 'Retry' },
    });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ category: 'server' }));

    await act(() => lastToast().action.onPress());
    await settle();

    expect(insertItem).toHaveBeenCalledTimes(2);
    expect(jest.mocked(insertItem).mock.calls.map(([v]) => v.id)).toEqual(['new-1', 'new-1']);
    expect(item(hook, 'new-1')).toMatchObject({ name: 'Eggs' });
  });

  it('U-MUT-03 removes the item and says it is already on the list on an open-name duplicate', async () => {
    jest
      .mocked(insertItem)
      .mockRejectedValueOnce(fail('conflict_duplicate', 'grocery_items_one_open_per_name'));
    const hook = await renderGroceries();

    await act(() => hook.result.current.add({ name: 'rice', category: 'pantry', quantity: null }));
    await settle();

    expect(item(hook, 'new-1')).toBeUndefined();
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(lastToast()).toEqual({ message: 'rice is already on the list' });
    expect(report).not.toHaveBeenCalled();
  });

  it('U-MUT-04 keeps the item on a primary-key duplicate, because an earlier attempt succeeded', async () => {
    jest.mocked(insertItem).mockImplementationOnce(async (v) => {
      server.push(makeRow({ id: v.id, name: v.name, category: v.category }));
      throw fail('conflict_duplicate', 'grocery_items_pkey');
    });
    const hook = await renderGroceries();

    await act(() => hook.result.current.add({ name: 'Eggs', category: 'dairy', quantity: null }));
    await settle();

    expect(item(hook, 'new-1')).toMatchObject({ name: 'Eggs' });
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});

describe('check and uncheck', () => {
  // The queued edit's call waits too, so no refetch can restore its value: only the undo runs.
  it('U-MUT-05 reverts only the failed check, and a queued edit to another item survives', async () => {
    const check = deferred();
    const quantity = deferred();
    jest.mocked(setItemChecked).mockReturnValueOnce(check.promise);
    jest.mocked(setItemQuantity).mockReturnValueOnce(quantity.promise);
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await act(() => hook.result.current.setQuantity({ id: 'rice', quantity: '2 kg' }));
    await waitFor(() => {
      expect(item(hook, 'bread')?.isChecked).toBe(true);
      expect(item(hook, 'rice')?.quantity).toBe('2 kg');
    });

    // The undo rewrites both items in one cache update, so this render shows its whole effect.
    await act(() => check.reject(fail('server')));
    await waitFor(() =>
      expect(item(hook, 'bread')).toMatchObject({ isChecked: false, checkedAt: null }),
    );
    expect(item(hook, 'rice')?.quantity).toBe('2 kg');

    await act(() => quantity.resolve());
    await settle();
    expect(item(hook, 'bread')?.isChecked).toBe(false);
  });

  it('U-MUT-05 reverts only the checked state, keeping a queued quantity edit to the same item', async () => {
    const check = deferred();
    const quantity = deferred();
    jest.mocked(setItemChecked).mockReturnValueOnce(check.promise);
    jest.mocked(setItemQuantity).mockReturnValueOnce(quantity.promise);
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await act(() => hook.result.current.setQuantity({ id: 'bread', quantity: '2 loaves' }));
    await act(() => check.reject(fail('server')));

    await waitFor(() => expect(item(hook, 'bread')?.isChecked).toBe(false));
    expect(item(hook, 'bread')?.quantity).toBe('2 loaves');
    await act(() => quantity.resolve());
    await settle();
  });

  it('U-MUT-06 removes an item that another device deleted', async () => {
    const hook = await renderGroceries();
    server = server.filter((r) => r.id !== 'bread');

    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await settle();

    expect(item(hook, 'bread')).toBeUndefined();
    expect(lastToast()).toEqual({ message: 'That item was removed on another device' });
    expect(report).not.toHaveBeenCalled();
  });

  it('U-MUT-07 keeps an item checked when unchecking it would duplicate an open item', async () => {
    jest
      .mocked(setItemChecked)
      .mockRejectedValueOnce(fail('conflict_duplicate', 'grocery_items_one_open_per_name'));
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'milk', isChecked: false }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(item(hook, 'milk')).toMatchObject({ isChecked: true, checkedAt: T });
    expect(lastToast()).toEqual({ message: 'Milk is already on the list' });
    expect(report).not.toHaveBeenCalled();
    await settle();
  });

  it('U-MUT-17 sends the intended state each time, never a toggle', async () => {
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await settle();

    expect(jest.mocked(setItemChecked).mock.calls).toEqual([
      ['bread', true],
      ['bread', true],
    ]);
    expect(item(hook, 'bread')?.isChecked).toBe(true);
  });

  it('keeps the first check time when an already checked item is checked again', async () => {
    const check = deferred();
    jest.mocked(setItemChecked).mockReturnValueOnce(check.promise);
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'milk', isChecked: true }));
    // The API call comes after the optimistic change.
    await waitFor(() => expect(setItemChecked).toHaveBeenCalled());

    expect(item(hook, 'milk')?.checkedAt).toBe(T);
    check.resolve();
    await settle();
  });
});

describe('quantity', () => {
  it('U-MUT-08 shows the new quantity at once, and sends only the id and quantity', async () => {
    const quantity = deferred();
    jest.mocked(setItemQuantity).mockReturnValueOnce(quantity.promise);
    const hook = await renderGroceries();

    await act(() => hook.result.current.setQuantity({ id: 'rice', quantity: '2 kg' }));

    await waitFor(() => expect(item(hook, 'rice')?.quantity).toBe('2 kg'));
    expect(setItemQuantity).toHaveBeenCalledWith('rice', '2 kg');
    quantity.resolve();
    await settle();
  });

  it('U-MUT-08 restores the quantity when the edit fails', async () => {
    jest.mocked(setItemQuantity).mockRejectedValueOnce(fail('server'));
    const hook = await renderGroceries();

    await act(() => hook.result.current.setQuantity({ id: 'rice', quantity: null }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(item(hook, 'rice')?.quantity).toBe('1 kg');
    await settle();
  });

  it('removes an item that another device deleted', async () => {
    const hook = await renderGroceries();
    server = server.filter((r) => r.id !== 'rice');

    await act(() => hook.result.current.setQuantity({ id: 'rice', quantity: '3' }));
    await settle();

    expect(item(hook, 'rice')).toBeUndefined();
    expect(lastToast()).toEqual({ message: 'That item was removed on another device' });
  });
});

describe('edit', () => {
  const BREAD = { name: 'Bread', category: 'bakery', quantity: null } as const;

  it('shows the edit at once, and sends only the fields that changed (R12.4)', async () => {
    const edit = deferred();
    jest.mocked(updateItemDetails).mockReturnValueOnce(edit.promise);
    const hook = await renderGroceries();

    await act(() =>
      hook.result.current.edit({
        id: 'bread',
        before: BREAD,
        after: { name: 'Sourdough', category: 'bakery', quantity: '1 loaf' },
      }),
    );

    await waitFor(() =>
      expect(item(hook, 'bread')).toMatchObject({
        name: 'Sourdough',
        category: 'bakery',
        quantity: '1 loaf',
      }),
    );
    expect(jest.mocked(updateItemDetails).mock.calls).toStrictEqual([
      ['bread', { name: 'Sourdough', quantity: '1 loaf' }],
    ]);
    edit.resolve();
    await settle();
  });

  it('changes only the fields it edits, so a newer change to the others keeps showing', async () => {
    const edit = deferred();
    jest.mocked(updateItemDetails).mockImplementationOnce(async (id, changes) => {
      await edit.promise;
      patchServer(id, changes);
    });
    const hook = await renderGroceries();
    // The sheet opened on Bread with no quantity; then the other phone set one.
    server = server.map((r) => (r.id === 'bread' ? { ...r, quantity: '2 loaves' } : r));
    await act(() => hook.result.current.list.refetch());
    await waitFor(() => expect(item(hook, 'bread')?.quantity).toBe('2 loaves'));

    await act(() =>
      hook.result.current.edit({ id: 'bread', before: BREAD, after: { ...BREAD, name: 'Rye' } }),
    );

    await waitFor(() => expect(item(hook, 'bread')?.name).toBe('Rye'));
    expect(item(hook, 'bread')).toMatchObject({ category: 'bakery', quantity: '2 loaves' });
    expect(jest.mocked(updateItemDetails).mock.calls).toStrictEqual([['bread', { name: 'Rye' }]]);
    edit.resolve();
    await settle();
    expect(item(hook, 'bread')).toMatchObject({ name: 'Rye', quantity: '2 loaves' });
  });

  it('moves the item to its new category, and sends a cleared quantity as null', async () => {
    const hook = await renderGroceries();

    await act(() =>
      hook.result.current.edit({
        id: 'rice',
        before: { name: 'Rice', category: 'pantry', quantity: '1 kg' },
        after: { name: 'Rice', category: 'other', quantity: null },
      }),
    );
    await settle();

    expect(jest.mocked(updateItemDetails).mock.calls).toStrictEqual([
      ['rice', { category: 'other', quantity: null }],
    ]);
    expect(item(hook, 'rice')).toMatchObject({ category: 'other', quantity: null });
    expect(hook.result.current.list.sections.map((s) => s.category)).toContain('other');
  });

  it('puts back only the fields it changed when it fails, keeping a queued quantity edit', async () => {
    const edit = deferred();
    const quantity = deferred();
    jest.mocked(updateItemDetails).mockReturnValueOnce(edit.promise);
    jest.mocked(setItemQuantity).mockReturnValueOnce(quantity.promise);
    const hook = await renderGroceries();

    await act(() =>
      hook.result.current.edit({
        id: 'bread',
        before: BREAD,
        after: { ...BREAD, name: 'Sourdough' },
      }),
    );
    await act(() => hook.result.current.setQuantity({ id: 'bread', quantity: '2 loaves' }));
    await waitFor(() =>
      expect(item(hook, 'bread')).toMatchObject({ name: 'Sourdough', quantity: '2 loaves' }),
    );

    await act(() => edit.reject(fail('server')));

    await waitFor(() => expect(item(hook, 'bread')?.name).toBe('Bread'));
    expect(item(hook, 'bread')?.quantity).toBe('2 loaves');
    expect(lastToast()).toMatchObject({
      message: "Couldn't save that change",
      action: { label: 'Retry' },
    });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ category: 'server' }));
    await act(() => quantity.resolve());
    await settle();
  });

  it('puts back the category and quantity it changed when it fails, leaving the name alone', async () => {
    const edit = deferred();
    const rename = deferred();
    jest.mocked(updateItemDetails).mockReturnValueOnce(edit.promise);
    const hook = await renderGroceries();

    await act(() =>
      hook.result.current.edit({
        id: 'rice',
        before: { name: 'Rice', category: 'pantry', quantity: '1 kg' },
        after: { name: 'Rice', category: 'other', quantity: null },
      }),
    );
    // A second, queued edit renames it meanwhile.
    jest.mocked(updateItemDetails).mockReturnValueOnce(rename.promise);
    await act(() =>
      hook.result.current.edit({
        id: 'rice',
        before: { name: 'Rice', category: 'other', quantity: null },
        after: { name: 'Basmati', category: 'other', quantity: null },
      }),
    );
    await waitFor(() => expect(item(hook, 'rice')?.name).toBe('Basmati'));

    await act(() => edit.reject(fail('server')));

    await waitFor(() =>
      expect(item(hook, 'rice')).toMatchObject({
        name: 'Basmati',
        category: 'pantry',
        quantity: '1 kg',
      }),
    );
    await act(() => rename.resolve());
    await settle();
  });

  it('changes nothing when an edit to an item the list no longer has fails', async () => {
    jest.mocked(updateItemDetails).mockRejectedValueOnce(fail('server'));
    const hook = await renderGroceries();

    await act(() =>
      hook.result.current.edit({ id: 'ghost', before: BREAD, after: { ...BREAD, name: 'Rye' } }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(itemIds(hook)).toEqual(['bagels', 'bread', 'milk', 'peas', 'rice']);
    expect(item(hook, 'bread')?.name).toBe('Bread');
    await settle();
  });

  it('Retry repeats the same edit', async () => {
    jest.mocked(updateItemDetails).mockRejectedValueOnce(fail('server'));
    const hook = await renderGroceries();

    await act(() =>
      hook.result.current.edit({ id: 'bread', before: BREAD, after: { ...BREAD, name: 'Rye' } }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    expect(item(hook, 'bread')?.name).toBe('Bread');

    await act(() => lastToast().action.onPress());
    await settle();

    expect(jest.mocked(updateItemDetails).mock.calls).toEqual([
      ['bread', { name: 'Rye' }],
      ['bread', { name: 'Rye' }],
    ]);
    expect(item(hook, 'bread')?.name).toBe('Rye');
  });

  it('undoes a name another open item has, and says so, without reporting (R5.6)', async () => {
    jest
      .mocked(updateItemDetails)
      .mockRejectedValueOnce(fail('conflict_duplicate', 'grocery_items_one_open_per_name'));
    const hook = await renderGroceries();

    await act(() =>
      hook.result.current.edit({ id: 'bread', before: BREAD, after: { ...BREAD, name: 'Rice' } }),
    );
    await settle();

    expect(item(hook, 'bread')?.name).toBe('Bread');
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(lastToast()).toEqual({ message: 'Rice is already on the list' });
    expect(report).not.toHaveBeenCalled();
  });

  it('removes an item that another device deleted (R12.5)', async () => {
    const hook = await renderGroceries();
    server = server.filter((r) => r.id !== 'bread');

    await act(() =>
      hook.result.current.edit({ id: 'bread', before: BREAD, after: { ...BREAD, name: 'Rye' } }),
    );
    await settle();

    expect(item(hook, 'bread')).toBeUndefined();
    expect(lastToast()).toEqual({ message: 'That item was removed on another device' });
    expect(report).not.toHaveBeenCalled();
  });
});

describe('delete', () => {
  it('U-MUT-09 removes the item at once, and puts it back in its place when the delete fails', async () => {
    const remove = deferred();
    jest.mocked(deleteItem).mockReturnValueOnce(remove.promise);
    const hook = await renderGroceries();
    const before = hook.result.current.list.sections;

    await act(() => hook.result.current.remove({ id: 'bread' }));
    await waitFor(() => expect(item(hook, 'bread')).toBeUndefined());

    await act(() => remove.reject(fail('server')));
    await waitFor(() => expect(hook.result.current.list.sections).toEqual(before));
    expect(lastToast()).toMatchObject({ action: { label: 'Retry' } });
    await settle();
  });

  it('U-MUT-10 succeeds quietly when the item was already gone', async () => {
    const hook = await renderGroceries();
    server = server.filter((r) => r.id !== 'bread');

    await act(() => hook.result.current.remove({ id: 'bread' }));
    await settle();

    expect(item(hook, 'bread')).toBeUndefined();
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});

describe('clear checked', () => {
  it('U-MUT-11 removes every checked item at once', async () => {
    const clear = deferred();
    jest.mocked(clearCheckedItems).mockReturnValueOnce(clear.promise.then(() => []));
    const hook = await renderGroceries();

    await act(() => hook.result.current.clearChecked());

    await waitFor(() => expect(itemIds(hook)).toEqual(['bagels', 'bread', 'rice']));
    expect(clearCheckedItems).toHaveBeenCalledWith(LIST_ID);
    clear.resolve();
    await settle();
  });

  it('U-MUT-11 brings every cleared item back when the clear fails', async () => {
    jest.mocked(clearCheckedItems).mockRejectedValueOnce(fail('server'));
    const hook = await renderGroceries();

    await act(() => hook.result.current.clearChecked());
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(itemIds(hook)).toEqual(['bagels', 'bread', 'milk', 'peas', 'rice']);
    await settle();
  });
});

describe('uncheck all', () => {
  it('U-MUT-20 reopens every checked item except those kept, at once', async () => {
    const uncheck = deferred();
    jest.mocked(uncheckAllItems).mockReturnValueOnce(uncheck.promise.then(() => []));
    const hook = await renderGroceries();

    await act(() => hook.result.current.uncheckAll({ keepIds: ['peas'] }));

    await waitFor(() =>
      expect(item(hook, 'milk')).toMatchObject({ isChecked: false, checkedAt: null }),
    );
    expect(item(hook, 'peas')).toMatchObject({ isChecked: true, checkedAt: T });
    expect(uncheckAllItems).toHaveBeenCalledWith(LIST_ID, ['peas']);
    uncheck.resolve();
    await settle();
  });

  it('U-MUT-21 puts back only the checked state when it fails, keeping a queued quantity edit', async () => {
    const uncheck = deferred();
    const quantity = deferred();
    jest.mocked(uncheckAllItems).mockReturnValueOnce(uncheck.promise.then(() => []));
    jest.mocked(setItemQuantity).mockReturnValueOnce(quantity.promise);
    const hook = await renderGroceries();

    await act(() => hook.result.current.uncheckAll({ keepIds: [] }));
    await act(() => hook.result.current.setQuantity({ id: 'milk', quantity: '2 gallons' }));
    await waitFor(() =>
      expect(item(hook, 'milk')).toMatchObject({ isChecked: false, quantity: '2 gallons' }),
    );
    await act(() => uncheck.reject(fail('server')));

    await waitFor(() => {
      expect(item(hook, 'milk')).toMatchObject({ isChecked: true, checkedAt: T });
      expect(item(hook, 'peas')).toMatchObject({ isChecked: true, checkedAt: T });
    });
    expect(item(hook, 'milk')?.quantity).toBe('2 gallons');
    expect(lastToast()).toMatchObject({ action: { label: 'Retry' } });
    await act(() => quantity.resolve());
    await settle();
  });

  it('U-MUT-22 changes nothing, without reporting, when the other device made a name clash', async () => {
    jest
      .mocked(uncheckAllItems)
      .mockRejectedValueOnce(fail('conflict_duplicate', 'grocery_items_one_open_per_name'));
    const hook = await renderGroceries();

    await act(() => hook.result.current.uncheckAll({ keepIds: [] }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(item(hook, 'milk')?.isChecked).toBe(true);
    expect(item(hook, 'peas')?.isChecked).toBe(true);
    expect(lastToast()).toEqual({
      message: 'The list changed on another device, so nothing was unchecked',
    });
    expect(report).not.toHaveBeenCalled();
    await settle();
  });
});

describe('ordering, offline and refetching', () => {
  it('U-MUT-12 starts the second call only after the first has settled', async () => {
    const first = deferred();
    jest.mocked(setItemChecked).mockReturnValueOnce(first.promise);
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await act(() => hook.result.current.check({ id: 'rice', isChecked: true }));
    await flush();
    expect(setItemChecked).toHaveBeenCalledTimes(1);

    await act(() => first.resolve());
    await settle();
    expect(jest.mocked(setItemChecked).mock.calls).toEqual([
      ['bread', true],
      ['rice', true],
    ]);
  });

  it('U-MUT-13 shows changes made offline at once, and sends them in order once back online', async () => {
    const hook = await renderGroceries();
    await act(() => onlineManager.setOnline(false));

    await act(() => hook.result.current.setQuantity({ id: 'rice', quantity: '5 kg' }));
    await act(() => hook.result.current.remove({ id: 'bagels' }));
    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));

    await waitFor(() => {
      expect(item(hook, 'rice')?.quantity).toBe('5 kg');
      expect(item(hook, 'bagels')).toBeUndefined();
      expect(item(hook, 'bread')?.isChecked).toBe(true);
    });
    await flush();
    expect(apiCalls).toEqual([]);

    await act(() => onlineManager.setOnline(true));
    await settle();

    expect(apiCalls).toEqual(['quantity rice 5 kg', 'delete bagels', 'check bread true']);
    expect(item(hook, 'bread')?.isChecked).toBe(true);
  });

  it('U-MUT-14 inserts an item added offline before checking it', async () => {
    const hook = await renderGroceries();
    await act(() => onlineManager.setOnline(false));

    await act(() => hook.result.current.add({ name: 'Eggs', category: 'dairy', quantity: null }));
    await act(() => hook.result.current.check({ id: 'new-1', isChecked: true }));
    await waitFor(() => expect(item(hook, 'new-1')?.isChecked).toBe(true));

    await act(() => onlineManager.setOnline(true));
    await settle();

    expect(apiCalls).toEqual(['insert new-1', 'check new-1 true']);
    expect(item(hook, 'new-1')?.isChecked).toBe(true);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('U-MUT-15 refetches the list once, after the last of three rapid mutations settles', async () => {
    const last = deferred();
    jest.mocked(deleteItem).mockReturnValueOnce(last.promise);
    const hook = await renderGroceries();
    expect(fetchList).toHaveBeenCalledTimes(1);

    // In one act, so the second and third are queued before the first settles.
    await act(() => {
      hook.result.current.check({ id: 'bread', isChecked: true });
      hook.result.current.setQuantity({ id: 'rice', quantity: '2 kg' });
      hook.result.current.remove({ id: 'bagels' });
    });
    await waitFor(() => expect(deleteItem).toHaveBeenCalled());
    await flush();
    expect(fetchList).toHaveBeenCalledTimes(1);

    await act(() => last.resolve());
    await settle();
    expect(fetchList).toHaveBeenCalledTimes(2);
  });

  it('U-MUT-16 retries a network failure 3 times, then gives up with Retry', async () => {
    jest.mocked(setItemChecked).mockRejectedValue(fail('network'));
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(setItemChecked).toHaveBeenCalledTimes(4);
    expect(item(hook, 'bread')?.isChecked).toBe(false);
    expect(lastToast()).toMatchObject({ action: { label: 'Retry' } });
    await settle();
  });

  it.each([
    ['validation', "Couldn't save that change"],
    ['forbidden', "You don't have access to that"],
  ] as const)('U-MUT-16 does not retry a %s failure', async (category, message) => {
    jest.mocked(setItemChecked).mockRejectedValue(fail(category));
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(setItemChecked).toHaveBeenCalledTimes(1);
    expect(lastToast().message).toBe(message);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ category }));
    await settle();
  });

  it('offers no Retry for a forbidden failure, since repeating it fails the same way', async () => {
    jest.mocked(setItemChecked).mockRejectedValue(fail('forbidden'));
    const hook = await renderGroceries();

    await act(() => hook.result.current.check({ id: 'bread', isChecked: true }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    expect(lastToast()).toEqual({ message: "You don't have access to that" });
    await settle();
  });

  it('ignores a mutation before the list has loaded', async () => {
    jest.mocked(fetchList).mockReturnValue(new Promise(() => {}));
    const { result } = await renderGroceries({ waitForReady: false });

    await act(() => result.current.check({ id: 'bread', isChecked: true }));
    await flush();

    expect(setItemChecked).not.toHaveBeenCalled();
    expect(queryClient.isMutating()).toBe(0);
  });
});
