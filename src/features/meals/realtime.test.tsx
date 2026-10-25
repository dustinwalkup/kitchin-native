import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { groceryTableHandlers } from '@/features/groceries/realtime';
import {
  type TableHandlers,
  useHouseholdRealtime,
} from '@/features/household/use-household-realtime';
import type { IsoDate } from '@/lib/calendar';
import { MAX_WAIT_MS, QUIET_MS } from '@/lib/realtime/coalescer';
import { makeEntryRow } from '@/test/factories';
import { mockRealtime, resetBackend } from '@/test/mock-backend';

import { fetchWeek, saveEntry } from './api';
import type { MealEntryRow } from './domain';
import { mealKeys, useMealWeek, useSetMeal } from './hooks';
import { mealTableHandlers, onMealTableChange } from './realtime';

// U-MRT-01 to 03 (4-test-plan §3.6). The household channel runs against the fake socket with the
// handlers the (app) layout passes, and the real meal hooks run against a mocked api.ts.

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock('./api', () => ({ fetchWeek: jest.fn(), saveEntry: jest.fn(), clearEntry: jest.fn() }));
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
const WEEK = '2026-10-19' as IsoDate;
const MEALS_KEY = ['household', HOUSEHOLD_ID, 'meals'];
const GROCERY_KEY = ['household', HOUSEHOLD_ID, 'grocery'];
const TACOS = makeEntryRow({ id: 'mon-dinner', meal_date: '2026-10-19', body: 'Tacos' });
const CHILI = makeEntryRow({
  id: 'wed-lunch',
  meal_date: '2026-10-21',
  meal_type: 'lunch',
  body: 'Leftover chili',
});

// The (app) layout's TABLE_HANDLERS, built the same way.
const APP_HANDLERS: TableHandlers = { ...groceryTableHandlers, ...mealTableHandlers };

// What the database holds. The tests change it to play the other phone.
let server: MealEntryRow[];
let queryClient: QueryClient;
let handlers: TableHandlers;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetBackend();
  server = [TACOS];
  handlers = mealTableHandlers;
  jest
    .mocked(fetchWeek)
    .mockImplementation(async (_, from, to) =>
      server.filter((r) => r.meal_date >= from && r.meal_date <= to).map((r) => ({ ...r })),
    );
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

function useMealsWithRealtime() {
  useHouseholdRealtime(handlers);
  return { week: useMealWeek(WEEK), setMeal: useSetMeal(0) };
}

async function renderMeals() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(useMealsWithRealtime, { wrapper });
  await waitFor(() => expect(hook.result.current.week.status).toBe('ready'));
  await waitFor(() => expect(mockRealtime.channels).toHaveLength(1));
  // The weeks either side are prefetched once the week is ready.
  await waitFor(() => expect(fetchWeek).toHaveBeenCalledTimes(3));
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderMeals>>;
const bodies = ({ result }: Hook) =>
  result.current.week.days.flatMap((d) => d.slots.flatMap((s) => (s.entry ? [s.entry.body] : [])));
const weekFetches = () =>
  jest.mocked(fetchWeek).mock.calls.filter(([, from]) => from === WEEK).length;

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

describe('mealTableHandlers', () => {
  it('sends meal_entries to onMealTableChange', () => {
    expect(mealTableHandlers).toEqual({ meal_entries: onMealTableChange });
  });
});

describe('onMealTableChange', () => {
  it('U-MRT-01 refetches the meals, and leaves the grocery queries alone, when nothing is saving', async () => {
    const hook = await renderMeals();
    queryClient.setQueryData([...GROCERY_KEY, 'list'], { listId: 'list-1', rows: [] });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    // The other phone plans Wednesday's lunch.
    server = [TACOS, CHILI];
    mockRealtime.latest().emitBroadcast(event('meal_entries'));
    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS));

    expect(invalidate.mock.calls).toEqual([[{ queryKey: MEALS_KEY }]]);
    await waitFor(() => expect(bodies(hook)).toEqual(['Tacos', 'Leftover chili']));
    expect(weekFetches()).toBe(2);
    expect(queryClient.getQueryState([...GROCERY_KEY, 'list'])?.isInvalidated).toBe(false);
    // Weeks that aren't on screen are marked stale, to refresh when shown again (R35.6).
    expect(
      queryClient.getQueryState(mealKeys.week(HOUSEHOLD_ID, '2026-10-26' as IsoDate))
        ?.isInvalidated,
    ).toBe(true);
  });

  it('U-MRT-02 leaves an event during a save to the save’s own refetch (R11.5)', async () => {
    const save = deferred();
    jest.mocked(saveEntry).mockReturnValue(save.promise);
    const hook = await renderMeals();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () =>
      hook.result.current.setMeal({ date: WEEK, mealType: 'dinner', body: 'Pizza' }),
    );
    await waitFor(() => expect(saveEntry).toHaveBeenCalled());

    // The other phone plans Wednesday's lunch while Pizza is still saving. A refetch now would
    // bring Tacos back for a moment.
    server = [TACOS, CHILI];
    mockRealtime.latest().emitBroadcast(event('meal_entries'));
    await act(() => jest.advanceTimersByTimeAsync(MAX_WAIT_MS));

    expect(invalidate).not.toHaveBeenCalled();
    expect(weekFetches()).toBe(1);
    expect(bodies(hook)).toEqual(['Pizza']);

    // The save lands, and its refetch brings in Wednesday's lunch as well.
    server = [{ ...TACOS, body: 'Pizza' }, CHILI];
    await act(async () => save.resolve());

    await waitFor(() => expect(bodies(hook)).toEqual(['Pizza', 'Leftover chili']));
    expect(invalidate.mock.calls).toEqual([[{ queryKey: MEALS_KEY }]]);
    expect(weekFetches()).toBe(2);
  });

  it('refetches for events again once the save has settled', async () => {
    jest.mocked(saveEntry).mockResolvedValue();
    const hook = await renderMeals();
    await act(async () =>
      hook.result.current.setMeal({ date: WEEK, mealType: 'dinner', body: 'Tacos' }),
    );
    await waitFor(() => expect(weekFetches()).toBe(2));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    server = [TACOS, CHILI];
    mockRealtime.latest().emitBroadcast(event('meal_entries'));
    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS));

    await waitFor(() => expect(bodies(hook)).toEqual(['Tacos', 'Leftover chili']));
    expect(weekFetches()).toBe(3);
  });
});

describe("the (app) layout's handlers", () => {
  it('U-MRT-03 run each feature’s handler once for a burst across grocery and meal tables', async () => {
    handlers = APP_HANDLERS;
    await renderMeals();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const channel = mockRealtime.latest();

    for (let i = 0; i < 5; i++) {
      channel.emitBroadcast(event('grocery_items'));
      channel.emitBroadcast(event('meal_entries'));
    }
    channel.emitBroadcast(event('grocery_lists'));

    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS - 1));
    expect(invalidate).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTimeAsync(1));

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: GROCERY_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MEALS_KEY });
  });
});
