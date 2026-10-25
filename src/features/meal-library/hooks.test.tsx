import * as Sentry from '@sentry/react-native';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';

import { ApiError, type ErrorCategory } from '@/lib/errors';
import { queryClient as appQueryClient } from '@/lib/query-client';
import { makeMealRow, makeTagRow } from '@/test/factories';

import {
  deleteMeal,
  fetchLibrary,
  removeImages,
  runSavePlan,
  type SaveResult,
  signImageUrls,
  uploadImage,
} from './api';
import { IMAGE_URL_REFRESH_MS } from './constants';
import { type CleanMeal, type MealRow, type SavePlan, tagKey, type TagRow } from './domain';
import {
  libraryKeys,
  type SaveMealVariables,
  useDeleteMeal,
  useLibrary,
  useMealImageUrls,
  useNewImagePath,
  useSaveMeal,
} from './hooks';

jest.mock('./api', () => ({
  fetchLibrary: jest.fn(),
  runSavePlan: jest.fn(),
  deleteMeal: jest.fn(),
  uploadImage: jest.fn(),
  removeImages: jest.fn(),
  signImageUrls: jest.fn(),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

let mockHousehold: { status: string; household?: { id: string } } = {
  status: 'ready',
  household: { id: 'household-1' },
};
jest.mock('@/features/household/household-provider', () => ({
  useHousehold: () => mockHousehold,
}));

// Reporting is real, down to the global Sentry mock, so these tests see what reaches Sentry rather
// than what the hooks hand the facade. In development builds the facade also logs each report.
beforeAll(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterAll(() => jest.mocked(console.warn).mockRestore());

const HID = 'household-1';
const KEY = libraryKeys.all(HID);

interface Rows {
  meals: MealRow[];
  tags: TagRow[];
}

const TAGS = [
  makeTagRow({ id: 'tag-comfort', name: 'Comfort food' }),
  makeTagRow({ id: 'tag-quick', name: 'Quick & Easy' }),
];
const OLD_PHOTO = 'household-1/old.jpg';
const NEW_PHOTO = 'household-1/new.jpg';
const MEALS = [
  makeMealRow({
    id: 'meal-tacos',
    name: 'Chicken tacos',
    meal_type: 'dinner',
    image_path: OLD_PHOTO,
    library_meal_tags: [{ tag_id: 'tag-quick' }, { tag_id: 'tag-comfort' }],
  }),
  makeMealRow({
    id: 'meal-stew',
    name: 'Beef stew',
    library_meal_tags: [{ tag_id: 'tag-comfort' }],
  }),
];

// A new meal with an existing tag and a new one.
const CRUMBLE: CleanMeal = {
  name: 'Apple crumble',
  description: 'With custard',
  ingredients: null,
  mealType: null,
  imagePath: null,
  tags: [
    { kind: 'existing', id: 'tag-quick' },
    { kind: 'new', name: 'Dessert' },
  ],
};
const NEW_SAVE: SaveMealVariables = { base: null, meal: CRUMBLE, mealId: 'meal-crumble' };

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// A fake backend behind the mocked api.ts, so the refetch after each mutation returns what the
// database would hold. A test overrides a call to make it fail or wait.
let server: Rows;
let apiCalls: string[];

// The plan's fields as the table's columns, as api.ts sends them.
function columns(fields: Partial<Omit<CleanMeal, 'tags'>>): Partial<MealRow> {
  const { mealType, imagePath, ...rest } = fields;
  return {
    ...rest,
    ...(mealType !== undefined && { meal_type: mealType }),
    ...(imagePath !== undefined && { image_path: imagePath }),
  };
}

// Runs a plan as api.ts and the database do (design §3.3): a new tag whose key exists comes back as
// the existing tag, an edit of a missing meal is not_found, and links are added and removed by pair.
async function serverRunSavePlan(_: string, plan: SavePlan): Promise<SaveResult> {
  const tags = plan.newTags.map((name) => {
    let tag = server.tags.find((t) => t.name_key === tagKey(name));
    if (tag === undefined) {
      tag = makeTagRow({ id: `tag-${tagKey(name)}`, name });
      server.tags.push(tag);
    }
    return tag;
  });
  const { meal } = plan;
  const id = meal.kind === 'upsert' ? meal.row.id : meal.id;
  apiCalls.push(`save ${id}`);
  let row = server.meals.find((r) => r.id === id);
  if (meal.kind === 'upsert') {
    row = { ...(row ?? makeMealRow()), ...columns(meal.row) };
    server.meals = [...server.meals.filter((r) => r.id !== id), row];
  } else if (row === undefined) {
    throw new ApiError('not_found', { table: 'library_meals', operation: 'update', recordId: id });
  } else if (meal.kind === 'update') {
    Object.assign(row, columns(meal.changes));
  }
  const addedTagIds = [
    ...new Set(
      plan.addTags.map((choice) =>
        choice.kind === 'existing'
          ? choice.id
          : tags.find((t) => t.name_key === tagKey(choice.name))!.id,
      ),
    ),
  ];
  const links = new Set([...row.library_meal_tags.map((link) => link.tag_id), ...addedTagIds]);
  plan.removeTagIds.forEach((tagId) => links.delete(tagId));
  row.library_meal_tags = [...links].map((tag_id) => ({ tag_id }));
  return { tags: copy(tags), addedTagIds };
}

const fail = (category: ErrorCategory, constraint?: string) =>
  new ApiError(category, {
    table: 'library_meals',
    operation: 'upsert',
    ...(constraint === undefined ? {} : { constraint }),
  });

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let queryClient: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  mockHousehold = { status: 'ready', household: { id: HID } };
  server = copy({ meals: MEALS, tags: TAGS });
  apiCalls = [];

  jest.mocked(fetchLibrary).mockImplementation(async () => copy(server));
  jest.mocked(runSavePlan).mockImplementation(serverRunSavePlan);
  jest.mocked(deleteMeal).mockImplementation(async (id) => {
    apiCalls.push(`delete ${id}`);
    server.meals = server.meals.filter((r) => r.id !== id);
  });
  jest.mocked(uploadImage).mockImplementation(async (path) => {
    apiCalls.push(`upload ${path}`);
  });
  jest.mocked(removeImages).mockImplementation(async (paths) => {
    apiCalls.push(`remove ${paths.join(',')}`);
  });
  jest
    .mocked(signImageUrls)
    .mockImplementation(async (paths) =>
      Object.fromEntries(paths.map((path) => [path, `https://storage.test/${path}`])),
    );

  // The app's defaults. Queries keep TanStack's 5-minute default gcTime, so U-LMUT-13 proves the
  // library query sets its own. Mutations get an infinite one, so no settled mutation leaves a timer
  // that would keep Jest from exiting.
  const defaults = appQueryClient.getDefaultOptions();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { ...defaults.queries, retryDelay: 0, gcTime: 5 * 60_000 },
      mutations: { ...defaults.mutations, gcTime: Infinity },
    },
  });
});

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

function useLibraryHooks() {
  return { view: useLibrary(), save: useSaveMeal(), remove: useDeleteMeal() };
}

async function renderLibrary({ waitForReady = true } = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(useLibraryHooks, { wrapper });
  if (waitForReady) await waitFor(() => expect(hook.result.current.view.status).toBe('ready'));
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderLibrary>>;

const library = ({ result }: Hook) => result.current.view.library;
const names = (hook: Hook) => library(hook).meals.map((m) => m.name);
const meal = (hook: Hook, id: string) => library(hook).meals.find((m) => m.id === id);
const tagNames = (hook: Hook, id: string) =>
  meal(hook, id)?.tagIds.map((tagId) => library(hook).tagsById.get(tagId)?.name);

/** Calls a hook's function inside act and returns what it resolved to. */
async function run<T>(call: () => Promise<T>): Promise<T> {
  let result!: T;
  await act(async () => {
    result = await call();
  });
  return result;
}

/** Lets pending promises and timers run, for checks that something has *not* happened. */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 10)));

/** Waits until every mutation has settled and every fetch has finished, then one render more. */
async function settle() {
  await waitFor(() => {
    expect(queryClient.isMutating()).toBe(0);
    expect(queryClient.isFetching()).toBe(0);
  });
  await flush();
}

/**
 * Makes every fetch wait until the returned function is called, so what the library shows meanwhile
 * can only have come from a mutation's own cache update.
 */
function holdFetches() {
  const held = deferred();
  const serverFetch = jest.mocked(fetchLibrary).getMockImplementation()!;
  jest.mocked(fetchLibrary).mockImplementation(async (...args) => {
    await held.promise;
    return serverFetch(...args);
  });
  return () => act(() => held.resolve());
}

const reported = () =>
  jest.mocked(Sentry.captureException).mock.calls.map(([error]) => (error as ApiError).category);

describe('useLibrary', () => {
  it("builds the household's library from its meals and tags, sorted by name", async () => {
    const hook = await renderLibrary();

    expect(fetchLibrary).toHaveBeenCalledWith(HID);
    expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']);
    expect(tagNames(hook, 'meal-tacos')).toEqual(['Comfort food', 'Quick & Easy']);
    expect(meal(hook, 'meal-tacos')).toMatchObject({ mealType: 'dinner', imagePath: OLD_PHOTO });
    expect(library(hook).tags.map((t) => t.name)).toEqual(['Comfort food', 'Quick & Easy']);
    await settle();
  });

  it('U-LMUT-12 is loading on the first fetch, with an empty library', async () => {
    jest.mocked(fetchLibrary).mockReturnValue(new Promise(() => {}));
    const hook = await renderLibrary({ waitForReady: false });

    expect(hook.result.current.view.status).toBe('loading');
    expect(library(hook)).toEqual({ meals: [], tags: [], tagsById: new Map() });
  });

  it('U-LMUT-12 is waiting when the first fetch is paused offline', async () => {
    onlineManager.setOnline(false);
    const hook = await renderLibrary({ waitForReady: false });

    expect(hook.result.current.view.status).toBe('waiting');
    expect(fetchLibrary).not.toHaveBeenCalled();
  });

  it('U-LMUT-12 is error when the first fetch fails, and reports the error', async () => {
    jest.mocked(fetchLibrary).mockRejectedValue(fail('server'));
    const hook = await renderLibrary({ waitForReady: false });

    await waitFor(() => expect(hook.result.current.view.status).toBe('error'));
    expect(hook.result.current.view.refreshFailedAt).toBeNull();
    expect(reported()).toEqual(['server']);
  });

  it('U-LMUT-12 stays ready, and marks each failed refetch until one succeeds', async () => {
    const hook = await renderLibrary();
    await settle();
    expect(hook.result.current.view.refreshFailedAt).toBeNull();

    jest.mocked(fetchLibrary).mockRejectedValueOnce(fail('server'));
    await act(() => hook.result.current.view.refetch());
    await flush();
    const firstFailure = hook.result.current.view.refreshFailedAt;
    expect(firstFailure).toEqual(expect.any(Number));
    expect(hook.result.current.view.status).toBe('ready');
    expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']);

    // A second failure gets its own mark, even in the same millisecond on a fast machine.
    const now = jest.spyOn(Date, 'now').mockReturnValue(firstFailure! + 1000);
    jest.mocked(fetchLibrary).mockRejectedValueOnce(fail('server'));
    await act(() => hook.result.current.view.refetch());
    await flush();
    expect(hook.result.current.view.refreshFailedAt).toBe(firstFailure! + 1000);
    now.mockRestore();

    await act(() => hook.result.current.view.refetch());
    await flush();
    expect(hook.result.current.view.refreshFailedAt).toBeNull();
  });

  it('runs no query until the household is ready', async () => {
    mockHousehold = { status: 'loading' };
    const hook = await renderLibrary({ waitForReady: false });
    await flush();

    expect(hook.result.current.view.status).toBe('loading');
    expect(fetchLibrary).not.toHaveBeenCalled();
  });

  it('U-LMUT-13 keeps the library cached unobserved, and a new observer gets it at once', async () => {
    const first = await renderLibrary();
    await settle();

    jest.useFakeTimers();
    try {
      await first.unmount();
      jest.advanceTimersByTime(10 * 60_000);
      const query = queryClient.getQueryCache().find({ queryKey: KEY });
      expect(query?.state.data).toBeDefined();
      expect(query?.gcTime).toBe(Infinity);
    } finally {
      jest.useRealTimers();
    }

    const second = await renderLibrary({ waitForReady: false });
    expect(second.result.current.view.status).toBe('ready');
    expect(names(second)).toEqual(['Beef stew', 'Chicken tacos']);
    await settle();
  });

  it('U-LMUT-14 leaves a bad row out and reports it once, across re-renders and refetches', async () => {
    server.meals.push(makeMealRow({ id: 'meal-bad-14', name: '' }));
    const hook = await renderLibrary();

    expect(library(hook).meals.map((m) => m.id)).not.toContain('meal-bad-14');
    await hook.rerender({});
    await act(() => hook.result.current.view.refetch());
    await act(() => hook.result.current.view.refetch());
    await settle();

    const reports = jest
      .mocked(Sentry.captureMessage)
      .mock.calls.filter(([key]) => key === 'invalid_library_row:library_meals:meal-bad-14:name');
    expect(reports).toHaveLength(1);
  });
});

describe('useSaveMeal', () => {
  it('U-LMUT-01 offline, a save and a delete fail at once and send nothing', async () => {
    const hook = await renderLibrary();
    await settle();
    await act(() => onlineManager.setOnline(false));

    await expect(run(() => hook.result.current.save(NEW_SAVE))).resolves.toEqual({
      ok: false,
      reason: 'offline',
    });
    await expect(run(() => hook.result.current.remove('meal-stew'))).resolves.toEqual({
      ok: false,
      reason: 'offline',
    });

    expect(runSavePlan).not.toHaveBeenCalled();
    expect(deleteMeal).not.toHaveBeenCalled();
    expect(reported()).toEqual([]);
    expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']);
  });

  it('U-LMUT-02 returns offline for a network failure, after one attempt, unreported', async () => {
    jest.mocked(runSavePlan).mockRejectedValue(fail('network'));
    const hook = await renderLibrary();

    await expect(run(() => hook.result.current.save(NEW_SAVE))).resolves.toEqual({
      ok: false,
      reason: 'offline',
    });
    await settle();

    expect(runSavePlan).toHaveBeenCalledTimes(1);
    expect(reported()).toEqual([]);
  });

  it.each([
    ['U-LMUT-03', 'not_found', undefined, { ok: false, reason: 'deleted' }, []],
    ['U-LMUT-04', 'forbidden', undefined, { ok: false, reason: 'forbidden' }, ['forbidden']],
    [
      'U-LMUT-05',
      'validation',
      'library_meals_name_check',
      { ok: false, reason: 'invalid', field: 'name' },
      ['validation'],
    ],
    [
      'U-LMUT-05',
      'validation',
      undefined,
      { ok: false, reason: 'invalid', field: null },
      ['validation'],
    ],
    ['U-LMUT-06', 'server', undefined, { ok: false, reason: 'failed' }, ['server']],
  ] as const)(
    '%s turns a %s failure (constraint %s) into %o',
    async (_, category, constraint, outcome, reports) => {
      jest.mocked(runSavePlan).mockRejectedValue(fail(category, constraint));
      const hook = await renderLibrary();

      await expect(run(() => hook.result.current.save(NEW_SAVE))).resolves.toEqual(outcome);
      await settle();

      expect(runSavePlan).toHaveBeenCalledTimes(1);
      expect(reported()).toEqual(reports);
      expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']);
    },
  );

  it('U-LMUT-07 leaves the cached library unchanged while a save is pending', async () => {
    const saving = deferred();
    jest.mocked(runSavePlan).mockImplementationOnce(async (...args) => {
      await saving.promise;
      return serverRunSavePlan(...args);
    });
    const hook = await renderLibrary();
    await settle();
    const before = queryClient.getQueryData<Rows>(KEY);

    let save!: Promise<unknown>;
    await act(async () => {
      save = hook.result.current.save(NEW_SAVE);
    });
    await waitFor(() => expect(runSavePlan).toHaveBeenCalled());
    await flush();

    expect(queryClient.getQueryData<Rows>(KEY)).toBe(before);
    expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']);

    await act(async () => {
      saving.resolve();
      await save;
    });
    await settle();
  });

  it('U-LMUT-08 puts a new meal and its new tag in the cached library, sorted, before resolving', async () => {
    const hook = await renderLibrary();
    await settle();
    const release = holdFetches();

    let cachedOnResolve: Rows | undefined;
    const outcome = await run(() =>
      hook.result.current.save(NEW_SAVE).then((o) => {
        cachedOnResolve = queryClient.getQueryData<Rows>(KEY);
        return o;
      }),
    );

    expect(outcome).toEqual({ ok: true, mealId: 'meal-crumble' });
    expect(cachedOnResolve?.meals.map((m) => m.id)).toContain('meal-crumble');
    expect(cachedOnResolve?.tags.map((t) => t.name)).toContain('Dessert');
    await flush();
    // The refetch is held, so this is the mutation's own update.
    expect(names(hook)).toEqual(['Apple crumble', 'Beef stew', 'Chicken tacos']);
    expect(meal(hook, 'meal-crumble')).toMatchObject({
      name: 'Apple crumble',
      description: 'With custard',
      ingredients: null,
      mealType: null,
      imagePath: null,
    });
    expect(tagNames(hook, 'meal-crumble')).toEqual(['Dessert', 'Quick & Easy']);
    expect(library(hook).tags.map((t) => t.name)).toEqual([
      'Comfort food',
      'Dessert',
      'Quick & Easy',
    ]);

    await release();
    await settle();
    expect(tagNames(hook, 'meal-crumble')).toEqual(['Dessert', 'Quick & Easy']);
  });

  it('U-LMUT-08 puts an edit in the cache, keeping a tag the other member added since the form opened', async () => {
    const hook = await renderLibrary();
    await settle();
    const base = meal(hook, 'meal-tacos')!;
    // The other member tags the meal Veggie, and the library refetches.
    server.tags.push(makeTagRow({ id: 'tag-veggie', name: 'Veggie' }));
    server.meals
      .find((r) => r.id === 'meal-tacos')!
      .library_meal_tags.push({ tag_id: 'tag-veggie' });
    await act(() => hook.result.current.view.refetch());
    const release = holdFetches();

    const outcome = await run(() =>
      hook.result.current.save({
        base,
        mealId: base.id,
        meal: {
          name: 'Chicken tacos',
          description: 'Corn tortillas',
          ingredients: null,
          mealType: 'dinner',
          imagePath: OLD_PHOTO,
          tags: [
            { kind: 'existing', id: 'tag-comfort' },
            { kind: 'new', name: 'Spicy' },
          ],
        },
      }),
    );
    await flush();

    expect(outcome).toEqual({ ok: true, mealId: 'meal-tacos' });
    // The type and photo, which this edit left alone, stay as the cache had them.
    expect(meal(hook, 'meal-tacos')).toMatchObject({
      name: 'Chicken tacos',
      description: 'Corn tortillas',
      mealType: 'dinner',
      imagePath: OLD_PHOTO,
    });
    expect(tagNames(hook, 'meal-tacos')).toEqual(['Comfort food', 'Spicy', 'Veggie']);
    await release();
    await settle();
    expect(tagNames(hook, 'meal-tacos')).toEqual(['Comfort food', 'Spicy', 'Veggie']);
  });

  it('U-LMUT-08 puts a tags-only edit in the cache, with the fields as they were', async () => {
    const hook = await renderLibrary();
    await settle();
    const base = meal(hook, 'meal-stew')!;
    const release = holdFetches();

    await run(() =>
      hook.result.current.save({
        base,
        mealId: base.id,
        meal: {
          name: base.name,
          description: base.description,
          ingredients: base.ingredients,
          mealType: base.mealType,
          imagePath: base.imagePath,
          tags: [{ kind: 'existing', id: 'tag-quick' }],
        },
      }),
    );
    await flush();

    expect(jest.mocked(runSavePlan).mock.calls[0]?.[1].meal).toEqual({
      kind: 'check',
      id: 'meal-stew',
    });
    expect(meal(hook, 'meal-stew')).toMatchObject({ name: 'Beef stew', description: null });
    expect(tagNames(hook, 'meal-stew')).toEqual(['Quick & Easy']);
    await release();
    await settle();
  });

  it('U-LMUT-08 keeps a saved meal when a refetch begun before the save lands after it', async () => {
    const hook = await renderLibrary();
    await settle();
    const stale = copy(server);
    const staleFetch = deferred();
    jest.mocked(fetchLibrary).mockImplementationOnce(() => staleFetch.promise.then(() => stale));
    // A second save waits, so the first isn't the last to settle and doesn't refetch.
    const second = deferred();
    jest
      .mocked(runSavePlan)
      .mockImplementationOnce(serverRunSavePlan)
      .mockImplementationOnce(async (...args) => {
        await second.promise;
        return serverRunSavePlan(...args);
      });

    await act(async () => {
      void hook.result.current.view.refetch();
    });
    let saves!: Promise<unknown>;
    await act(async () => {
      saves = Promise.all([
        hook.result.current.save(NEW_SAVE),
        hook.result.current.save({ ...NEW_SAVE, mealId: 'meal-crumble-2' }),
      ]);
    });
    await waitFor(() => expect(runSavePlan).toHaveBeenCalledTimes(2));
    await act(async () => staleFetch.resolve());
    await flush();

    expect(names(hook)).toContain('Apple crumble');
    await act(async () => {
      second.resolve();
      await saves;
    });
    await settle();
  });

  it('returns ok for an unchanged edit, and sends nothing', async () => {
    const hook = await renderLibrary();
    await settle();
    const base = meal(hook, 'meal-stew')!;

    const outcome = await run(() =>
      hook.result.current.save({
        base,
        mealId: base.id,
        meal: {
          name: base.name,
          description: base.description,
          ingredients: base.ingredients,
          mealType: base.mealType,
          imagePath: base.imagePath,
          tags: base.tagIds.map((id) => ({ kind: 'existing', id })),
        },
        // A photo picked and then put back as it was is no change either.
        upload: null,
      }),
    );

    expect(outcome).toEqual({ ok: true, mealId: 'meal-stew' });
    expect(runSavePlan).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
    expect(removeImages).not.toHaveBeenCalled();
    await settle();
  });

  it('U-LMUT-10 starts the second save only after the first has settled', async () => {
    const first = deferred();
    jest.mocked(runSavePlan).mockImplementationOnce(async (...args) => {
      await first.promise;
      return serverRunSavePlan(...args);
    });
    const hook = await renderLibrary();

    let saves!: Promise<unknown>;
    await act(async () => {
      saves = Promise.all([
        hook.result.current.save(NEW_SAVE),
        hook.result.current.save({ ...NEW_SAVE, mealId: 'meal-crumble-2' }),
      ]);
    });
    await waitFor(() => expect(runSavePlan).toHaveBeenCalledTimes(1));
    await flush();
    expect(runSavePlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
      await saves;
    });
    await settle();
    expect(apiCalls).toEqual(['save meal-crumble', 'save meal-crumble-2']);
  });

  it('U-LMUT-11 invalidates the library once, after the last of three saves settles', async () => {
    const last = deferred();
    jest
      .mocked(runSavePlan)
      .mockImplementationOnce(serverRunSavePlan)
      .mockImplementationOnce(serverRunSavePlan)
      .mockImplementationOnce(async (...args) => {
        await last.promise;
        return serverRunSavePlan(...args);
      });
    const hook = await renderLibrary();
    await settle();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    let saves!: Promise<unknown>;
    await act(async () => {
      saves = Promise.all(
        ['meal-a', 'meal-b', 'meal-c'].map((mealId) =>
          hook.result.current.save({ ...NEW_SAVE, mealId }),
        ),
      );
    });
    await waitFor(() => expect(runSavePlan).toHaveBeenCalledTimes(3));
    await flush();
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      last.resolve();
      await saves;
    });
    await settle();
    expect(invalidate.mock.calls).toEqual([[{ queryKey: KEY }]]);
  });

  it('U-LMUT-15 runs the same plan again when a partly saved meal is retried', async () => {
    // The meal is stored, then adding its links fails.
    jest.mocked(runSavePlan).mockImplementationOnce(async (hid, plan) => {
      await serverRunSavePlan(hid, { ...plan, addTags: [], removeTagIds: [] });
      throw fail('server');
    });
    const hook = await renderLibrary();

    await expect(run(() => hook.result.current.save(NEW_SAVE))).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    await expect(run(() => hook.result.current.save(NEW_SAVE))).resolves.toEqual({
      ok: true,
      mealId: 'meal-crumble',
    });
    await settle();

    const [[, firstPlan], [, retryPlan]] = jest.mocked(runSavePlan).mock.calls;
    expect(retryPlan).toEqual(firstPlan);
    expect(retryPlan).toMatchObject({
      meal: { kind: 'upsert', row: { id: 'meal-crumble' } },
      addTags: CRUMBLE.tags,
    });
    expect(server.meals.filter((r) => r.id === 'meal-crumble')).toHaveLength(1);
    expect(tagNames(hook, 'meal-crumble')).toEqual(['Dessert', 'Quick & Easy']);
  });

  describe('with a photo (design §6.5)', () => {
    // The tacos as the form opened them, with their stored photo.
    async function editTacos(changes: Partial<CleanMeal>, upload?: SaveMealVariables['upload']) {
      const hook = await renderLibrary();
      await settle();
      const base = meal(hook, 'meal-tacos')!;
      const outcome = await run(() =>
        hook.result.current.save({
          base,
          mealId: base.id,
          meal: {
            name: base.name,
            description: base.description,
            ingredients: base.ingredients,
            mealType: base.mealType,
            imagePath: base.imagePath,
            tags: base.tagIds.map((id) => ({ kind: 'existing', id })),
            ...changes,
          },
          upload,
        }),
      );
      return { hook, outcome };
    }

    it('uploads a picked photo first, then saves the meal naming it, then removes the old one', async () => {
      const { hook, outcome } = await editTacos(
        { imagePath: NEW_PHOTO },
        { uri: 'file:///new.jpg', path: NEW_PHOTO },
      );

      expect(outcome).toEqual({ ok: true, mealId: 'meal-tacos' });
      expect(uploadImage).toHaveBeenCalledWith(NEW_PHOTO, 'file:///new.jpg');
      expect(jest.mocked(runSavePlan).mock.calls[0]?.[1].meal).toEqual({
        kind: 'update',
        id: 'meal-tacos',
        changes: { imagePath: NEW_PHOTO },
      });
      expect(apiCalls).toEqual([`upload ${NEW_PHOTO}`, 'save meal-tacos', `remove ${OLD_PHOTO}`]);
      await settle();
      expect(meal(hook, 'meal-tacos')?.imagePath).toBe(NEW_PHOTO);
    });

    it('uploads the photo of a new meal, and has no old one to remove', async () => {
      const hook = await renderLibrary();
      await settle();

      await run(() =>
        hook.result.current.save({
          ...NEW_SAVE,
          meal: { ...CRUMBLE, mealType: 'dinner', imagePath: NEW_PHOTO },
          upload: { uri: 'file:///new.jpg', path: NEW_PHOTO },
        }),
      );

      expect(apiCalls).toEqual([`upload ${NEW_PHOTO}`, 'save meal-crumble']);
      expect(removeImages).not.toHaveBeenCalled();
      await flush();
      expect(meal(hook, 'meal-crumble')).toMatchObject({
        mealType: 'dinner',
        imagePath: NEW_PHOTO,
      });
      await settle();
    });

    it('removes the old photo once the meal no longer names it', async () => {
      const { hook, outcome } = await editTacos({ imagePath: null });

      expect(outcome).toEqual({ ok: true, mealId: 'meal-tacos' });
      expect(uploadImage).not.toHaveBeenCalled();
      expect(apiCalls).toEqual(['save meal-tacos', `remove ${OLD_PHOTO}`]);
      await flush();
      expect(meal(hook, 'meal-tacos')?.imagePath).toBeNull();
      await settle();
    });

    it('keeps the photo when only the meal type changed', async () => {
      const { hook } = await editTacos({ mealType: 'lunch' });

      expect(jest.mocked(runSavePlan).mock.calls[0]?.[1].meal).toEqual({
        kind: 'update',
        id: 'meal-tacos',
        changes: { mealType: 'lunch' },
      });
      expect(removeImages).not.toHaveBeenCalled();
      await flush();
      expect(meal(hook, 'meal-tacos')).toMatchObject({ mealType: 'lunch', imagePath: OLD_PHOTO });
      await settle();
    });

    it('still saves when the old photo cannot be removed, and only reports it', async () => {
      jest
        .mocked(removeImages)
        .mockRejectedValue(new ApiError('server', { table: 'meal-images', operation: 'remove' }));

      const { hook, outcome } = await editTacos({ imagePath: null });
      await settle();

      expect(outcome).toEqual({ ok: true, mealId: 'meal-tacos' });
      expect(meal(hook, 'meal-tacos')?.imagePath).toBeNull();
      expect(reported()).toEqual(['server']);
    });

    it.each([
      ['network', { ok: false, reason: 'offline' }, []],
      ['server', { ok: false, reason: 'failed' }, ['server']],
    ] as const)(
      'saves nothing when the upload fails with %s, and returns %o',
      async (category, expected, reports) => {
        jest
          .mocked(uploadImage)
          .mockRejectedValue(new ApiError(category, { table: 'meal-images', operation: 'upload' }));

        const { hook, outcome } = await editTacos(
          { imagePath: NEW_PHOTO },
          { uri: 'file:///new.jpg', path: NEW_PHOTO },
        );
        await settle();

        expect(outcome).toEqual(expected);
        expect(runSavePlan).not.toHaveBeenCalled();
        expect(removeImages).not.toHaveBeenCalled();
        expect(meal(hook, 'meal-tacos')?.imagePath).toBe(OLD_PHOTO);
        expect(reported()).toEqual(reports);
      },
    );

    it('keeps the old photo when the meal fails to save after the upload', async () => {
      jest.mocked(runSavePlan).mockRejectedValue(fail('server'));

      const { outcome } = await editTacos(
        { imagePath: NEW_PHOTO },
        { uri: 'file:///new.jpg', path: NEW_PHOTO },
      );
      await settle();

      expect(outcome).toEqual({ ok: false, reason: 'failed' });
      expect(uploadImage).toHaveBeenCalledTimes(1);
      expect(removeImages).not.toHaveBeenCalled();
    });
  });

  it('fails a save made before the household is ready, and sends nothing', async () => {
    mockHousehold = { status: 'loading' };
    const hook = await renderLibrary({ waitForReady: false });

    await expect(run(() => hook.result.current.save(NEW_SAVE))).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    await expect(run(() => hook.result.current.remove('meal-stew'))).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(runSavePlan).not.toHaveBeenCalled();
    expect(deleteMeal).not.toHaveBeenCalled();
  });
});

describe('useDeleteMeal', () => {
  it('U-LMUT-09 removes the meal from the cached library before resolving', async () => {
    const hook = await renderLibrary();
    await settle();
    const release = holdFetches();

    let cachedOnResolve: Rows | undefined;
    const outcome = await run(() =>
      hook.result.current.remove('meal-stew').then((o) => {
        cachedOnResolve = queryClient.getQueryData<Rows>(KEY);
        return o;
      }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(deleteMeal).toHaveBeenCalledWith('meal-stew');
    // The stew has no photo, so there's nothing to remove.
    expect(removeImages).not.toHaveBeenCalled();
    expect(cachedOnResolve?.meals.map((m) => m.id)).toEqual(['meal-tacos']);
    await flush();
    expect(names(hook)).toEqual(['Chicken tacos']);
    await release();
    await settle();
    expect(names(hook)).toEqual(['Chicken tacos']);
  });

  it('U-LMUT-09 leaves the meal listed when the delete fails, and reports it', async () => {
    jest.mocked(deleteMeal).mockRejectedValue(fail('server'));
    const hook = await renderLibrary();

    await expect(run(() => hook.result.current.remove('meal-stew'))).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    await settle();

    expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']);
    expect(reported()).toEqual(['server']);
  });

  it.each([
    ['network', { ok: false, reason: 'offline' }, []],
    ['forbidden', { ok: false, reason: 'forbidden' }, ['forbidden']],
  ] as const)('turns a %s failure into %o', async (category, outcome, reports) => {
    jest.mocked(deleteMeal).mockRejectedValue(fail(category));
    const hook = await renderLibrary();

    await expect(run(() => hook.result.current.remove('meal-stew'))).resolves.toEqual(outcome);
    await settle();

    expect(deleteMeal).toHaveBeenCalledTimes(1);
    expect(reported()).toEqual(reports);
  });

  it("removes the meal's photo after the meal (design §6.5)", async () => {
    const hook = await renderLibrary();
    await settle();

    await expect(run(() => hook.result.current.remove('meal-tacos', OLD_PHOTO))).resolves.toEqual({
      ok: true,
    });

    expect(apiCalls).toEqual(['delete meal-tacos', `remove ${OLD_PHOTO}`]);
    expect(removeImages).toHaveBeenCalledWith([OLD_PHOTO]);
    await flush();
    expect(names(hook)).toEqual(['Beef stew']);
    await settle();
  });

  it('still deletes when the photo cannot be removed, and only reports it', async () => {
    jest
      .mocked(removeImages)
      .mockRejectedValue(new ApiError('forbidden', { table: 'meal-images', operation: 'remove' }));
    const hook = await renderLibrary();

    await expect(run(() => hook.result.current.remove('meal-tacos', OLD_PHOTO))).resolves.toEqual({
      ok: true,
    });
    await settle();

    expect(names(hook)).toEqual(['Beef stew']);
    expect(reported()).toEqual(['forbidden']);
  });

  it('keeps the photo when the meal fails to delete', async () => {
    jest.mocked(deleteMeal).mockRejectedValue(fail('server'));
    const hook = await renderLibrary();

    await expect(run(() => hook.result.current.remove('meal-tacos', OLD_PHOTO))).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    await settle();

    expect(removeImages).not.toHaveBeenCalled();
    expect(names(hook)).toEqual(['Beef stew', 'Chicken tacos']);
  });
});

describe('useNewImagePath', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("makes a fresh JPEG key in the household's folder on each call", async () => {
    let uuid = 0;
    jest.mocked(randomUUID).mockImplementation(() => `uuid-${++uuid}`);
    const { result } = await renderHook(useNewImagePath, { wrapper });

    expect(result.current()).toBe('household-1/uuid-1.jpg');
    expect(result.current()).toBe('household-1/uuid-2.jpg');
  });

  it('makes none before the household is ready', async () => {
    mockHousehold = { status: 'loading' };
    const { result } = await renderHook(useNewImagePath, { wrapper });

    expect(result.current()).toBeNull();
    expect(randomUUID).not.toHaveBeenCalled();
  });
});

describe('useMealImageUrls', () => {
  const A = 'household-1/a.jpg';
  const B = 'household-1/b.jpg';

  async function renderUrls(paths: (string | null)[]) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook((props: { paths: (string | null)[] }) => useMealImageUrls(props.paths), {
      wrapper,
      initialProps: { paths },
    });
  }

  it('signs each photo once, in one request, and gives the URLs by key', async () => {
    const hook = await renderUrls([B, null, A, B]);

    await waitFor(() =>
      expect(hook.result.current).toEqual({
        [A]: `https://storage.test/${A}`,
        [B]: `https://storage.test/${B}`,
      }),
    );
    expect(signImageUrls).toHaveBeenCalledTimes(1);
    expect(signImageUrls).toHaveBeenCalledWith([A, B]);
  });

  it('asks for nothing when no meal has a photo', async () => {
    const hook = await renderUrls([null, null]);
    await flush();

    expect(hook.result.current).toEqual({});
    expect(signImageUrls).not.toHaveBeenCalled();
  });

  it('asks for nothing before the household is ready', async () => {
    mockHousehold = { status: 'loading' };
    const hook = await renderUrls([A]);
    await flush();

    expect(hook.result.current).toEqual({});
    expect(signImageUrls).not.toHaveBeenCalled();
  });

  it('signs nothing again for the same photos in another order', async () => {
    const hook = await renderUrls([A, B]);
    await waitFor(() => expect(hook.result.current[A]).toBeDefined());

    await hook.rerender({ paths: [B, A] });
    await flush();

    expect(signImageUrls).toHaveBeenCalledTimes(1);
  });

  it('keeps the URLs it has while a new set of photos is signed', async () => {
    const hook = await renderUrls([A]);
    await waitFor(() => expect(hook.result.current[A]).toBeDefined());
    const signing = deferred<Record<string, string>>();
    jest.mocked(signImageUrls).mockReturnValueOnce(signing.promise);

    await hook.rerender({ paths: [A, B] });
    await flush();
    expect(hook.result.current).toEqual({ [A]: `https://storage.test/${A}` });

    await act(async () =>
      signing.resolve({ [A]: 'https://storage.test/a2', [B]: 'https://storage.test/b2' }),
    );
    await waitFor(() => expect(hook.result.current[B]).toBe('https://storage.test/b2'));
    expect(signImageUrls).toHaveBeenLastCalledWith([A, B]);
  });

  it('signs the photos afresh before their URLs expire', async () => {
    jest.useFakeTimers();
    try {
      const hook = await renderUrls([A]);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10);
      });
      expect(hook.result.current[A]).toBeDefined();
      expect(signImageUrls).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(IMAGE_URL_REFRESH_MS);
      });
      expect(signImageUrls).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['server', ['server']],
    ['network', []],
  ] as const)(
    'shows no photos when signing fails with %s, reporting only what is reportable',
    async (category, reports) => {
      jest
        .mocked(signImageUrls)
        .mockRejectedValue(new ApiError(category, { table: 'meal-images', operation: 'sign' }));
      const hook = await renderUrls([A]);

      await waitFor(() => expect(reported()).toEqual(reports));
      await flush();
      expect(hook.result.current).toEqual({});
    },
  );
});
