import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useCallback, useSyncExternalStore } from 'react';
import { AccessibilityInfo, ScrollView, Text } from 'react-native';

import TabsLayout from '@/app/(app)/(tabs)/_layout';
import Meals from '@/app/(app)/(tabs)/meals';
import AppLayout from '@/app/(app)/_layout';
import AddItem from '@/app/(app)/add-item';
import { buildSections, type GroceryItem, progress } from '@/features/groceries/domain';
import type { GroceryList } from '@/features/groceries/hooks';
import { mealPick } from '@/features/meal-library/handoff';
import { DAY_KEYS } from '@/features/meals/constants';
import { buildWeek, type MealEntry } from '@/features/meals/domain';
import type { MealWeek, SetMealVariables } from '@/features/meals/hooks';
import { addDays, type IsoDate } from '@/lib/calendar';
import { useToast } from '@/lib/toast';
import { touchTarget } from '@/test/a11y';
import { makeItem, makeMealEntry } from '@/test/factories';

// Meals screen tests C-MEAL-01 to C-MEAL-14 and Add to groceries C-AGR-01 to C-AGR-05 (meals
// 4-test-plan §4.3, §4.4), and the Library and Choose additions (meal-library 4-test-plan §4.2,
// §4.7). The real Meals screen and add-item sheet run inside the real (app) and tabs layouts, so tab
// focus, the header, the tab bar and the sheet behave as in the app. The hooks are mocked (§8.4):
// the week comes from the real buildWeek over each test's entries, today is whatever the test sets,
// and the grocery list is `mockList`. 2026-10-22 is a Thursday, in the week of 2026-10-19.

const THIS_WEEK = '2026-10-19' as IsoDate;
const THURSDAY = '2026-10-22' as IsoDate;

/** What the mocked hooks return. Changing it re-renders the screen, as a real hook would. */
const mockState = {
  today: THURSDAY,
  status: 'ready' as MealWeek['status'],
  entries: [] as MealEntry[],
  refreshFailedAt: null as number | null,
  reconnecting: false,
  saveFails: false,
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
/** Each week start `useMealWeek` was called with. */
let mockWeekStarts: IsoDate[] = [];

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
  async putEntry({ date, mealType, body }: SetMealVariables) {
    await Promise.resolve();

    const others = mockState.entries.filter((e) => e.date !== date || e.mealType !== mealType);
    mockState.entries =
      body === null
        ? others
        : [...others, makeMealEntry({ id: `saved-${date}-${mealType}`, date, mealType, body })];
    mockState.version += 1;
    mockState.listeners.forEach((listener) => listener());
  },

  // A failing save shows its toast as the real hook does, through the nearest ToastProvider (DD35).
  useSetMeal() {
    const toast = useToast();
    return useCallback(
      (v: SetMealVariables) => {
        mockSetMeal(v);
        void mockHooks.putEntry(v);
        if (mockState.saveFails) {
          toast.show({
            message: "Couldn't save that meal",
            action: { label: 'Retry', onPress() {} },
          });
        }
      },
      [toast],
    );
  },
};

jest.mock('@/features/meals/hooks', () => ({
  useMealWeek: (weekStart: IsoDate) => mockHooks.useMealWeek(weekStart),
  useSetMeal: () => mockHooks.useSetMeal(),
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

// The library's own tests are in meal-library.test.tsx.
function MealLibraryStub() {
  return <Text>Meal Library screen</Text>;
}

// The picker's own tests are in meal-library.test.tsx. Here the test plays its part with
// `closePicker`.
function MealPickerStub() {
  return <Text>Meal picker screen</Text>;
}

const ROUTES = {
  '(app)/_layout': AppLayout,
  '(app)/(tabs)/_layout': TabsLayout,
  '(app)/(tabs)/groceries': GroceriesStub,
  '(app)/(tabs)/meals': Meals,
  '(app)/(tabs)/settings': SettingsStub,
  '(app)/add-item': AddItem,
  '(app)/meal-library': MealLibraryStub,
  '(app)/meal-form': UnusedStub,
  '(app)/meal-picker': MealPickerStub,
  '(app)/theme': UnusedStub,
};

const OFFLINE_BANNER = "Offline — changes will send when you're back online";

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

beforeEach(async () => {
  jest.clearAllMocks();
  mealPick.clear();
  mockWeekStarts = [];
  mockList = listOf([makeItem({ id: 'milk', name: 'Milk', category: 'dairy' })]);
  await update({
    today: THURSDAY,
    status: 'ready',
    entries: [
      makeMealEntry({ id: 'e1', date: THURSDAY, mealType: 'breakfast', body: 'Porridge' }),
      makeMealEntry({ id: 'e2', date: THURSDAY, mealType: 'dinner', body: 'Tacos' }),
    ],
    refreshFailedAt: null,
    reconnecting: false,
    saveFails: false,
  });
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.useRealTimers();
});

/** Opens the app on Meals. renderRouter turns on fake timers. */
const renderMeals = () => renderRouter(ROUTES, { initialUrl: '/meals' });

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const tab = (name: 'Groceries' | 'Meals' | 'Settings') => press(new RegExp(`^${name}, tab`));
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
const typeInEditor = (text: string) =>
  fireEvent.changeText(screen.getByTestId('slot-editor'), text);

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

  it("C-MEAL-02 shows the Today pill on today's card only", async () => {
    await renderMeals();

    expect(todayPills()).toHaveLength(1);
    expect(within(screen.getByTestId('day-thu')).getByTestId('today-pill')).toBeOnTheScreen();
  });

  it('C-MEAL-03 moves a week at a time, and This week shows only away from the current week', async () => {
    await renderMeals();
    expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();

    await press('Next week');
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-26');
    expect(dayHeaders()[0]).toBe('Monday October 26, 0 of 3 meals planned');
    expect(todayPills()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'This week' })).toBeOnTheScreen();

    await press('Previous week');
    await press('Previous week');
    expect(range()).toHaveTextContent('Oct 12 – Oct 18');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-12');

    await press('This week');
    expect(range()).toHaveTextContent('Oct 19 – Oct 25');
    expect(mockWeekStarts.at(-1)).toBe(THIS_WEEK);
    expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();
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
  });

  it('R26.7 uses only static test IDs, none with meal text', async () => {
    await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-dinner'));

    const ids = screen
      .getAllByTestId(/./, { includeHiddenElements: true })
      .map((e) => e.props.testID as string);
    expect(ids).toContain('meals-week');
    expect(ids).toContain('slot-editor');
    expect(ids.filter((id) => /Tacos|Porridge|e1|e2/.test(id))).toEqual([]);
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
    expect(screen.getAllByText('＋ Add dinner')).toHaveLength(7);
  });

  it('C-MEAL-06 reloads on pull to refresh', async () => {
    await renderMeals();

    await act(
      async () => void screen.getByTestId('meals-week').props.refreshControl.props.onRefresh(),
    );

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

describe('Meals editing', () => {
  it('C-MEAL-07 opens a tapped slot; tapping another saves the first and opens the second', async () => {
    await renderMeals();

    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    expect(screen.getByTestId('slot-editor')).toHaveProp('accessibilityLabel', 'Thursday lunch');
    expect(screen.queryByTestId('slot-thu-lunch')).toBeNull();

    await typeInEditor('Soup');
    await fireEvent.press(screen.getByTestId('slot-tue-dinner'));

    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'lunch', body: 'Soup' }]]);
    expect(screen.getAllByTestId('slot-editor')).toHaveLength(1);
    expect(screen.getByTestId('slot-editor')).toHaveProp('accessibilityLabel', 'Tuesday dinner');
    expect(screen.getByTestId('slot-thu-lunch')).toBeOnTheScreen();
  });

  it('closes the editor on Return, after saving', async () => {
    await renderMeals();

    await fireEvent.press(screen.getByTestId('slot-thu-dinner'));
    await typeInEditor('Tacos al pastor');
    // Return closes the editor at once; the blur that follows reaches a field that's gone.
    await fireEvent(screen.getByTestId('slot-editor'), 'submitEditing');

    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: THURSDAY, mealType: 'dinner', body: 'Tacos al pastor' }],
    ]);
    expect(screen.queryByTestId('slot-editor')).toBeNull();
    expect(screen.getByTestId('slot-thu-dinner')).toBeOnTheScreen();
  });

  it("a late close from one slot doesn't close the slot opened after it", async () => {
    await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    const lunchEditor = screen.getByTestId('slot-editor');
    const closeLunch = lunchEditor.props.onBlur as () => void;

    await fireEvent.press(screen.getByTestId('slot-fri-lunch'));
    await act(async () => closeLunch());

    expect(screen.getByTestId('slot-editor')).toHaveProp('accessibilityLabel', 'Friday lunch');
  });

  it('saves and closes an open slot when the week changes', async () => {
    await renderMeals();

    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await typeInEditor('Soup');
    await press('Next week');

    expect(mockSetMeal).toHaveBeenCalledWith({ date: THURSDAY, mealType: 'lunch', body: 'Soup' });
    expect(screen.queryByTestId('slot-editor')).toBeNull();
  });

  it('C-MEAL-08 saves an open slot when the member switches to Groceries', async () => {
    const app = await renderMeals();

    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await typeInEditor('Soup');
    await tab('Groceries');

    expect(app.getPathname()).toBe('/groceries');
    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'lunch', body: 'Soup' }]]);

    await tab('Meals');
    expect(screen.queryByTestId('slot-editor')).toBeNull();
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

  it('C-MEAL-11 shows a failed save toast at the top, from the Meals ToastProvider', async () => {
    await update({ saveFails: true });
    await renderMeals();

    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await typeInEditor('Soup');
    await fireEvent(screen.getByTestId('slot-editor'), 'blur');

    // Clear of the keyboard, which another open slot would bring up (DD35).
    expect(screen.getByTestId('toast')).toHaveStyle({ top: 8 });
    expect(
      within(screen.getByTestId('toast')).getByText("Couldn't save that meal"),
    ).toBeOnTheScreen();
  });
});

describe('Meals and the household calendar', () => {
  it('C-MEAL-10 moves the Today pill at midnight and keeps the week; a new week offers This week', async () => {
    await renderMeals();

    await update({ today: '2026-10-23' as IsoDate });
    expect(todayPills()).toHaveLength(1);
    expect(within(screen.getByTestId('day-fri')).getByTestId('today-pill')).toBeOnTheScreen();
    expect(range()).toHaveTextContent('Oct 19 – Oct 25');
    expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();

    // Sunday night into Monday: the viewed week stays, and is no longer the current one (R34.3).
    await update({ today: '2026-10-26' as IsoDate });
    expect(range()).toHaveTextContent('Oct 19 – Oct 25');
    expect(todayPills()).toHaveLength(0);

    await press('This week');
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(within(screen.getByTestId('day-mon')).getByTestId('today-pill')).toBeOnTheScreen();
  });

  it('C-MEAL-12 shows Reconnecting… in the Meals header while the indicator is on', async () => {
    await renderMeals();
    expect(screen.queryByText('Reconnecting…')).toBeNull();

    await update({ reconnecting: true });

    expect(screen.getByText('Reconnecting…')).toBeOnTheScreen();
  });

  it("C-MEAL-13 scrolls to today's card, unanimated, on first show and after This week", async () => {
    await renderMeals();

    await layOut('day-thu', 840);
    expect(scrollTo.mock.calls).toEqual([[{ y: 840, animated: false }]]);

    await press('Previous week');
    await press('This week');
    await layOut('day-thu', 900);

    expect(scrollTo.mock.calls).toEqual([
      [{ y: 840, animated: false }],
      [{ y: 900, animated: false }],
    ]);
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
  const sheetTitle = () => screen.queryByRole('header', { name: 'Add item' });

  it('C-AGR-01 is a 44 pt header button that opens the add-item sheet over Meals', async () => {
    const app = await renderMeals();

    expect(addToGroceries()).toHaveProp('testID', 'add-to-groceries');
    expect(touchTarget(addToGroceries())).toEqual({ width: 44, height: 44 });
    expect(addToGroceries().children[0]).toHaveProp('name', 'cart.badge.plus');
    expect(sheetTitle()).toBeNull();

    await fireEvent.press(addToGroceries());

    expect(app.getPathname()).toBe('/add-item');
    expect(sheetTitle()).toBeOnTheScreen();
    // Meals stays mounted underneath (R37.3).
    expect(screen.getByTestId('meals-week', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('C-AGR-02 returns to the same week when the sheet closes', async () => {
    const app = await renderMeals();
    await press('Next week');

    await fireEvent.press(addToGroceries());
    await press('Done');

    expect(app.getPathname()).toBe('/meals');
    expect(sheetTitle()).toBeNull();
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-26');
  });

  it('C-AGR-03 saves an open slot when the sheet opens', async () => {
    await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await typeInEditor('Soup');

    await fireEvent.press(addToGroceries());

    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'lunch', body: 'Soup' }]]);
  });

  it('C-AGR-04 opens the sheet empty, with no route params and no meal text', async () => {
    const app = await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-dinner'));

    await fireEvent.press(addToGroceries());

    expect(app.getPathnameWithParams()).toBe('/add-item');
    expect(app.getSearchParams()).toEqual({});
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Quantity (optional)')).toHaveDisplayValue('');
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

// The Library button, meal-library 4-test-plan §4.2. The library is a stub here.
describe('Library button', () => {
  const library = () => screen.getByRole('button', { name: 'Meal Library' });

  it('C-LIB-01 is "Library" in the Meals header, at least 44 pt, labelled "Meal Library"', async () => {
    await renderMeals();

    expect(library()).toHaveProp('testID', 'library-button');
    expect(within(library()).getByText('Library')).toBeOnTheScreen();
    expect(touchTarget(library()).width).toBeGreaterThanOrEqual(44);
    expect(touchTarget(library()).height).toBeGreaterThanOrEqual(44);
  });

  it('C-LIB-01 opens the Meal Library over Meals', async () => {
    const app = await renderMeals();

    await fireEvent.press(library());

    expect(app.getPathname()).toBe('/meal-library');
    expect(app.getSearchParams()).toEqual({});
    expect(screen.getByText('Meal Library screen')).toBeOnTheScreen();
    // Meals stays mounted underneath (R40.2).
    expect(screen.getByTestId('meals-week', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('C-LIB-02 Back shows Meals at the same week', async () => {
    const app = await renderMeals();
    await press('Next week');
    await fireEvent.press(library());

    await act(() => router.back());

    expect(app.getPathname()).toBe('/meals');
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(mockWeekStarts.at(-1)).toBe('2026-10-26');
  });

  it('C-LIB-03 saves an open slot when the library opens', async () => {
    await renderMeals();
    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await typeInEditor('Soup');

    await fireEvent.press(library());

    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'lunch', body: 'Soup' }]]);
  });
});

// Choosing from the Meal Library, meal-library 4-test-plan §4.7 and design §3.11. The picker is a
// stub: `closePicker` leaves its hand-off and goes back, as choosing or Cancel does (C-PICK-04,
// C-PICK-05).
describe('Choose from Meal Library', () => {
  type MealPick = Parameters<typeof mealPick.set>[0];
  const TACOS = 'Tacos\nBeef, corn tortillas';
  const thursdayDinner = (text: string): MealPick => ({ date: THURSDAY, mealType: 'dinner', text });

  let announce: jest.SpyInstance;

  beforeEach(() => {
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => announce.mockRestore());

  /** Opens a slot's editor, optionally types in it, and taps Choose from Meal Library. */
  async function openPicker(slotTestID: string, typed?: string) {
    await fireEvent.press(screen.getByTestId(slotTestID));
    if (typed !== undefined) await typeInEditor(typed);
    await fireEvent.press(screen.getByTestId('slot-choose'));
  }

  /** What the picker does on leaving: a choice sets the pick, then it goes back. */
  const closePicker = (pick?: MealPick) =>
    act(() => {
      if (pick) mealPick.set(pick);
      router.back();
    });

  const editor = () => screen.getByTestId('slot-editor');

  it('C-MEAL-15 Choose opens the picker with only the date and meal type, saving the draft as it opens', async () => {
    const app = await renderMeals();

    await openPicker('slot-thu-dinner', 'Pasta');

    expect(app.getPathname()).toBe('/meal-picker');
    expect(screen.getByText('Meal picker screen')).toBeOnTheScreen();
    // C-MEAL-22: no meal text in the route (R26.4, DD51).
    expect(app.getSearchParams()).toEqual({ date: THURSDAY, mealType: 'dinner' });
    expect(app.getPathnameWithParams()).not.toMatch(/Pasta|Tacos/);
    // The editor closed and saved the draft (R32.3, R45.7). Meals stays mounted underneath.
    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: THURSDAY, mealType: 'dinner', body: 'Pasta' }],
    ]);
    expect(screen.queryByTestId('slot-editor', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('meals-week', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('C-MEAL-16 a pick saves the copied text, reopens the editor showing it, and announces it', async () => {
    const app = await renderMeals();
    await openPicker('slot-thu-dinner', 'Pasta');

    await closePicker(thursdayDinner(TACOS));

    expect(app.getPathname()).toBe('/meals');
    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: THURSDAY, mealType: 'dinner', body: 'Pasta' }],
      [{ date: THURSDAY, mealType: 'dinner', body: TACOS }],
    ]);
    expect(editor()).toHaveProp('accessibilityLabel', 'Thursday dinner');
    expect(editor()).toHaveDisplayValue(TACOS);
    expect(announce).toHaveBeenCalledWith('Thursday dinner: Tacos');
    // Applied once, then cleared (DD51).
    expect(mealPick.read()).toBeNull();

    // The copied text changes and saves like typed text (R45.5).
    await typeInEditor(`${TACOS} — no cheese`);
    await fireEvent(editor(), 'submitEditing');

    expect(mockSetMeal.mock.calls.at(-1)).toEqual([
      { date: THURSDAY, mealType: 'dinner', body: `${TACOS} — no cheese` },
    ]);
    expect(screen.queryByTestId('slot-editor')).toBeNull();

    // Opened again by a tap, the slot starts from its entry, not from the meal chosen earlier.
    await fireEvent.press(screen.getByTestId('slot-thu-dinner'));
    expect(editor()).toHaveDisplayValue(`${TACOS} — no cheese`);
  });

  it("C-MEAL-17 a pick equal to the slot's text sends no write, and the editor reopens", async () => {
    await renderMeals();
    await openPicker('slot-thu-dinner');

    await closePicker(thursdayDinner('Tacos'));

    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(editor()).toHaveProp('accessibilityLabel', 'Thursday dinner');
    expect(editor()).toHaveDisplayValue('Tacos');
  });

  it("C-MEAL-18 closing without a pick reopens the slot's editor at the same week, with the text typed before", async () => {
    const app = await renderMeals();
    await press('Next week');
    await openPicker('slot-thu-dinner', 'Pasta');

    await closePicker();

    expect(app.getPathname()).toBe('/meals');
    expect(range()).toHaveTextContent('Oct 26 – Nov 1');
    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: '2026-10-29', mealType: 'dinner', body: 'Pasta' }],
    ]);
    expect(editor()).toHaveProp('accessibilityLabel', 'Thursday dinner');
    expect(editor()).toHaveDisplayValue('Pasta');
  });

  it('C-MEAL-19 ignores a pick for another slot', async () => {
    await renderMeals();
    await openPicker('slot-thu-dinner');

    await closePicker({ date: '2026-10-23' as IsoDate, mealType: 'dinner', text: TACOS });

    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(editor()).toHaveProp('accessibilityLabel', 'Thursday dinner');
    expect(editor()).toHaveDisplayValue('Tacos');
    expect(within(screen.getByTestId('day-fri')).getByText('＋ Add dinner')).toBeOnTheScreen();
  });

  it('C-MEAL-19 ignores a pick it has already applied', async () => {
    // The hand-off keeps the pick, as if clearing it had failed, so Meals sees its id again.
    const clear = jest.spyOn(mealPick, 'clear').mockImplementation(() => {});
    try {
      await renderMeals();
      await openPicker('slot-thu-dinner');
      await closePicker(thursdayDinner(TACOS));
      await typeInEditor('Tacos, no cheese');

      // Choose again, then close the picker without choosing.
      await fireEvent.press(screen.getByTestId('slot-choose'));
      await closePicker();

      expect(mockSetMeal.mock.calls).toEqual([
        [{ date: THURSDAY, mealType: 'dinner', body: TACOS }],
        [{ date: THURSDAY, mealType: 'dinner', body: 'Tacos, no cheese' }],
      ]);
      expect(editor()).toHaveDisplayValue('Tacos, no cheese');
    } finally {
      clear.mockRestore();
    }
  });

  it("C-MEAL-20 shows Meals' Retry toast when saving the chosen text fails", async () => {
    await update({ saveFails: true });
    await renderMeals();
    await openPicker('slot-thu-dinner');

    await closePicker(thursdayDinner(TACOS));

    expect(mockSetMeal).toHaveBeenCalledWith({ date: THURSDAY, mealType: 'dinner', body: TACOS });
    const toast = screen.getByTestId('toast');
    expect(within(toast).getByText("Couldn't save that meal")).toBeOnTheScreen();
    expect(within(toast).getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
  });

  it('C-MEAL-21 typing in a slot works as before when the library is never opened', async () => {
    await renderMeals();
    // A pick that no Choose asked for, such as one left by a picker opened another way.
    mealPick.set(thursdayDinner(TACOS));

    await tab('Groceries');
    await tab('Meals');
    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await typeInEditor('Soup');
    await fireEvent(editor(), 'submitEditing');

    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'lunch', body: 'Soup' }]]);
    expect(screen.queryByTestId('slot-editor')).toBeNull();
  });

  it('only a pick made while the picker is open fills the slot (R45.7)', async () => {
    await renderMeals();
    mealPick.set(thursdayDinner(TACOS));

    await openPicker('slot-thu-dinner');
    await closePicker();

    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(editor()).toHaveDisplayValue('Tacos');
  });
});
