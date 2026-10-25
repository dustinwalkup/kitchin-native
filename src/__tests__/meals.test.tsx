import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useCallback, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Alert, ScrollView, Text } from 'react-native';

import TabsLayout from '@/app/(app)/(tabs)/_layout';
import Meals from '@/app/(app)/(tabs)/meals';
import AppLayout from '@/app/(app)/_layout';
import AddItem from '@/app/(app)/add-item';
import MealPicker from '@/app/(app)/meal-picker';
import { buildSections, type GroceryItem, progress } from '@/features/groceries/domain';
import type { GroceryList } from '@/features/groceries/hooks';
import { buildLibrary } from '@/features/meal-library/domain';
import type { LibraryView } from '@/features/meal-library/hooks';
import { DAY_KEYS, type MealType } from '@/features/meals/constants';
import { buildWeek, type MealEntry } from '@/features/meals/domain';
import type { MealWeek, SetMealVariables } from '@/features/meals/hooks';
import { addDays, type IsoDate, type Weekday } from '@/lib/calendar';
import { ToastProvider, useToast } from '@/lib/toast';
import { touchTarget } from '@/test/a11y';
import { makeItem, makeMealEntry, makeMealRow } from '@/test/factories';
import { themes } from '@/ui/theme';

// Meals screen tests C-MEAL-01 to C-MEAL-14 and Add to groceries C-AGR-01 to C-AGR-05 (meals
// 4-test-plan §4.3, §4.4), the Library tab (meal-library 4-test-plan §4.2), and the start of the
// week, C-MEAL-23 to C-MEAL-28 (meals 4-test-plan §14.3), as redesigned (specs/redesign/design.md
// §5.1, §5.4): a tapped slot opens the plan sheet, whose own tests are in meal-picker.test.tsx. The
// real Meals screen, plan sheet and add-item sheet run inside the real (app) and tabs layouts, so
// tab focus, the header, the tab bar and the sheets behave as in the app. The hooks are mocked
// (§8.4): the week comes from the real buildWeek over each test's entries, the library from the
// real buildLibrary, today is whatever the test sets, and the grocery list is `mockList`.
// 2026-10-22 is a Thursday, in the week of 2026-10-19.

const THIS_WEEK = '2026-10-19' as IsoDate;
const THURSDAY = '2026-10-22' as IsoDate;
const TACOS = 'meal-2';
const STEW = 'meal-1';
const TACOS_PHOTO = 'household-1/tacos.jpg';
const TACOS_URL = 'https://storage.test/tacos.jpg?token=1';

const LIBRARY = buildLibrary(
  [
    makeMealRow({
      id: TACOS,
      name: 'Tacos',
      description: 'Beef, corn tortillas',
      meal_type: 'dinner',
      image_path: TACOS_PHOTO,
    }),
    makeMealRow({ id: STEW, name: 'Beef stew' }),
  ],
  [],
).library;

/** What the mocked hooks return. Changing it re-renders the screen, as a real hook would. */
const mockState = {
  today: THURSDAY,
  /** The household's start of the week, which `useWeekStart` returns. Monday unless a test says. */
  weekStart: 0 as Weekday,
  status: 'ready' as MealWeek['status'],
  entries: [] as MealEntry[],
  refreshFailedAt: null as number | null,
  reconnecting: false,
  saveFails: false,
  library: LIBRARY,
  /** Signed URLs by Storage key, for the photos `useMealImageUrls` is asked for. */
  imageUrls: { [TACOS_PHOTO]: TACOS_URL } as Record<string, string>,
  version: 0,
  listeners: new Set<() => void>(),
};

/** Changes what the hooks return, and re-renders. */
const update = (changes: Partial<typeof mockState>) =>
  act(async () => {
    Object.assign(mockState, changes);
    mockState.version += 1;
    mockState.listeners.forEach((listener) => listener());
  });

const mockRefetch = jest.fn(async () => {});
const mockSetMeal = jest.fn<void, [SetMealVariables]>();
/** The start day the screen last gave `useSetMeal`. */
let mockSetMealStart: Weekday | null = null;
/** Each week start `useMealWeek` was called with. */
let mockWeekStarts: IsoDate[] = [];
/** Each set of photo keys `useMealImageUrls` was asked to sign. */
let mockImagePaths: (string | null)[][] = [];
/** Saves made while `saveFails`, waiting for `failSaves()` to fail them. */
let mockFailures: (() => void)[] = [];

/** Fails every save still waiting, as their requests do. */
const failSaves = () =>
  act(async () => {
    mockFailures.splice(0).forEach((fail) => fail());
  });

// jest.mock factories may only use names that start with "mock", and hooks must start with "use",
// so the stand-ins are methods of one object.
const mockHooks = {
  /** `mockState`, re-rendering the caller when a test changes it. */
  useMockState() {
    useSyncExternalStore(
      (listener) => {
        mockState.listeners.add(listener);
        return () => mockState.listeners.delete(listener);
      },
      () => mockState.version,
    );
    return mockState;
  },

  useMealWeek(weekStart: IsoDate): MealWeek {
    const { status, entries, refreshFailedAt } = mockHooks.useMockState();
    mockWeekStarts.push(weekStart);
    return {
      days: status === 'ready' ? buildWeek(weekStart, entries) : [],
      status,
      refetch: mockRefetch,
      refreshFailedAt,
    };
  },

  /**
   * Shows a save in the week, as the real hook's optimistic update does (R12.1). That update lands
   * after an `await`, so a screen can redraw before the week shows it; so does this one.
   */
  async putEntry({ date, mealType, body, libraryMealId = null }: SetMealVariables) {
    await Promise.resolve();

    const others = mockState.entries.filter((e) => e.date !== date || e.mealType !== mealType);
    mockState.entries =
      body === null
        ? others
        : [
            ...others,
            makeMealEntry({ id: `saved-${date}-${mealType}`, date, mealType, body, libraryMealId }),
          ];
    mockState.version += 1;
    mockState.listeners.forEach((listener) => listener());
  },

  /**
   * While `saveFails`, a save fails once a test calls `failSaves()`, as the real request does some
   * time after it was sent: the slot goes back to what it was, and a toast offers Retry, through the
   * ToastProvider nearest the hook's caller, as the real hook's does (DD35). Retry resends.
   */
  useSetMeal(start: Weekday) {
    mockSetMealStart = start;
    const toast = useToast();
    return useCallback(
      function save(v: SetMealVariables) {
        mockSetMeal(v);
        const before = mockState.entries.find(
          (e) => e.date === v.date && e.mealType === v.mealType,
        );
        void mockHooks.putEntry(v);
        if (mockState.saveFails) {
          mockFailures.push(() => {
            void mockHooks.putEntry({
              date: v.date,
              mealType: v.mealType,
              body: before?.body ?? null,
              libraryMealId: before?.libraryMealId,
            });
            toast.show({
              message: "Couldn't save that meal",
              action: { label: 'Retry', onPress: () => save(v) },
            });
          });
        }
      },
      [toast],
    );
  },

  useLibrary(): LibraryView {
    const { library } = mockHooks.useMockState();
    return { library, status: 'ready', refetch: mockRefetch, refreshFailedAt: null };
  },

  useMealImageUrls(paths: (string | null)[]) {
    const { imageUrls } = mockHooks.useMockState();
    mockImagePaths.push(paths);
    return Object.fromEntries(
      paths.flatMap((path) => (path !== null && imageUrls[path] ? [[path, imageUrls[path]]] : [])),
    );
  },
};

jest.mock('@/features/meals/hooks', () => ({
  useMealWeek: (weekStart: IsoDate) => mockHooks.useMealWeek(weekStart),
  useSetMeal: (start: Weekday) => mockHooks.useSetMeal(start),
  useRecentLibraryMealIds: () => [],
}));
jest.mock('@/features/meal-library/hooks', () => ({
  useLibrary: () => mockHooks.useLibrary(),
  useMealImageUrls: (paths: (string | null)[]) => mockHooks.useMealImageUrls(paths),
}));
jest.mock('@/features/household/use-week-start', () => ({
  useWeekStart: () => mockHooks.useMockState().weekStart,
}));
jest.mock('@/features/household/use-household-today', () => ({
  useHouseholdToday: () => mockHooks.useMockState().today,
}));
jest.mock('@/features/household/use-connection-state', () => ({
  useReconnectingIndicator: () => mockHooks.useMockState().reconnecting,
  useRealtimeDegradedReport: () => {},
}));

// The add-item sheet's hooks, as add-item.test.tsx mocks them.
let mockList: GroceryList;
const mockAddItem = jest.fn();
jest.mock('@/features/groceries/hooks', () => ({
  useGroceryList: () => mockList,
  useAddItem: () => mockAddItem,
}));

// The (app) layout's channel, library handlers and variant, which these tests don't use.
jest.mock('@/features/meal-library/realtime', () => ({ libraryTableHandlers: {} }));
jest.mock('@/features/household/realtime', () => ({ householdTableHandlers: {} }));
jest.mock('@/features/household/use-household-realtime', () => ({
  useHouseholdRealtime: () => {},
}));
jest.mock('@/lib/env', () => ({ env: { variant: 'production', sentryDsn: null } }));

function GroceriesStub() {
  return <Text>Groceries screen</Text>;
}

function SettingsStub() {
  return <Text>Settings screen</Text>;
}

// Routes these tests never open.
function UnusedStub() {
  return null;
}

// The root layout's toasts, which every screen's own provider sits inside, as in the app. The
// real root layout also restores the session and loads the household, which these tests mock.
function RootLayoutStub() {
  return (
    <ToastProvider>
      <Slot />
    </ToastProvider>
  );
}

// The library's own tests are in meal-library.test.tsx.
function MealLibraryStub() {
  return <Text>Meal Library screen</Text>;
}

const ROUTES = {
  _layout: RootLayoutStub,
  '(app)/_layout': AppLayout,
  '(app)/(tabs)/_layout': TabsLayout,
  '(app)/(tabs)/groceries': GroceriesStub,
  '(app)/(tabs)/meals': Meals,
  '(app)/(tabs)/meal-library': MealLibraryStub,
  '(app)/(tabs)/settings': SettingsStub,
  '(app)/add-item': AddItem,
  '(app)/meal-form': UnusedStub,
  '(app)/meal-picker': MealPicker,
  '(app)/theme': UnusedStub,
};

const OFFLINE_BANNER = "Offline — changes will send when you're back online";
const theme = themes.light;

// React Native's ScrollView mock shares one jest.fn for scrollTo across instances.
const scrollTo = (ScrollView as unknown as { prototype: { scrollTo: jest.Mock } }).prototype
  .scrollTo;

function listOf(items: GroceryItem[]): GroceryList {
  return {
    listId: 'list-1',
    items,
    sections: buildSections(items),
    progress: progress(items),
    status: 'ready',
    refetch: jest.fn(async () => {}),
    isRefetching: false,
    refreshFailedAt: null,
  };
}

let announce: jest.SpyInstance;
let alert: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  mockWeekStarts = [];
  mockImagePaths = [];
  mockFailures = [];
  mockSetMealStart = null;
  mockList = listOf([makeItem({ id: 'milk', name: 'Milk', category: 'dairy' })]);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await update({
    today: THURSDAY,
    weekStart: 0,
    status: 'ready',
    entries: [
      makeMealEntry({ id: 'e1', date: THURSDAY, mealType: 'breakfast', body: 'Porridge' }),
      makeMealEntry({ id: 'e2', date: THURSDAY, mealType: 'dinner', body: 'Tacos' }),
    ],
    refreshFailedAt: null,
    reconnecting: false,
    saveFails: false,
    library: LIBRARY,
    imageUrls: { [TACOS_PHOTO]: TACOS_URL },
  });
});

afterEach(() => {
  announce.mockRestore();
  alert.mockRestore();
  onlineManager.setOnline(true);
  jest.useRealTimers();
});

/** Opens the app on Meals. renderRouter turns on fake timers. */
const renderMeals = () => renderRouter(ROUTES, { initialUrl: '/meals' });

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const tab = (name: 'Groceries' | 'Meals' | 'Library' | 'Settings') =>
  press(new RegExp(`^${name}, tab`));
/** The week's date range, the one header with a dash. */
const range = () => screen.getByRole('header', { name: /–/ });
const dayHeaders = () =>
  screen
    .getAllByRole('header', { name: /meals planned$/ })
    .map((h) => h.props.accessibilityLabel as string);
const todayPills = () => screen.queryAllByTestId('today-pill');
const layOut = (testID: string, y: number) =>
  fireEvent(screen.getByTestId(testID), 'layout', {
    nativeEvent: { layout: { x: 0, y, width: 390, height: 320 } },
  });
/** The plan sheet's title, such as "Thu, Oct 22 · Dinner". */
const sheetTitle = () => screen.queryByRole('header', { name: /·/ });
const photos = () => screen.queryAllByTestId('slot-photo', { includeHiddenElements: true });

describe('Meals week', () => {
  it("C-MEAL-01 shows seven days, Monday to Sunday, with the current week's dates", async () => {
    await renderMeals();

    expect(screen.getAllByTestId(/^day-/).map((d) => d.props.testID)).toEqual(
      DAY_KEYS.map((key) => `day-${key}`),
    );
    expect(dayHeaders()).toEqual([
      'Monday October 19, 0 of 3 meals planned',
      'Tuesday October 20, 0 of 3 meals planned',
      'Wednesday October 21, 0 of 3 meals planned',
      'Thursday October 22, today, 2 of 3 meals planned',
      'Friday October 23, 0 of 3 meals planned',
      'Saturday October 24, 0 of 3 meals planned',
      'Sunday October 25, 0 of 3 meals planned',
    ]);
    expect(range()).toHaveTextContent('Oct 19 – Oct 25');
    expect(new Set(mockWeekStarts)).toEqual(new Set([THIS_WEEK]));
  });

  it("C-MEAL-02 shows the Today pill, and the terracotta edge, on today's card only", async () => {
    await renderMeals();

    expect(todayPills()).toHaveLength(1);
    expect(within(screen.getByTestId('day-thu')).getByTestId('today-pill')).toBeOnTheScreen();
    expect(screen.getByTestId('day-thu')).toHaveStyle({ borderColor: theme.accent });
    expect(screen.getByTestId('day-wed')).not.toHaveStyle({ borderColor: theme.accent });
  });

  it('C-MEAL-03 moves a week at a time, and Back to this week shows only away from the current week', async () => {
    await renderMeals();
    expect(screen.queryByTestId('week-this')).toBeNull();

    await press('Next week');
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-26');
    expect(dayHeaders()[0]).toBe('Monday October 26, 0 of 3 meals planned');
    expect(todayPills()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Back to this week' })).toBeOnTheScreen();

    await press('Previous week');
    await press('Previous week');
    expect(range()).toHaveTextContent('Oct 12 – Oct 18');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-12');

    await press('Back to this week');
    expect(range()).toHaveTextContent('Oct 19 – Oct 25');
    expect(mockWeekStarts.at(-1)).toBe(THIS_WEEK);
    expect(screen.queryByTestId('week-this')).toBeNull();
    expect(todayPills()).toHaveLength(1);
  });

  it('C-MEAL-04 reaches a week more than a year back with sixty taps on Previous', async () => {
    await renderMeals();

    for (let i = 0; i < 60; i += 1) await press('Previous week');

    const start = addDays(THIS_WEEK, -7 * 60);
    expect(start).toBe('2025-08-25');
    expect(mockWeekStarts.at(-1)).toBe(start);
    expect(range()).toHaveTextContent('Aug 25, 2025 – Aug 31, 2025');
    expect(screen.getAllByTestId(/^day-/)).toHaveLength(7);
  });

  it('R33.2 clears a planned slot from its VoiceOver Clear action', async () => {
    await renderMeals();

    await fireEvent(screen.getByTestId('slot-thu-dinner'), 'accessibilityAction', {
      nativeEvent: { actionName: 'clear' },
    });

    expect(mockSetMeal).toHaveBeenCalledWith({ date: THURSDAY, mealType: 'dinner', body: null });
    expect(within(screen.getByTestId('day-thu')).queryByText('Tacos')).toBeNull();
  });

  it('R26.7 uses only static test IDs, none with meal text', async () => {
    await update({
      entries: [
        ...mockState.entries,
        makeMealEntry({ id: 'e3', date: '2026-10-23', body: 'Tacos', libraryMealId: TACOS }),
      ],
    });
    await renderMeals();

    const ids = screen
      .getAllByTestId(/./, { includeHiddenElements: true })
      .map((e) => e.props.testID as string);
    expect(ids).toContain('meals-week');
    expect(ids).toContain('slot-photo');
    expect(ids.filter((id) => /Tacos|Porridge|e1|e2|e3|meal-2/.test(id))).toEqual([]);
  });
});

// A planned meal chosen from the library shows that meal's photo (specs/redesign DD-R10).
describe('Meals photos', () => {
  const linked = (date: string, libraryMealId: string, mealType: MealType = 'dinner') =>
    makeMealEntry({ id: `${date}-${mealType}`, date, mealType, body: 'Linked', libraryMealId });

  it("shows a library meal's photo in its slot, signed with the week's other photos in one batch", async () => {
    await update({
      entries: [linked('2026-10-20', TACOS), linked('2026-10-23', TACOS, 'lunch')],
    });
    await renderMeals();

    for (const slot of ['slot-tue-dinner', 'slot-fri-lunch']) {
      const photo = within(screen.getByTestId(slot)).getByTestId('slot-photo', {
        includeHiddenElements: true,
      });
      expect(photo).toBeTruthy();
    }
    expect(
      screen.getAllByTestId('slot-photo-image', { includeHiddenElements: true })[0].props.source,
    ).toEqual([{ uri: TACOS_URL, cacheKey: TACOS_PHOTO }]);
    expect(mockImagePaths.at(-1)).toEqual([TACOS_PHOTO, TACOS_PHOTO]);
  });

  it('shows no photo for typed text, a meal without one, or a meal deleted since', async () => {
    await update({
      entries: [
        makeMealEntry({ id: 'typed', date: '2026-10-20', body: 'Leftovers' }),
        linked('2026-10-21', STEW),
        linked('2026-10-23', 'meal-gone'),
      ],
    });
    await renderMeals();

    expect(photos()).toHaveLength(0);
    expect(mockImagePaths.at(-1)).toEqual([]);
  });

  it('shows the placeholder until the photo is signed', async () => {
    await update({ entries: [linked('2026-10-20', TACOS)], imageUrls: {} });
    await renderMeals();

    expect(photos()).toHaveLength(1);
    expect(screen.queryByTestId('slot-photo-image', { includeHiddenElements: true })).toBeNull();
  });
});

describe('Meals states (C-MEAL-05)', () => {
  it('shows SkeletonWeek on the first load', async () => {
    await update({ status: 'loading' });
    await renderMeals();

    expect(screen.getByTestId('skeleton-week')).toBeOnTheScreen();
    expect(screen.queryAllByTestId(/^day-/)).toHaveLength(0);
  });

  it('shows LoadError when nothing has loaded, and its Retry reloads', async () => {
    await update({ status: 'error' });
    await renderMeals();

    expect(screen.getByRole('header', { name: "Couldn't load meals" })).toBeOnTheScreen();
    expect(screen.queryAllByTestId(/^day-/)).toHaveLength(0);
    await press('Retry');

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded week when a reload fails, with a toast whose Retry reloads', async () => {
    await renderMeals();

    await update({ refreshFailedAt: 1 });

    expect(screen.getAllByTestId(/^day-/)).toHaveLength(7);
    expect(within(screen.getByTestId('toast')).getByText("Couldn't load meals")).toBeOnTheScreen();
    await press('Retry');
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId(/^day-/)).toHaveLength(7);
  });

  it('shows the offline banner and "Waiting for connection…" while paused with nothing loaded', async () => {
    onlineManager.setOnline(false);
    await update({ status: 'waiting' });
    await renderMeals();

    expect(screen.getByText(OFFLINE_BANNER)).toBeOnTheScreen();
    expect(screen.getByText('Waiting for connection…')).toBeOnTheScreen();
    expect(screen.queryByTestId('skeleton-week')).toBeNull();
  });

  it('shows seven days of empty slots for an empty week, with no empty state (R30.8)', async () => {
    await update({ entries: [] });
    await renderMeals();

    expect(screen.getAllByTestId(/^day-/)).toHaveLength(7);
    expect(screen.getAllByRole('button', { name: /, not planned$/ })).toHaveLength(21);
    expect(screen.getAllByText('Add dinner')).toHaveLength(7);
  });

  it('C-MEAL-06 reloads on pull to refresh', async () => {
    await renderMeals();

    await act(
      async () => void screen.getByTestId('meals-week').props.refreshControl.props.onRefresh(),
    );

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('C-MEAL-06 shows the spinner only while its own pull is loading, and only online', async () => {
    let finish!: () => void;
    mockRefetch.mockImplementationOnce(() => new Promise<void>((done) => (finish = done)));
    await renderMeals();
    const refreshControl = () => screen.getByTestId('meals-week').props.refreshControl;
    expect(refreshControl().props.refreshing).toBe(false);

    await act(async () => void refreshControl().props.onRefresh());
    expect(refreshControl().props.refreshing).toBe(true);

    await act(async () => onlineManager.setOnline(false));
    expect(refreshControl().props.refreshing).toBe(false);

    await act(async () => {
      onlineManager.setOnline(true);
      finish();
    });
    expect(refreshControl().props.refreshing).toBe(false);
  });
});

// Tapping a slot opens the plan sheet over Meals (specs/redesign/design.md §5.4, superseding the
// inline editor of R32 and the picker hand-off of R45). The sheet's own tests are in
// meal-picker.test.tsx; these check what Meals sends it and shows after it.
describe('Planning a slot', () => {
  it('C-MEAL-07 a tapped slot opens its plan sheet, with only the date and meal type in the route', async () => {
    const app = await renderMeals();

    await fireEvent.press(screen.getByTestId('slot-thu-dinner'));

    expect(app.getPathname()).toBe('/meal-picker');
    // C-MEAL-22: no meal text in the route (R26.4, DD51).
    expect(app.getSearchParams()).toEqual({ date: THURSDAY, mealType: 'dinner' });
    expect(app.getPathnameWithParams()).not.toMatch(/Tacos|Porridge/);
    expect(sheetTitle()).toHaveTextContent('Thu, Oct 22 · Dinner');
    expect(screen.getByTestId('plan-current')).toHaveTextContent(/Tacos/);
    // Meals stays mounted underneath.
    expect(screen.getByTestId('meals-week', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(mockSetMeal).not.toHaveBeenCalled();
  });

  it("C-MEAL-07 opens the slot of the week on screen, not the current week's", async () => {
    const app = await renderMeals();
    await press('Next week');

    await fireEvent.press(screen.getByTestId('slot-tue-lunch'));

    expect(app.getSearchParams()).toEqual({ date: '2026-10-27', mealType: 'lunch' });
    expect(sheetTitle()).toHaveTextContent('Tue, Oct 27 · Lunch');
  });

  it('C-MEAL-18 Cancel returns to the same week, with nothing saved', async () => {
    const app = await renderMeals();
    await press('Next week');
    await fireEvent.press(screen.getByTestId('slot-thu-dinner'));

    await fireEvent.press(screen.getByTestId('picker-cancel'));

    expect(app.getPathname()).toBe('/meals');
    expect(sheetTitle()).toBeNull();
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(mockSetMeal).not.toHaveBeenCalled();
  });

  it('C-MEAL-16 typed text saved in the sheet shows in its slot, at the same week', async () => {
    const app = await renderMeals();
    await press('Next week');
    await fireEvent.press(screen.getByTestId('slot-wed-lunch'));
    await fireEvent.press(screen.getByTestId('plan-mode-write'));

    await fireEvent.changeText(screen.getByTestId('slot-editor'), 'Soup\nWith crusty bread');
    await fireEvent.press(screen.getByTestId('plan-save'));

    expect(app.getPathname()).toBe('/meals');
    expect(mockSetMeal.mock.calls).toEqual([
      [
        {
          date: '2026-10-28',
          mealType: 'lunch',
          body: 'Soup\nWith crusty bread',
          libraryMealId: null,
        },
      ],
    ]);
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    const slot = screen.getByTestId('slot-wed-lunch');
    expect(slot).toHaveProp('accessibilityLabel', 'Wednesday lunch: Soup\nWith crusty bread');
    expect(within(slot).getByText('Soup')).toBeOnTheScreen();
    expect(within(slot).getByText('With crusty bread')).toBeOnTheScreen();
  });

  it('C-MEAL-16 a meal chosen in the sheet shows in its slot, with its photo (DD-R10)', async () => {
    await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));

    await fireEvent.press(screen.getByTestId(`meal-row-${TACOS}`));

    expect(mockSetMeal.mock.calls).toEqual([
      [
        {
          date: THURSDAY,
          mealType: 'lunch',
          body: 'Tacos\nBeef, corn tortillas',
          libraryMealId: TACOS,
        },
      ],
    ]);
    expect(announce).toHaveBeenCalledWith('Thursday lunch: Tacos');
    const slot = screen.getByTestId('slot-thu-lunch');
    expect(within(slot).getByText('Beef, corn tortillas')).toBeOnTheScreen();
    expect(within(slot).getByTestId('slot-photo', { includeHiddenElements: true })).toBeTruthy();
  });

  it('C-MEAL-09 shows the same week after leaving Meals and coming back', async () => {
    const app = await renderMeals();

    await press('Next week');
    await tab('Settings');
    expect(app.getPathname()).toBe('/settings');
    await tab('Meals');

    expect(app.getPathname()).toBe('/meals');
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
  });

  it('C-MEAL-11 shows a failed clear toast at the top, from the Meals ToastProvider', async () => {
    await update({ saveFails: true });
    await renderMeals();

    await fireEvent(screen.getByTestId('slot-thu-dinner'), 'accessibilityAction', {
      nativeEvent: { actionName: 'clear' },
    });
    expect(within(screen.getByTestId('day-thu')).queryByText('Tacos')).toBeNull();
    await failSaves();

    // Clear of the tab bar (DD35).
    expect(screen.getByTestId('toast')).toHaveStyle({ top: 8 });
    const toast = within(screen.getByTestId('toast'));
    expect(toast.getByText("Couldn't save that meal")).toBeOnTheScreen();
    expect(toast.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
    expect(within(screen.getByTestId('day-thu')).getByText('Tacos')).toBeOnTheScreen();
  });
});

// A save from the plan sheet that fails after the sheet has closed still says so, with Retry, on
// Meals (R35.5): the sheet's save runs outside its own toasts, through the root's.
describe('A failed save from the plan sheet (C-MEAL-20)', () => {
  const failedToast = () => screen.getByTestId('toast');

  it("shows a chosen meal's failure on Meals, puts the slot back, and Retry resends it", async () => {
    await update({ saveFails: true });
    const app = await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await fireEvent.press(screen.getByTestId(`meal-row-${TACOS}`));
    expect(app.getPathname()).toBe('/meals');
    expect(sheetTitle()).toBeNull();
    expect(screen.queryByTestId('toast')).toBeNull();

    await failSaves();

    const chosen = {
      date: THURSDAY,
      mealType: 'lunch',
      body: 'Tacos\nBeef, corn tortillas',
      libraryMealId: TACOS,
    };
    expect(within(failedToast()).getByText("Couldn't save that meal")).toBeOnTheScreen();
    // The root's toasts show at the bottom, above the tab bar.
    expect(failedToast()).toHaveStyle({ bottom: 56 });
    expect(screen.getByTestId('slot-thu-lunch')).toHaveProp(
      'accessibilityLabel',
      'Thursday lunch, not planned',
    );

    await update({ saveFails: false });
    await fireEvent.press(within(failedToast()).getByRole('button', { name: 'Retry' }));

    expect(mockSetMeal.mock.calls).toEqual([[chosen], [chosen]]);
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(within(screen.getByTestId('slot-thu-lunch')).getByText('Tacos')).toBeOnTheScreen();
  });

  it("shows typed text's failure on Meals, puts back what the slot held, and Retry resends it", async () => {
    await update({ saveFails: true });
    const app = await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-dinner'));
    await fireEvent.press(screen.getByTestId('plan-mode-write'));
    await fireEvent.changeText(screen.getByTestId('slot-editor'), 'Fish tacos');
    await fireEvent.press(screen.getByTestId('plan-save'));
    expect(app.getPathname()).toBe('/meals');

    await failSaves();

    const typed = { date: THURSDAY, mealType: 'dinner', body: 'Fish tacos', libraryMealId: null };
    expect(within(failedToast()).getByText("Couldn't save that meal")).toBeOnTheScreen();
    expect(within(screen.getByTestId('slot-thu-dinner')).getByText('Tacos')).toBeOnTheScreen();

    await fireEvent.press(within(failedToast()).getByRole('button', { name: 'Retry' }));

    expect(mockSetMeal.mock.calls).toEqual([[typed], [typed]]);
    expect(within(screen.getByTestId('slot-thu-dinner')).getByText('Fish tacos')).toBeOnTheScreen();
  });
});

describe('Meals and the household calendar', () => {
  it('C-MEAL-10 moves the Today pill at midnight and keeps the week; a new week offers Back to this week', async () => {
    await renderMeals();

    await update({ today: '2026-10-23' as IsoDate });
    expect(todayPills()).toHaveLength(1);
    expect(within(screen.getByTestId('day-fri')).getByTestId('today-pill')).toBeOnTheScreen();
    expect(range()).toHaveTextContent('Oct 19 – Oct 25');
    expect(screen.queryByTestId('week-this')).toBeNull();

    // Sunday night into Monday: the viewed week stays, and is no longer the current one (R34.3).
    await update({ today: '2026-10-26' as IsoDate });
    expect(range()).toHaveTextContent('Oct 19 – Oct 25');
    expect(todayPills()).toHaveLength(0);

    await press('Back to this week');
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(within(screen.getByTestId('day-mon')).getByTestId('today-pill')).toBeOnTheScreen();
  });

  it('C-MEAL-12 shows Reconnecting… in the Meals header while the indicator is on', async () => {
    await renderMeals();
    expect(screen.queryByText('Reconnecting…')).toBeNull();

    await update({ reconnecting: true });

    expect(screen.getByText('Reconnecting…')).toBeOnTheScreen();
  });

  it("C-MEAL-13 scrolls to today's card, unanimated, on first show and after Back to this week", async () => {
    await renderMeals();

    await layOut('day-thu', 840);
    expect(scrollTo.mock.calls).toEqual([[{ y: 832, animated: false }]]);

    await press('Previous week');
    await press('Back to this week');
    await layOut('day-thu', 900);

    expect(scrollTo.mock.calls).toEqual([
      [{ y: 832, animated: false }],
      [{ y: 892, animated: false }],
    ]);
  });

  it("C-MEAL-13 doesn't scroll above the top for a card at the top", async () => {
    await renderMeals();

    await layOut('day-thu', 4);

    expect(scrollTo.mock.calls).toEqual([[{ y: 0, animated: false }]]);
  });

  it("C-MEAL-13 doesn't scroll for Previous or Next", async () => {
    await renderMeals();
    await layOut('day-thu', 840);
    scrollTo.mockClear();

    await press('Next week');
    await press('Previous week');
    await layOut('day-thu', 840);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("C-MEAL-14 doesn't scroll when new week data moves today's card", async () => {
    await renderMeals();
    await layOut('day-thu', 840);
    scrollTo.mockClear();

    await update({
      entries: [
        ...mockState.entries,
        makeMealEntry({ id: 'e3', date: '2026-10-20', mealType: 'lunch', body: 'A long soup' }),
      ],
    });
    await layOut('day-thu', 880);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('Add to groceries', () => {
  const addToGroceries = () => screen.getByRole('button', { name: 'Add to groceries' });
  const addItemTitle = () => screen.queryByRole('header', { name: 'Add item' });

  it('C-AGR-01 is a 44 pt header button that opens the add-item sheet over Meals', async () => {
    const app = await renderMeals();

    expect(addToGroceries()).toHaveProp('testID', 'add-to-groceries');
    expect(touchTarget(addToGroceries())).toEqual({ width: 44, height: 44 });
    expect(addToGroceries().children[0]).toHaveProp('name', 'cart.badge.plus');
    // accentInk, not accent: terracotta on the ivory header is under 3:1 for an icon (N13).
    expect(addToGroceries().children[0]).toHaveProp('tintColor', theme.accentInk);
    expect(addItemTitle()).toBeNull();

    await fireEvent.press(addToGroceries());

    expect(app.getPathname()).toBe('/add-item');
    expect(addItemTitle()).toBeOnTheScreen();
    // Meals stays mounted underneath (R37.3).
    expect(screen.getByTestId('meals-week', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('C-AGR-02 returns to the same week when the sheet closes', async () => {
    const app = await renderMeals();
    await press('Next week');

    await fireEvent.press(addToGroceries());
    await press('Done');

    expect(app.getPathname()).toBe('/meals');
    expect(addItemTitle()).toBeNull();
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-26');
  });

  it('C-AGR-04 opens the sheet empty, with no route params and no meal text', async () => {
    const app = await renderMeals();

    await fireEvent.press(addToGroceries());

    expect(app.getPathnameWithParams()).toBe('/add-item');
    expect(app.getSearchParams()).toEqual({});
    expect(screen.getByTestId('item-form-name')).toHaveDisplayValue('');
    expect(screen.getByTestId('item-form-quantity-field')).toHaveDisplayValue('');
  });

  it('C-AGR-05 adds an item as from Groceries, and still blocks a duplicate', async () => {
    await renderMeals();
    await fireEvent.press(addToGroceries());

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Tortillas');
    await press('Add');

    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tortillas', quantity: null }),
    );

    await fireEvent.changeText(screen.getByLabelText('Name'), 'milk');

    expect(screen.getByText('Milk is already on the list.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(mockAddItem).toHaveBeenCalledTimes(1);
  });
});

// The Library tab, meal-library 4-test-plan §4.2. The library is a stub here.
describe('Library tab', () => {
  it('C-LIB-01 the Meals header has no Library button; the Library tab opens the Meal Library', async () => {
    const app = await renderMeals();
    expect(screen.queryByTestId('library-button')).toBeNull();

    await tab('Library');

    expect(app.getPathname()).toBe('/meal-library');
    expect(app.getSearchParams()).toEqual({});
    expect(screen.getByText('Meal Library screen')).toBeOnTheScreen();
    // Meals stays mounted beside it, as every tab does (R40.2).
    expect(screen.getByTestId('meals-week', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('C-LIB-02 the Meals tab shows the same week afterwards', async () => {
    const app = await renderMeals();
    await press('Next week');
    await tab('Library');

    await tab('Meals');

    expect(app.getPathname()).toBe('/meals');
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-26');
  });
});

describe('Start of the week', () => {
  const SUNDAY = 6;

  it('C-MEAL-23 lays the week out from the household’s start day (R30.1, R48.4)', async () => {
    await update({ weekStart: SUNDAY });
    await renderMeals();

    expect(screen.getAllByTestId(/^day-/).map((d) => d.props.testID)).toEqual([
      'day-sun',
      'day-mon',
      'day-tue',
      'day-wed',
      'day-thu',
      'day-fri',
      'day-sat',
    ]);
    expect(dayHeaders()[0]).toBe('Sunday October 18, 0 of 3 meals planned');
    expect(dayHeaders()[6]).toBe('Saturday October 24, 0 of 3 meals planned');
    expect(range()).toHaveTextContent('Oct 18 – Oct 24');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-18');
    expect(screen.queryByTestId('week-this')).toBeNull();
    expect(mockSetMealStart).toBe(SUNDAY);
  });

  it('C-MEAL-24 moves to the new current week, and scrolls to today, when the current week shows', async () => {
    await renderMeals();
    await layOut('day-thu', 840);
    scrollTo.mockClear();

    await update({ weekStart: SUNDAY });

    expect(range()).toHaveTextContent('Oct 18 – Oct 24');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-18');
    expect(screen.getAllByTestId(/^day-/)[0]).toHaveProp('testID', 'day-sun');
    expect(mockSetMealStart).toBe(SUNDAY);
    await layOut('day-thu', 1020);
    expect(scrollTo.mock.calls).toEqual([[{ y: 1012, animated: false }]]);
  });

  it('C-MEAL-25 moves to the week sharing the most dates, without scrolling, when another week shows', async () => {
    await renderMeals();
    await layOut('day-thu', 840);
    await press('Previous week');
    await press('Previous week');
    expect(range()).toHaveTextContent('Oct 5 – Oct 11');
    scrollTo.mockClear();

    await update({ weekStart: SUNDAY });

    expect(range()).toHaveTextContent('Oct 4 – Oct 10');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-04');
    await layOut('day-thu', 900);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('C-MEAL-26 keeps an open plan sheet and its text, and saves it into the rearranged week (R48.8)', async () => {
    const app = await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await fireEvent.press(screen.getByTestId('plan-mode-write'));
    await fireEvent.changeText(screen.getByTestId('slot-editor'), 'Soup');

    await update({ weekStart: SUNDAY });

    expect(app.getPathname()).toBe('/meal-picker');
    expect(sheetTitle()).toHaveTextContent('Thu, Oct 22 · Lunch');
    expect(screen.getByTestId('slot-editor')).toHaveProp('value', 'Soup');
    expect(mockSetMeal).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('plan-save'));

    expect(app.getPathname()).toBe('/meals');
    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: THURSDAY, mealType: 'lunch', body: 'Soup', libraryMealId: null }],
    ]);
    expect(mockSetMealStart).toBe(SUNDAY);
    expect(range()).toHaveTextContent('Oct 18 – Oct 24');
    expect(within(screen.getByTestId('slot-thu-lunch')).getByText('Soup')).toBeOnTheScreen();
  });

  it('C-MEAL-27 steps through weeks that begin on the new day', async () => {
    await renderMeals();
    await update({ weekStart: SUNDAY });

    await press('Next week');
    expect(range()).toHaveTextContent('Oct 25 – Oct 31');
    await press('Previous week');
    await press('Previous week');
    expect(range()).toHaveTextContent('Oct 11 – Oct 17');
    await press('Back to this week');
    expect(range()).toHaveTextContent('Oct 18 – Oct 24');
    expect(screen.queryByTestId('week-this')).toBeNull();
  });

  it('C-MEAL-28 changes no meal when the start day changes (R48.6)', async () => {
    await renderMeals();

    await update({ weekStart: SUNDAY });
    await update({ weekStart: 2 });

    expect(range()).toHaveTextContent('Oct 21 – Oct 27');
    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('day-thu')).getByText('Tacos')).toBeOnTheScreen();
  });
});
