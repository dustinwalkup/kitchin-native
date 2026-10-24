import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useSyncExternalStore } from 'react';
import { Text } from 'react-native';

import AppLayout from '@/app/(app)/_layout';
import MealLibrary from '@/app/(app)/meal-library';
import { buildLibrary, type Library } from '@/features/meal-library/domain';
import { lastSaved, mealPick, newMealName } from '@/features/meal-library/handoff';
import type { LibraryView } from '@/features/meal-library/hooks';
import { touchTarget } from '@/test/a11y';
import { makeMealRow, makeTagRow } from '@/test/factories';
import { nativeHeaders } from '@/test/native-header';

// Meal Library screen tests C-LIB-04 to C-LIB-10 (4-test-plan §4.2). C-LIB-01 to C-LIB-03, which
// start on Meals, are in meals.test.tsx. The real screen runs under the real (app) layout, so focus
// and the header behave as in the app. The hooks are mocked (§8.4): the library comes from the real
// buildLibrary, and the meal form is a stub until task 18.4.

const DINNER = 'tag-1';
const QUICK = 'tag-2';
const STEW = 'meal-1';
const TACOS = 'meal-2';

const LIBRARY = buildLibrary(
  [
    makeMealRow({
      id: TACOS,
      name: 'Tacos',
      library_meal_tags: [{ tag_id: DINNER }, { tag_id: QUICK }],
    }),
    makeMealRow({ id: STEW, name: 'Beef stew', library_meal_tags: [{ tag_id: DINNER }] }),
  ],
  [makeTagRow({ id: DINNER, name: 'Dinner' }), makeTagRow({ id: QUICK, name: 'Quick & Easy' })],
).library;
const EMPTY: Library = { meals: [], tags: [], tagsById: new Map() };

/** What the mocked hook returns. Changing it re-renders the screen, as the real hook would. */
const mockState = {
  library: LIBRARY,
  status: 'ready' as LibraryView['status'],
  refreshFailedAt: null as number | null,
  version: 0,
  listeners: new Set<() => void>(),
};

const update = (changes: Partial<typeof mockState>) =>
  act(async () => {
    Object.assign(mockState, changes);
    mockState.version += 1;
    mockState.listeners.forEach((listener) => listener());
  });

const mockRefetch = jest.fn(async () => {});

// jest.mock factories may only use names that start with "mock", and hooks must start with "use",
// so the stand-in is a method of one object.
const mockHooks = {
  useLibrary(): LibraryView {
    useSyncExternalStore(
      (listener) => {
        mockState.listeners.add(listener);
        return () => mockState.listeners.delete(listener);
      },
      () => mockState.version,
    );
    const { library, status, refreshFailedAt } = mockState;
    return { library, status, refetch: mockRefetch, refreshFailedAt };
  },
};

jest.mock('@/features/meal-library/hooks', () => ({ useLibrary: () => mockHooks.useLibrary() }));

// The (app) layout's channel, table handlers and variant, which these tests don't use.
jest.mock('@/features/groceries/realtime', () => ({ groceryTableHandlers: {} }));
jest.mock('@/features/meals/realtime', () => ({ mealTableHandlers: {} }));
jest.mock('@/features/meal-library/realtime', () => ({ libraryTableHandlers: {} }));
jest.mock('@/features/household/use-household-realtime', () => ({
  useHouseholdRealtime: () => {},
}));
jest.mock('@/features/household/use-connection-state', () => ({
  useRealtimeDegradedReport: () => {},
}));
jest.mock('@/lib/env', () => ({ env: { variant: 'production', sentryDsn: null } }));

function MealsStub() {
  return <Text>Meals screen</Text>;
}

function MealFormStub() {
  return <Text>Meal form</Text>;
}

const ROUTES = {
  '(app)/_layout': AppLayout,
  '(app)/(tabs)/meals': MealsStub,
  '(app)/meal-library': MealLibrary,
  '(app)/meal-form': MealFormStub,
};

const OFFLINE_BANNER = "Offline — changes will send when you're back online";

beforeEach(async () => {
  jest.clearAllMocks();
  newMealName.clear();
  lastSaved.clear();
  mealPick.clear();
  await update({ library: LIBRARY, status: 'ready', refreshFailedAt: null });
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.useRealTimers();
});

/** Opens Meals, then the library over it, as the Library button does. */
async function renderLibrary() {
  const app = await renderRouter(ROUTES, { initialUrl: '/meals' });
  await act(() => router.push('/meal-library'));
  return app;
}

/** Leaves the form stub, as Save or Cancel will, and returns to the library. */
const closeForm = () => act(() => router.back());

const addMeal = () => fireEvent.press(screen.getByTestId('library-add-meal'));
const search = () => screen.getByLabelText('Search meals');
const row = (id: string) => screen.getByTestId(`meal-row-${id}`);
const toast = () => screen.queryByTestId('toast');
const justSavedRow = () => screen.queryByTestId('library-just-saved');

describe('Meal Library screen', () => {
  it('lists the meals in alphabetical order, each with its tags', async () => {
    await renderLibrary();

    expect(screen.getAllByTestId(/^meal-row-/).map((r) => r.props.testID)).toEqual([
      `meal-row-${STEW}`,
      `meal-row-${TACOS}`,
    ]);
    expect(row(TACOS)).toHaveProp('accessibilityLabel', 'Tacos. Tags: Dinner, Quick & Easy');
    expect(row(TACOS)).toHaveProp('accessibilityHint', 'Edits this meal');
  });

  it('C-LIB-01 is titled "Meal Library", with Back to Meals', async () => {
    await renderLibrary();

    expect(nativeHeaders()).toContainEqual(
      expect.objectContaining({ title: 'Meal Library', backTitle: 'Meals' }),
    );
  });

  it('R40.6 shows Add meal in the header, labelled and at least 44 pt', async () => {
    await renderLibrary();

    const button = screen.getByRole('button', { name: 'Add meal' });
    expect(button).toHaveProp('testID', 'library-add-meal');
    expect(touchTarget(button).width).toBeGreaterThanOrEqual(44);
    expect(touchTarget(button).height).toBeGreaterThanOrEqual(44);
  });

  it('C-LIB-04 Add meal starts the name from the search and opens the form', async () => {
    const app = await renderLibrary();
    await fireEvent.changeText(search(), 'lasag');

    await addMeal();

    expect(newMealName.read()?.value).toBe('lasag');
    expect(app.getPathname()).toBe('/meal-form');
    expect(app.getSearchParams()).toEqual({});
  });

  it('C-LIB-04 Add meal with an empty search clears the name hand-off', async () => {
    newMealName.set('left over');
    const app = await renderLibrary();

    await addMeal();

    expect(newMealName.read()).toBeNull();
    expect(app.getPathname()).toBe('/meal-form');
  });

  it('C-LIB-04 follows the search as it changes, including Clear filters', async () => {
    await renderLibrary();
    await fireEvent.changeText(search(), 'taco');
    await fireEvent.press(screen.getByTestId('library-clear-filters'));

    await addMeal();

    expect(newMealName.read()).toBeNull();
  });

  it('C-LIB-05 a tapped row opens the form with only its ID as a param', async () => {
    const app = await renderLibrary();

    await fireEvent.press(row(TACOS));

    expect(app.getPathname()).toBe('/meal-form');
    expect(app.getSearchParams()).toEqual({ id: TACOS });
    expect(app.getPathnameWithParams()).not.toMatch(/Tacos/i);
  });

  it('C-LIB-09 opens with an empty search and no tags, and keeps both after the form closes', async () => {
    await renderLibrary();
    expect(search()).toHaveDisplayValue('');
    expect(screen.getByTestId('library-filter')).toHaveProp('accessibilityLabel', 'Filter by tags');

    await fireEvent.changeText(search(), 'ta');
    await fireEvent.press(screen.getByTestId('library-filter'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dinner' }));
    await fireEvent.press(row(TACOS));
    await closeForm();

    expect(search()).toHaveDisplayValue('ta');
    expect(screen.getByTestId('library-filter')).toHaveProp(
      'accessibilityLabel',
      'Filter by tags, 1 selected',
    );
    expect(screen.getAllByTestId(/^meal-row-/).map((r) => r.props.testID)).toEqual([
      `meal-row-${TACOS}`,
    ]);
  });
});

describe('after the form (C-LIB-08)', () => {
  it('shows "Meal saved" with the Just saved row on focus after a save', async () => {
    await renderLibrary();
    await fireEvent.changeText(search(), 'stew');
    await addMeal();

    await act(async () => lastSaved.set({ mealId: TACOS, kind: 'saved' }));
    await closeForm();

    expect(within(toast()!).getByText('Meal saved')).toBeOnTheScreen();
    // Above the list, though the search hides it (DD55).
    expect(within(justSavedRow()!).getByTestId(`meal-row-${TACOS}`)).toBeOnTheScreen();
    expect(lastSaved.read()).toBeNull();
  });

  it('shows "Meal deleted", with no Just saved row, after a delete', async () => {
    await renderLibrary();
    await fireEvent.press(row(TACOS));

    await act(async () => {
      lastSaved.set({ mealId: TACOS, kind: 'deleted' });
      Object.assign(mockState, { library: buildLibrary([], []).library });
    });
    await closeForm();

    expect(within(toast()!).getByText('Meal deleted')).toBeOnTheScreen();
    expect(justSavedRow()).toBeNull();
  });

  it("doesn't repeat either on a second focus, and leaving ends the Just saved row", async () => {
    await renderLibrary();
    await addMeal();
    await act(async () => lastSaved.set({ mealId: STEW, kind: 'saved' }));
    await closeForm();
    expect(justSavedRow()).toBeOnTheScreen();
    await act(async () => jest.runAllTimers());
    expect(toast()).toBeNull();

    await fireEvent.press(row(TACOS));
    await closeForm();

    expect(toast()).toBeNull();
    expect(justSavedRow()).toBeNull();
  });

  it('shows nothing when the form closes without saving', async () => {
    await renderLibrary();

    await addMeal();
    await closeForm();

    expect(toast()).toBeNull();
    expect(justSavedRow()).toBeNull();
  });
});

describe('Meal Library states (C-LIB-06)', () => {
  it('shows skeleton rows on the first load', async () => {
    await update({ library: EMPTY, status: 'loading' });
    await renderLibrary();

    expect(screen.getByTestId('library-skeleton')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add meal' })).toBeOnTheScreen();
  });

  it('shows LoadError when nothing has loaded, and its Retry reloads', async () => {
    await update({ library: EMPTY, status: 'error' });
    await renderLibrary();

    expect(screen.getByRole('header', { name: "Couldn't load meals" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded meals when a reload fails, with a toast at the top whose Retry reloads', async () => {
    await renderLibrary();

    await update({ refreshFailedAt: 1 });

    expect(screen.getAllByTestId(/^meal-row-/)).toHaveLength(2);
    expect(within(toast()!).getByText("Couldn't load meals")).toBeOnTheScreen();
    await fireEvent.press(within(toast()!).getByRole('button', { name: 'Retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId(/^meal-row-/)).toHaveLength(2);
  });

  it('shows the offline banner and "Waiting for connection…" while paused with nothing loaded', async () => {
    onlineManager.setOnline(false);
    await update({ library: EMPTY, status: 'waiting' });
    await renderLibrary();

    expect(screen.getByText(OFFLINE_BANNER)).toBeOnTheScreen();
    expect(screen.getByText('Waiting for connection…')).toBeOnTheScreen();
  });

  it('shows the empty library, whose Add meal opens the form', async () => {
    await update({ library: EMPTY });
    const app = await renderLibrary();

    expect(screen.getByRole('header', { name: 'No saved meals yet' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Search meals')).toBeNull();
    await fireEvent.press(
      within(screen.getByTestId('library-empty')).getByRole('button', { name: 'Add meal' }),
    );

    expect(app.getPathname()).toBe('/meal-form');
  });

  it('shows "No meals match" below the search when nothing matches', async () => {
    await renderLibrary();

    await fireEvent.changeText(search(), 'lasagna');

    expect(screen.getByRole('header', { name: 'No meals match' })).toBeOnTheScreen();
    expect(search()).toBeOnTheScreen();
  });

  it('C-LIB-07 reloads on pull to refresh', async () => {
    await renderLibrary();

    await act(
      async () => void screen.getByTestId('library-list').props.refreshControl.props.onRefresh(),
    );

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('C-LIB-10 offline, shows the banner and keeps the cached list', async () => {
    await renderLibrary();

    await act(async () => onlineManager.setOnline(false));

    expect(screen.getByText(OFFLINE_BANNER)).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^meal-row-/)).toHaveLength(2);
  });
});
