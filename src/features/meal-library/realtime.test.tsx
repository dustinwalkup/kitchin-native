import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { groceryTableHandlers } from '@/features/groceries/realtime';
import {
  type TableHandlers,
  useHouseholdRealtime,
} from '@/features/household/use-household-realtime';
import { mealTableHandlers } from '@/features/meals/realtime';
import { MAX_WAIT_MS, QUIET_MS } from '@/lib/realtime/coalescer';
import { makeMealRow, makeTagRow } from '@/test/factories';
import { mockRealtime, resetBackend } from '@/test/mock-backend';

import { fetchLibrary, runSavePlan, type SaveResult } from './api';
import type { MealRow, TagRow } from './domain';
import { useLibrary, useSaveMeal } from './hooks';
import { libraryTableHandlers, onLibraryTableChange } from './realtime';

// U-LRT-01 to 03 (4-test-plan §3.5). The household channel runs against the fake socket with the
// handlers the (app) layout passes, and the real library hooks run against a mocked api.ts.

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock('./api', () => ({
  fetchLibrary: jest.fn(),
  runSavePlan: jest.fn(),
  deleteMeal: jest.fn(),
}));
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  setReportingUser: jest.fn(),
}));
jest.mock('@/features/household/household-provider', () => ({
  useHousehold: () => ({ status: 'ready', household: { id: 'household-1' } }),
}));

const HOUSEHOLD_ID = 'household-1';
const LIBRARY_KEY = ['household', HOUSEHOLD_ID, 'library'];
const MEALS_KEY = ['household', HOUSEHOLD_ID, 'meals'];
const GROCERY_KEY = ['household', HOUSEHOLD_ID, 'grocery'];

const COMFORT = makeTagRow({ id: 'tag-comfort', name: 'Comfort food' });
const TACOS = makeMealRow({ id: 'meal-tacos', name: 'Chicken tacos' });
const STEW = makeMealRow({
  id: 'meal-stew',
  name: 'Beef stew',
  library_meal_tags: [{ tag_id: 'tag-comfort' }],
});
const CRUMBLE = makeMealRow({ id: 'meal-crumble', name: 'Apple crumble' });

// The (app) layout's TABLE_HANDLERS, built the same way.
const APP_HANDLERS: TableHandlers = {
  ...groceryTableHandlers,
  ...mealTableHandlers,
  ...libraryTableHandlers,
};

// What the database holds. The tests change it to play the other phone.
let server: { meals: MealRow[]; tags: TagRow[] };
let queryClient: QueryClient;
let handlers: TableHandlers;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetBackend();
  server = { meals: [TACOS], tags: [COMFORT] };
  handlers = libraryTableHandlers;
  jest.mocked(fetchLibrary).mockImplementation(async () => ({
    meals: server.meals.map((r) => ({ ...r })),
    tags: server.tags.map((r) => ({ ...r })),
  }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

function useLibraryWithRealtime() {
  useHouseholdRealtime(handlers);
  return { view: useLibrary(), save: useSaveMeal() };
}

async function renderLibrary() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(useLibraryWithRealtime, { wrapper });
  await waitFor(() => expect(hook.result.current.view.status).toBe('ready'));
  await waitFor(() => expect(mockRealtime.channels).toHaveLength(1));
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderLibrary>>;
const names = ({ result }: Hook) => result.current.view.library.meals.map((m) => m.name);
const fetches = () => jest.mocked(fetchLibrary).mock.calls.length;

const event = (table: string) => ({
  type: 'broadcast' as const,
  event: 'INSERT',
  payload: { table },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('libraryTableHandlers', () => {
  it('sends each library table to onLibraryTableChange', () => {
    expect(libraryTableHandlers).toEqual({
      library_meals: onLibraryTableChange,
      library_tags: onLibraryTableChange,
      library_meal_tags: onLibraryTableChange,
    });
  });
});

describe('onLibraryTableChange', () => {
  it.each(['library_meals', 'library_tags', 'library_meal_tags'])(
    'U-LRT-01 refetches the library for a %s event, and leaves the grocery and meal queries alone',
    async (table) => {
      const hook = await renderLibrary();
      queryClient.setQueryData([...GROCERY_KEY, 'list'], { listId: 'list-1', rows: [] });
      queryClient.setQueryData([...MEALS_KEY, 'week', '2026-10-19'], []);
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

      // The other phone adds Beef stew, tagged Comfort food.
      server.meals = [TACOS, STEW];
      mockRealtime.latest().emitBroadcast(event(table));
      await act(() => jest.advanceTimersByTimeAsync(QUIET_MS));

      expect(invalidate.mock.calls).toEqual([[{ queryKey: LIBRARY_KEY }]]);
      await waitFor(() => expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']));
      expect(fetches()).toBe(2);
      expect(queryClient.getQueryState([...GROCERY_KEY, 'list'])?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState([...MEALS_KEY, 'week', '2026-10-19'])?.isInvalidated).toBe(
        false,
      );
    },
  );

  it('U-LRT-02 leaves an event during a save to the save’s own refetch (R11.5)', async () => {
    const save = deferred<SaveResult>();
    jest.mocked(runSavePlan).mockReturnValue(save.promise);
    const hook = await renderLibrary();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    let saving!: Promise<unknown>;
    await act(async () => {
      saving = hook.result.current.save({
        base: null,
        mealId: 'meal-crumble',
        meal: {
          name: 'Apple crumble',
          description: null,
          ingredients: null,
          mealType: null,
          imagePath: null,
          tags: [],
        },
      });
    });
    await waitFor(() => expect(runSavePlan).toHaveBeenCalled());

    // The other phone adds Beef stew while Apple crumble is still saving. A refetch now could
    // show this phone's save half done.
    server.meals = [TACOS, STEW];
    mockRealtime.latest().emitBroadcast(event('library_meals'));
    await act(() => jest.advanceTimersByTimeAsync(MAX_WAIT_MS));

    expect(invalidate).not.toHaveBeenCalled();
    expect(fetches()).toBe(1);
    expect(names(hook)).toEqual(['Chicken tacos']);

    // The save lands, and its refetch brings in Beef stew as well.
    server.meals = [TACOS, STEW, CRUMBLE];
    await act(async () => {
      save.resolve({ tags: [], addedTagIds: [] });
      await saving;
    });

    await waitFor(() =>
      expect(names(hook)).toEqual(['Apple crumble', 'Beef stew', 'Chicken tacos']),
    );
    expect(invalidate.mock.calls).toEqual([[{ queryKey: LIBRARY_KEY }]]);
    expect(fetches()).toBe(2);
  });

  it('refetches for events again once the save has settled', async () => {
    jest.mocked(runSavePlan).mockResolvedValue({ tags: [], addedTagIds: [] });
    const hook = await renderLibrary();
    await act(async () => {
      await hook.result.current.save({
        base: null,
        mealId: 'meal-crumble',
        meal: {
          name: 'Apple crumble',
          description: null,
          ingredients: null,
          mealType: null,
          imagePath: null,
          tags: [],
        },
      });
    });
    await waitFor(() => expect(fetches()).toBe(2));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    server.meals = [TACOS, STEW];
    mockRealtime.latest().emitBroadcast(event('library_tags'));
    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS));

    await waitFor(() => expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']));
    expect(fetches()).toBe(3);
  });
});

describe("the (app) layout's handlers", () => {
  it('U-LRT-03 run the library and meals handlers once each for a burst across their tables', async () => {
    handlers = APP_HANDLERS;
    await renderLibrary();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const channel = mockRealtime.latest();

    // Saving a meal with a new tag, and deleting one, on the other phone; and a meal planned.
    for (let i = 0; i < 3; i++) {
      channel.emitBroadcast(event('library_tags'));
      channel.emitBroadcast(event('library_meals'));
      channel.emitBroadcast(event('library_meal_tags'));
    }
    channel.emitBroadcast(event('meal_entries'));

    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS - 1));
    expect(invalidate).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTimeAsync(1));

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: LIBRARY_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MEALS_KEY });
    await waitFor(() => expect(fetches()).toBe(2));
  });
});
