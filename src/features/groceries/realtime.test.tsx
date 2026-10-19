import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useHouseholdRealtime } from '@/features/household/use-household-realtime';
import { MAX_WAIT_MS, QUIET_MS } from '@/lib/realtime/coalescer';
import { makeRow } from '@/test/factories';
import { mockRealtime, resetBackend } from '@/test/mock-backend';

import { fetchList, setItemChecked } from './api';
import type { GroceryItemRow } from './domain';
import { useGroceryList, useSetChecked } from './hooks';
import { groceryTableHandlers, groceryTables, onGroceryTableChange } from './realtime';

// U-RT-01 and U-RT-02 (4-test-plan §3.12). The household channel runs against the fake socket with
// the handlers the (app) layout passes, and the real grocery hooks run against a mocked api.ts.

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock('./api', () => ({ fetchList: jest.fn(), setItemChecked: jest.fn() }));
jest.mock('@/lib/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  setReportingUser: jest.fn(),
}));
jest.mock('@/features/household/household-provider', () => ({
  useHousehold: () => ({ status: 'ready', household: { id: 'household-1' } }),
}));

const HOUSEHOLD_ID = 'household-1';
const BREAD = makeRow({ id: 'bread', name: 'Bread' });
const MILK = makeRow({ id: 'milk', name: 'Milk', category: 'dairy' });

// What the database holds. The tests change it to play the other phone.
let server: GroceryItemRow[];
let queryClient: QueryClient;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetBackend();
  server = [BREAD];
  jest.mocked(fetchList).mockImplementation(async () => ({
    listId: 'list-1',
    rows: server.map((r) => ({ ...r })),
  }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

function useGroceriesWithRealtime() {
  useHouseholdRealtime(groceryTableHandlers);
  return { list: useGroceryList(), check: useSetChecked() };
}

async function renderGroceries() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(useGroceriesWithRealtime, { wrapper });
  await waitFor(() => expect(hook.result.current.list.status).toBe('ready'));
  await waitFor(() => expect(mockRealtime.channels).toHaveLength(1));
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderGroceries>>;
const names = ({ result }: Hook) => result.current.list.items.map((i) => i.name).sort();

const event = (table: string) => ({
  type: 'broadcast' as const,
  event: 'INSERT',
  payload: { table },
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('groceryTableHandlers', () => {
  it('sends both grocery tables to the same handler', () => {
    expect(groceryTables.map((table) => groceryTableHandlers[table])).toEqual([
      onGroceryTableChange,
      onGroceryTableChange,
    ]);
  });
});

describe('onGroceryTableChange', () => {
  it('U-RT-01 refetches the grocery queries once per burst when nothing is saving (R11.1, R11.4)', async () => {
    const hook = await renderGroceries();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const channel = mockRealtime.latest();

    // The other phone adds Milk, then clears 20 items: one burst across both tables.
    server = [BREAD, MILK];
    channel.emitBroadcast(event('grocery_items'));
    for (let i = 0; i < 20; i++) channel.emitBroadcast(event('grocery_items'));
    channel.emitBroadcast(event('grocery_lists'));

    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS - 1));
    expect(invalidate).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTimeAsync(1));

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['household', HOUSEHOLD_ID, 'grocery'] });
    await waitFor(() => expect(names(hook)).toEqual(['Bread', 'Milk']));
    expect(fetchList).toHaveBeenCalledTimes(2);
  });

  it('U-RT-02 leaves an event during a save to the save’s own refetch (R11.5)', async () => {
    const save = deferred();
    jest.mocked(setItemChecked).mockReturnValue(save.promise);
    const hook = await renderGroceries();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => hook.result.current.check({ id: 'bread', isChecked: true }));
    await waitFor(() => expect(setItemChecked).toHaveBeenCalledWith('bread', true));

    // The other phone adds Milk while Bread's check is still saving. A refetch now would bring
    // Bread back unchecked for a moment.
    server = [BREAD, MILK];
    mockRealtime.latest().emitBroadcast(event('grocery_items'));
    await act(() => jest.advanceTimersByTimeAsync(MAX_WAIT_MS));

    expect(invalidate).not.toHaveBeenCalled();
    expect(fetchList).toHaveBeenCalledTimes(1);
    expect(hook.result.current.list.items).toEqual([
      expect.objectContaining({ name: 'Bread', isChecked: true }),
    ]);

    // The save lands, and its refetch brings in Milk as well.
    server = [{ ...BREAD, is_checked: true, checked_at: '2026-10-19T10:00:00+00:00' }, MILK];
    await act(async () => save.resolve());

    await waitFor(() => expect(names(hook)).toEqual(['Bread', 'Milk']));
    expect(fetchList).toHaveBeenCalledTimes(2);
    expect(hook.result.current.list.items.find((i) => i.name === 'Bread')?.isChecked).toBe(true);
  });

  it('refetches for events again once the save has settled', async () => {
    const hook = await renderGroceries();
    jest.mocked(setItemChecked).mockResolvedValue();
    await act(async () => hook.result.current.check({ id: 'bread', isChecked: true }));
    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    server = [...server, MILK];
    mockRealtime.latest().emitBroadcast(event('grocery_items'));
    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS));

    await waitFor(() => expect(names(hook)).toEqual(['Bread', 'Milk']));
    expect(fetchList).toHaveBeenCalledTimes(3);
  });
});
