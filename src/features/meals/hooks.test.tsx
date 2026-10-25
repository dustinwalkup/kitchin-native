import * as Sentry from '@sentry/react-native';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { IsoDate, Weekday } from '@/lib/calendar';
import { ApiError } from '@/lib/errors';
import { queryClient as appQueryClient } from '@/lib/query-client';
import { report } from '@/lib/reporting';
import { makeEntryRow } from '@/test/factories';

import { clearEntry, fetchRecentLibraryMealIds, fetchWeek, saveEntry } from './api';
import type { MealType } from './constants';
import type { MealEntryRow } from './domain';
import { mealKeys, useMealWeek, useRecentLibraryMealIds, useSetMeal } from './hooks';

jest.mock('./api', () => ({
  fetchWeek: jest.fn(),
  saveEntry: jest.fn(),
  clearEntry: jest.fn(),
  fetchRecentLibraryMealIds: jest.fn(),
}));

const mockShowToast = jest.fn();
jest.mock('@/lib/toast', () => ({ useToast: () => ({ show: mockShowToast }) }));

// `report` is a mock, so tests can assert on it. `reportOnce` is real, because its once-per-key
// behaviour is what U-MMUT-15 checks; it ends at the global Sentry mock.
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

const iso = (s: string) => s as IsoDate;

const WEEK = iso('2026-10-19');
const MON = '2026-10-19';
const TUE = '2026-10-20';
const WED = '2026-10-21';
const THU = '2026-10-22';
const T = '2026-10-19T12:00:00+00:00';

const ROWS: MealEntryRow[] = [
  makeEntryRow({ id: 'mon-dinner', meal_date: MON, meal_type: 'dinner', body: 'Tacos' }),
  makeEntryRow({ id: 'wed-lunch', meal_date: WED, meal_type: 'lunch', body: 'Leftover chili' }),
];

// A fake backend behind the mocked api.ts, so the refetch after each mutation returns what the
// database would hold. A test overrides a call to make it fail or wait.
let server: MealEntryRow[];
let apiCalls: string[];

const inSlot = (date: string, mealType: string) => (r: MealEntryRow) =>
  r.meal_date === date && r.meal_type === mealType;

const fail = (category: ConstructorParameters<typeof ApiError>[0]) =>
  new ApiError(category, { table: 'meal_entries', operation: 'upsert' });

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

  jest
    .mocked(fetchWeek)
    .mockImplementation(async (_, from, to) =>
      server.filter((r) => r.meal_date >= from && r.meal_date <= to).map((r) => ({ ...r })),
    );
  jest.mocked(saveEntry).mockImplementation(async ({ date, mealType, body, libraryMealId }) => {
    apiCalls.push(`save ${date} ${mealType} ${body}`);
    const id = server.find(inSlot(date, mealType))?.id ?? `saved-${date}-${mealType}`;
    server = [
      ...server.filter((r) => !inSlot(date, mealType)(r)),
      makeEntryRow({
        id,
        meal_date: date,
        meal_type: mealType,
        body,
        library_meal_id: libraryMealId,
        updated_at: T,
      }),
    ];
  });
  jest.mocked(fetchRecentLibraryMealIds).mockImplementation(async () =>
    server
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .flatMap((r) => (r.library_meal_id === null ? [] : [r.library_meal_id])),
  );
  jest.mocked(clearEntry).mockImplementation(async ({ date, mealType }) => {
    apiCalls.push(`clear ${date} ${mealType}`);
    server = server.filter((r) => !inSlot(date, mealType)(r));
  });

  // The app's defaults, without the back-off delay between retries. Queries keep TanStack's
  // 5-minute default gcTime, so U-MMUT-14 proves the week query sets its own. Mutations get an
  // infinite one, so no settled mutation leaves a timer that would keep Jest from exiting.
  const defaults = appQueryClient.getDefaultOptions();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { ...defaults.queries, retryDelay: 0, gcTime: 5 * 60_000 },
      mutations: { ...defaults.mutations, retryDelay: 0, gcTime: Infinity },
    },
  });
});

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

// Monday unless a test gives another start day.
function useMeals({ weekStart, start = 0 }: { weekStart: IsoDate; start?: Weekday }) {
  return { week: useMealWeek(weekStart), setMeal: useSetMeal(start) };
}

async function renderMeals({
  weekStart = WEEK,
  start,
  waitForReady = true,
}: { weekStart?: IsoDate; start?: Weekday; waitForReady?: boolean } = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(useMeals, { wrapper, initialProps: { weekStart, start } });
  if (waitForReady) await waitFor(() => expect(hook.result.current.week.status).toBe('ready'));
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderMeals>>;

const day = ({ result }: Hook, date: string) =>
  result.current.week.days.find((d) => d.date === date);
const entry = (hook: Hook, date: string, mealType: MealType) =>
  day(hook, date)?.slots.find((s) => s.mealType === mealType)?.entry ?? null;
const body = (hook: Hook, date: string, mealType: MealType) =>
  entry(hook, date, mealType)?.body ?? null;

const fetchesOf = (from: string) =>
  jest.mocked(fetchWeek).mock.calls.filter(([, weekFrom]) => weekFrom === from);

/** Lets pending promises and timers run, for checks that something has *not* happened. */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 10)));

/**
 * Waits until every meal mutation has settled and every fetch, including the prefetches, has
 * finished. TanStack tells React about cache changes on a timer, so the final render comes one
 * flush later.
 */
async function settle() {
  await waitFor(() => {
    expect(queryClient.isMutating()).toBe(0);
    expect(queryClient.isFetching()).toBe(0);
  });
  await flush();
}

const lastToast = () => mockShowToast.mock.calls.at(-1)?.[0];

/**
 * Makes every fetch wait until the returned function is called. A failure's refetch then can't put
 * the server's text back, so only the mutation's undo can have changed the slot.
 */
function holdFetches() {
  const held = deferred();
  const serverFetch = jest.mocked(fetchWeek).getMockImplementation()!;
  jest.mocked(fetchWeek).mockImplementation(async (...args) => {
    await held.promise;
    return serverFetch(...args);
  });
  return () => act(() => held.resolve());
}

describe('useMealWeek', () => {
  it("gives the week's seven days with the household's entries in their slots", async () => {
    const hook = await renderMeals();
    const { days } = hook.result.current.week;

    expect(days.map((d) => d.date)).toEqual([
      MON,
      TUE,
      WED,
      THU,
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(days.map((d) => d.planned)).toEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(entry(hook, MON, 'dinner')).toMatchObject({ id: 'mon-dinner', body: 'Tacos' });
    expect(fetchWeek).toHaveBeenCalledWith('household-1', WEEK, '2026-10-25');
    await settle();
  });

  it('U-MMUT-12 is loading on the first fetch, with no days', async () => {
    jest.mocked(fetchWeek).mockReturnValue(new Promise(() => {}));
    const { result } = await renderMeals({ waitForReady: false });

    expect(result.current.week.status).toBe('loading');
    expect(result.current.week.days).toEqual([]);
  });

  it('U-MMUT-12 is waiting when the first fetch is paused offline', async () => {
    onlineManager.setOnline(false);
    const { result } = await renderMeals({ waitForReady: false });

    expect(result.current.week.status).toBe('waiting');
    expect(fetchWeek).not.toHaveBeenCalled();
  });

  it('U-MMUT-12 is error when the first fetch fails, and reports the error', async () => {
    const error = fail('server');
    jest.mocked(fetchWeek).mockRejectedValue(error);
    const { result } = await renderMeals({ waitForReady: false });

    await waitFor(() => expect(result.current.week.status).toBe('error'));
    expect(result.current.week.refreshFailedAt).toBeNull();
    expect(report).toHaveBeenCalledWith(error);
  });

  it('U-MMUT-12 stays ready, and marks each failed refetch until one succeeds', async () => {
    const hook = await renderMeals();
    await settle();
    expect(hook.result.current.week.refreshFailedAt).toBeNull();

    jest.mocked(fetchWeek).mockRejectedValueOnce(fail('server'));
    await act(() => hook.result.current.week.refetch());
    await flush();
    const firstFailure = hook.result.current.week.refreshFailedAt;
    expect(firstFailure).toEqual(expect.any(Number));
    expect(hook.result.current.week.status).toBe('ready');
    expect(body(hook, MON, 'dinner')).toBe('Tacos');

    // A second failure gets its own mark, even in the same millisecond on a fast machine.
    const now = jest.spyOn(Date, 'now').mockReturnValue(firstFailure! + 1000);
    jest.mocked(fetchWeek).mockRejectedValueOnce(fail('server'));
    await act(() => hook.result.current.week.refetch());
    await flush();
    expect(hook.result.current.week.refreshFailedAt).toBe(firstFailure! + 1000);
    now.mockRestore();

    await act(() => hook.result.current.week.refetch());
    await flush();
    expect(hook.result.current.week.refreshFailedAt).toBeNull();
  });

  it('resolves refetch only once the reload has finished', async () => {
    const hook = await renderMeals();
    await settle();
    const reload = deferred();
    jest.mocked(fetchWeek).mockReturnValueOnce(reload.promise.then(() => []));

    let finished = false;
    let refetching!: Promise<void>;
    await act(async () => {
      refetching = hook.result.current.week.refetch().then(() => void (finished = true));
    });
    await flush();
    expect(finished).toBe(false);

    await act(async () => {
      reload.resolve();
      await refetching;
    });
    expect(finished).toBe(true);
    await flush();
    expect(hook.result.current.week.days.map((d) => d.planned)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('runs no query until the household is ready', async () => {
    mockHousehold = { status: 'loading' };
    const { result } = await renderMeals({ waitForReady: false });
    await flush();

    expect(result.current.week.status).toBe('loading');
    expect(fetchWeek).not.toHaveBeenCalled();
  });

  it('U-MMUT-13 prefetches the weeks before and after once the week is ready, once each', async () => {
    const hook = await renderMeals();
    await settle();

    expect(jest.mocked(fetchWeek).mock.calls).toEqual([
      ['household-1', WEEK, '2026-10-25'],
      ['household-1', '2026-10-12', '2026-10-18'],
      ['household-1', '2026-10-26', '2026-11-01'],
    ]);

    // A refetch that brings new rows doesn't prefetch again.
    server.push(makeEntryRow({ id: 'tue-lunch', meal_date: TUE, meal_type: 'lunch' }));
    await hook.rerender({ weekStart: WEEK });
    await act(() => hook.result.current.week.refetch());
    await settle();
    expect(day(hook, TUE)?.planned).toBe(1);
    expect(fetchesOf('2026-10-12')).toHaveLength(1);
    expect(fetchesOf('2026-10-26')).toHaveLength(1);
  });

  it('U-MMUT-13 does not prefetch while the week has not loaded', async () => {
    jest.mocked(fetchWeek).mockRejectedValue(fail('server'));
    const { result } = await renderMeals({ waitForReady: false });

    await waitFor(() => expect(result.current.week.status).toBe('error'));
    await flush();
    expect(jest.mocked(fetchWeek).mock.calls.map(([, from]) => from)).toEqual([WEEK]);
  });

  it('U-MMUT-14 shows a cached week at once on returning to it, and refetches it in the background', async () => {
    const hook = await renderMeals();
    await settle();

    // The next week was prefetched, so it's ready on the first render.
    await hook.rerender({ weekStart: iso('2026-10-26') });
    expect(hook.result.current.week.status).toBe('ready');
    expect(hook.result.current.week.days[0].date).toBe('2026-10-26');
    await settle();

    await hook.rerender({ weekStart: WEEK });
    expect(hook.result.current.week.status).toBe('ready');
    expect(body(hook, MON, 'dinner')).toBe('Tacos');
    await waitFor(() => expect(fetchesOf(WEEK)).toHaveLength(2));
    await settle();
  });

  it('U-MMUT-14 keeps weeks cached after 10 minutes with nothing observing them', async () => {
    const hook = await renderMeals();
    await settle();

    jest.useFakeTimers();
    try {
      await hook.unmount();
      jest.advanceTimersByTime(10 * 60_000);

      for (const weekStart of ['2026-10-12', WEEK, '2026-10-26']) {
        const query = queryClient.getQueryCache().find({
          queryKey: mealKeys.week('household-1', iso(weekStart)),
        });
        expect(query?.state.data).toBeDefined();
        expect(query?.gcTime).toBe(Infinity);
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it('U-MMUT-15 leaves an invalid row out and reports it once, across re-renders and refetches', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    server.push(makeEntryRow({ id: 'invalid-15', meal_date: TUE, meal_type: 'snack' }));
    const hook = await renderMeals();

    expect(
      hook.result.current.week.days.flatMap((d) => d.slots).map((s) => s.entry?.id),
    ).not.toContain('invalid-15');
    expect(day(hook, TUE)?.planned).toBe(0);
    await hook.rerender({ weekStart: WEEK });
    await act(() => hook.result.current.week.refetch());
    await act(() => hook.result.current.week.refetch());
    await settle();

    const reports = jest
      .mocked(Sentry.captureMessage)
      .mock.calls.filter(([key]) => key === 'invalid_row:invalid-15:meal_type');
    expect(reports).toHaveLength(1);
  });
});

describe('useSetMeal', () => {
  it('U-MMUT-17 shows a save in the week laid out from the screen’s start day (R48.4)', async () => {
    const save = deferred();
    const serverSave = jest.mocked(saveEntry).getMockImplementation()!;
    jest.mocked(saveEntry).mockImplementationOnce(async (v) => {
      await save.promise;
      await serverSave(v);
    });
    // A Monday-first week is cached as well, as it would be after the start day changed.
    queryClient.setQueryData(mealKeys.week('household-1', WEEK), ROWS);
    const sundayWeek = iso('2026-10-18');
    const hook = await renderMeals({ weekStart: sundayWeek, start: 6 });

    await act(() =>
      hook.result.current.setMeal({ date: iso(WED), mealType: 'dinner', body: 'Pizza' }),
    );

    await waitFor(() => expect(body(hook, WED, 'dinner')).toBe('Pizza'));
    expect(queryClient.getQueryData(mealKeys.week('household-1', WEEK))).toEqual(ROWS);
    save.resolve();
    await settle();
  });

  it('U-MMUT-01 shows the new text in a planned slot before saveEntry resolves', async () => {
    const save = deferred();
    const serverSave = jest.mocked(saveEntry).getMockImplementation()!;
    jest.mocked(saveEntry).mockImplementationOnce(async (v) => {
      await save.promise;
      await serverSave(v);
    });
    const hook = await renderMeals();

    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Pizza' }),
    );

    await waitFor(() => expect(body(hook, MON, 'dinner')).toBe('Pizza'));
    expect(entry(hook, MON, 'dinner')?.id).toBe('mon-dinner');
    expect(saveEntry).toHaveBeenCalledWith({
      householdId: 'household-1',
      date: MON,
      mealType: 'dinner',
      body: 'Pizza',
      libraryMealId: null,
    });
    save.resolve();
    await settle();
    expect(body(hook, MON, 'dinner')).toBe('Pizza');
  });

  it('U-MMUT-01 shows a meal chosen from the library with its link, and saves the link (DD-R10)', async () => {
    const save = deferred();
    const serverSave = jest.mocked(saveEntry).getMockImplementation()!;
    jest.mocked(saveEntry).mockImplementationOnce(async (v) => {
      await save.promise;
      await serverSave(v);
    });
    const hook = await renderMeals();

    await act(() =>
      hook.result.current.setMeal({
        date: iso(MON),
        mealType: 'dinner',
        body: 'Lasagne',
        libraryMealId: 'meal-3',
      }),
    );

    await waitFor(() =>
      expect(entry(hook, MON, 'dinner')).toMatchObject({
        id: 'mon-dinner',
        body: 'Lasagne',
        libraryMealId: 'meal-3',
      }),
    );
    expect(saveEntry).toHaveBeenCalledWith({
      householdId: 'household-1',
      date: MON,
      mealType: 'dinner',
      body: 'Lasagne',
      libraryMealId: 'meal-3',
    });
    save.resolve();
    await settle();
    expect(entry(hook, MON, 'dinner')?.libraryMealId).toBe('meal-3');
  });

  it('U-MMUT-01 drops the link at once when typed text replaces a library meal (DD-R10)', async () => {
    server = [
      makeEntryRow({
        id: 'mon-dinner',
        meal_date: MON,
        body: 'Lasagne',
        library_meal_id: 'meal-3',
      }),
    ];
    const save = deferred();
    const serverSave = jest.mocked(saveEntry).getMockImplementation()!;
    jest.mocked(saveEntry).mockImplementationOnce(async (v) => {
      await save.promise;
      await serverSave(v);
    });
    const hook = await renderMeals();
    expect(entry(hook, MON, 'dinner')?.libraryMealId).toBe('meal-3');

    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Leftovers' }),
    );

    await waitFor(() =>
      expect(entry(hook, MON, 'dinner')).toMatchObject({ body: 'Leftovers', libraryMealId: null }),
    );
    expect(saveEntry).toHaveBeenCalledWith(expect.objectContaining({ libraryMealId: null }));
    save.resolve();
    await settle();
  });

  it('U-MMUT-02 fills an empty slot with a placeholder row, which the refetch replaces', async () => {
    const save = deferred();
    jest.mocked(saveEntry).mockImplementationOnce(async (v) => {
      await save.promise;
      server.push(
        makeEntryRow({
          id: 'tue-breakfast',
          meal_date: v.date,
          meal_type: v.mealType,
          body: v.body,
        }),
      );
    });
    const hook = await renderMeals();

    await act(() =>
      hook.result.current.setMeal({ date: iso(TUE), mealType: 'breakfast', body: 'Porridge' }),
    );

    await waitFor(() =>
      expect(entry(hook, TUE, 'breakfast')).toMatchObject({
        id: `pending:${TUE}:breakfast`,
        body: 'Porridge',
        libraryMealId: null,
      }),
    );
    expect(day(hook, TUE)?.planned).toBe(1);

    save.resolve();
    await settle();
    expect(entry(hook, TUE, 'breakfast')).toMatchObject({ id: 'tue-breakfast', body: 'Porridge' });
    expect(day(hook, TUE)?.planned).toBe(1);
  });

  it('U-MMUT-03 empties the slot at once when the body is null, and calls clearEntry', async () => {
    const clear = deferred();
    jest.mocked(clearEntry).mockReturnValueOnce(clear.promise);
    const hook = await renderMeals();

    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: null }),
    );

    await waitFor(() => expect(entry(hook, MON, 'dinner')).toBeNull());
    expect(day(hook, MON)?.planned).toBe(0);
    expect(clearEntry).toHaveBeenCalledWith({
      householdId: 'household-1',
      date: MON,
      mealType: 'dinner',
    });
    expect(saveEntry).not.toHaveBeenCalled();
    clear.resolve();
    await settle();
  });

  it('U-MMUT-04 reverts a failed save, and Retry resends the same text', async () => {
    jest.mocked(saveEntry).mockRejectedValueOnce(fail('server'));
    const hook = await renderMeals();
    await settle();
    const release = holdFetches();

    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Pizza' }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    await flush();

    expect(body(hook, MON, 'dinner')).toBe('Tacos');
    expect(lastToast()).toMatchObject({
      message: "Couldn't save that meal",
      action: { label: 'Retry' },
    });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ category: 'server' }));

    await release();
    await act(() => lastToast().action.onPress());
    await settle();

    expect(jest.mocked(saveEntry).mock.calls.map(([v]) => v.body)).toEqual(['Pizza', 'Pizza']);
    expect(body(hook, MON, 'dinner')).toBe('Pizza');
  });

  it('U-MMUT-04 puts back a failed clear', async () => {
    jest.mocked(clearEntry).mockRejectedValueOnce(fail('server'));
    const hook = await renderMeals();
    await settle();
    const release = holdFetches();

    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: null }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    await flush();

    expect(entry(hook, MON, 'dinner')).toMatchObject({ id: 'mon-dinner', body: 'Tacos' });
    await release();
    await settle();
  });

  it('U-MMUT-04 empties a slot again when its first save fails', async () => {
    jest.mocked(saveEntry).mockRejectedValueOnce(fail('server'));
    const hook = await renderMeals();
    await settle();
    const release = holdFetches();

    await act(() =>
      hook.result.current.setMeal({ date: iso(THU), mealType: 'dinner', body: 'Pizza' }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    await flush();

    expect(entry(hook, THU, 'dinner')).toBeNull();
    expect(day(hook, THU)?.planned).toBe(0);
    await release();
    await settle();
  });

  it('U-MMUT-05 skips the undo when a later save to the slot is already showing', async () => {
    const pizza = deferred();
    const tacos = deferred();
    const serverSave = jest.mocked(saveEntry).getMockImplementation()!;
    // Tacos waits too, so no refetch can put its text back: only a skipped undo keeps it showing.
    jest
      .mocked(saveEntry)
      .mockReturnValueOnce(pizza.promise)
      .mockImplementationOnce(async (v) => {
        await tacos.promise;
        await serverSave(v);
      });
    const hook = await renderMeals();

    await act(() =>
      hook.result.current.setMeal({ date: iso(THU), mealType: 'dinner', body: 'Pizza' }),
    );
    await act(() =>
      hook.result.current.setMeal({ date: iso(THU), mealType: 'dinner', body: 'Tacos' }),
    );
    await waitFor(() => expect(body(hook, THU, 'dinner')).toBe('Tacos'));

    await act(() => pizza.reject(fail('server')));
    await waitFor(() => expect(saveEntry).toHaveBeenCalledTimes(2));
    await flush();
    expect(mockShowToast).toHaveBeenCalled();
    expect(body(hook, THU, 'dinner')).toBe('Tacos');

    await act(() => tacos.resolve());
    await settle();
    expect(apiCalls).toEqual([`save ${THU} dinner Tacos`]);
    expect(body(hook, THU, 'dinner')).toBe('Tacos');
  });

  it('U-MMUT-06 reverts a forbidden save, with no Retry, and reports it', async () => {
    jest.mocked(saveEntry).mockRejectedValue(fail('forbidden'));
    const hook = await renderMeals();
    await settle();
    const release = holdFetches();

    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Pizza' }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    await flush();

    expect(body(hook, MON, 'dinner')).toBe('Tacos');
    expect(lastToast()).toEqual({ message: "You don't have access to that" });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ category: 'forbidden' }));
    await release();
    await settle();
  });

  it('U-MMUT-07 reverts a save the database rejects as invalid, with no Retry, and reports it', async () => {
    jest.mocked(saveEntry).mockRejectedValue(fail('validation'));
    const hook = await renderMeals();
    await settle();
    const release = holdFetches();

    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Pizza' }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    await flush();

    expect(body(hook, MON, 'dinner')).toBe('Tacos');
    expect(lastToast()).toEqual({ message: "Couldn't save that meal" });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ category: 'validation' }));
    await release();
    await settle();
  });

  it('U-MMUT-08 starts the second save only after the first has settled, and keeps the second', async () => {
    const first = deferred();
    jest.mocked(saveEntry).mockImplementationOnce(async (v) => {
      await first.promise;
      apiCalls.push(`save ${v.date} ${v.mealType} ${v.body}`);
      server.push(
        makeEntryRow({ id: 'thu-dinner', meal_date: v.date, meal_type: v.mealType, body: v.body }),
      );
    });
    const hook = await renderMeals();

    await act(() =>
      hook.result.current.setMeal({ date: iso(THU), mealType: 'dinner', body: 'Pizza' }),
    );
    await act(() =>
      hook.result.current.setMeal({ date: iso(THU), mealType: 'dinner', body: 'Tacos' }),
    );
    await flush();
    expect(saveEntry).toHaveBeenCalledTimes(1);

    await act(() => first.resolve());
    await settle();
    expect(apiCalls).toEqual([`save ${THU} dinner Pizza`, `save ${THU} dinner Tacos`]);
    expect(entry(hook, THU, 'dinner')).toMatchObject({ id: 'thu-dinner', body: 'Tacos' });
  });

  it('U-MMUT-09 shows changes made offline at once, and sends them in order once back online', async () => {
    const hook = await renderMeals();
    await settle();
    await act(() => onlineManager.setOnline(false));

    await act(() =>
      hook.result.current.setMeal({ date: iso(TUE), mealType: 'lunch', body: 'Soup' }),
    );
    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: null }),
    );

    await waitFor(() => {
      expect(body(hook, TUE, 'lunch')).toBe('Soup');
      expect(entry(hook, MON, 'dinner')).toBeNull();
    });
    await flush();
    expect(apiCalls).toEqual([]);

    await act(() => onlineManager.setOnline(true));
    await settle();

    expect(apiCalls).toEqual([`save ${TUE} lunch Soup`, `clear ${MON} dinner`]);
    expect(body(hook, TUE, 'lunch')).toBe('Soup');
    expect(entry(hook, MON, 'dinner')).toBeNull();
  });

  it('U-MMUT-10 invalidates the meals once, after the last of three rapid saves settles', async () => {
    const last = deferred();
    jest
      .mocked(saveEntry)
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {})
      .mockReturnValueOnce(last.promise);
    const hook = await renderMeals();
    await settle();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const mealInvalidations = () =>
      invalidate.mock.calls.filter(([filters]) => {
        const key = filters?.queryKey;
        return (
          key !== undefined &&
          JSON.stringify(key) === JSON.stringify(['household', 'household-1', 'meals'])
        );
      });

    // In one act, so the second and third are queued before the first settles.
    await act(() => {
      hook.result.current.setMeal({ date: iso(MON), mealType: 'breakfast', body: 'Eggs' });
      hook.result.current.setMeal({ date: iso(MON), mealType: 'lunch', body: 'Salad' });
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Pizza' });
    });
    await waitFor(() => expect(saveEntry).toHaveBeenCalledTimes(3));
    await flush();
    expect(mealInvalidations()).toHaveLength(0);

    await act(() => last.resolve());
    await settle();
    expect(mealInvalidations()).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('U-MMUT-11 retries a network failure 3 times, then reverts and offers Retry', async () => {
    jest.mocked(saveEntry).mockRejectedValue(fail('network'));
    const hook = await renderMeals();
    await settle();
    const release = holdFetches();

    await act(() =>
      hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Pizza' }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    await flush();

    expect(saveEntry).toHaveBeenCalledTimes(4);
    expect(body(hook, MON, 'dinner')).toBe('Tacos');
    expect(lastToast()).toMatchObject({ action: { label: 'Retry' } });
    await release();
    await settle();
  });

  it.each(['validation', 'forbidden'] as const)(
    'U-MMUT-11 does not retry a %s failure',
    async (category) => {
      jest.mocked(saveEntry).mockRejectedValue(fail(category));
      const hook = await renderMeals();

      await act(() =>
        hook.result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Pizza' }),
      );
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

      expect(saveEntry).toHaveBeenCalledTimes(1);
      await settle();
    },
  );

  it('U-MMUT-16 saves a date whose week is not cached without patching anything', async () => {
    const hook = await renderMeals();
    await settle();
    const otherWeek = mealKeys.week('household-1', iso('2026-11-30'));

    await act(() =>
      hook.result.current.setMeal({ date: iso('2026-12-02'), mealType: 'lunch', body: 'Soup' }),
    );
    await settle();

    expect(saveEntry).toHaveBeenCalledWith({
      householdId: 'household-1',
      date: '2026-12-02',
      mealType: 'lunch',
      body: 'Soup',
      libraryMealId: null,
    });
    expect(queryClient.getQueryData(otherWeek)).toBeUndefined();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('ignores a save before the household is ready', async () => {
    mockHousehold = { status: 'loading' };
    const { result } = await renderMeals({ waitForReady: false });

    await act(() => result.current.setMeal({ date: iso(MON), mealType: 'dinner', body: 'Pizza' }));
    await flush();

    expect(saveEntry).not.toHaveBeenCalled();
    expect(queryClient.isMutating()).toBe(0);
  });
});

describe('useRecentLibraryMealIds', () => {
  const LINKED: MealEntryRow[] = [
    makeEntryRow({
      id: 'a',
      meal_date: MON,
      library_meal_id: 'meal-1',
      updated_at: '2026-10-19T09:00:00+00:00',
    }),
    makeEntryRow({
      id: 'b',
      meal_date: TUE,
      body: 'Typed',
      updated_at: '2026-10-20T09:00:00+00:00',
    }),
    makeEntryRow({
      id: 'c',
      meal_date: WED,
      library_meal_id: 'meal-2',
      updated_at: '2026-10-21T09:00:00+00:00',
    }),
  ];

  function useRecentAndSave() {
    return { recent: useRecentLibraryMealIds(), setMeal: useSetMeal(0) };
  }

  async function renderRecent() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(useRecentAndSave, { wrapper });
  }

  it('is empty until loaded, then gives the linked meals, newest first', async () => {
    server = LINKED.map((r) => ({ ...r }));
    const loaded = deferred();
    const serverFetch = jest.mocked(fetchRecentLibraryMealIds).getMockImplementation()!;
    jest.mocked(fetchRecentLibraryMealIds).mockImplementationOnce(async (hid) => {
      await loaded.promise;
      return serverFetch(hid);
    });
    const { result } = await renderRecent();

    expect(result.current.recent).toEqual([]);
    await act(() => loaded.resolve());

    await waitFor(() => expect(result.current.recent).toEqual(['meal-2', 'meal-1']));
    expect(fetchRecentLibraryMealIds).toHaveBeenCalledWith('household-1');
    expect(queryClient.getQueryData(mealKeys.recent('household-1'))).toEqual(['meal-2', 'meal-1']);
  });

  it('runs no query until the household is ready', async () => {
    mockHousehold = { status: 'loading' };
    const { result } = await renderRecent();
    await flush();

    expect(result.current.recent).toEqual([]);
    expect(fetchRecentLibraryMealIds).not.toHaveBeenCalled();
  });

  it('stays empty, with no toast, when the fetch fails', async () => {
    jest.mocked(fetchRecentLibraryMealIds).mockRejectedValue(fail('forbidden'));
    const { result } = await renderRecent();

    await waitFor(() => expect(fetchRecentLibraryMealIds).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    await flush();

    expect(result.current.recent).toEqual([]);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('refreshes after a plan is saved, since it sits under the meals key', async () => {
    server = LINKED.map((r) => ({ ...r }));
    queryClient.setQueryData(mealKeys.week('household-1', WEEK), server);
    const { result } = await renderRecent();
    await waitFor(() => expect(result.current.recent).toEqual(['meal-2', 'meal-1']));

    jest
      .mocked(saveEntry)
      .mockImplementationOnce(async ({ date, mealType, body, libraryMealId }) => {
        server.push(
          makeEntryRow({
            id: 'd',
            meal_date: date,
            meal_type: mealType,
            body,
            library_meal_id: libraryMealId,
            updated_at: '2026-10-22T09:00:00+00:00',
          }),
        );
      });
    await act(() =>
      result.current.setMeal({
        date: iso(THU),
        mealType: 'lunch',
        body: 'Ramen',
        libraryMealId: 'meal-4',
      }),
    );
    await settle();

    expect(result.current.recent).toEqual(['meal-4', 'meal-2', 'meal-1']);
  });
});
