import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useSyncExternalStore } from 'react';
import { Alert, type AlertButton, Text } from 'react-native';

import AppLayout from '@/app/(app)/_layout';
import MealForm from '@/app/(app)/meal-form';
import MealLibrary from '@/app/(app)/meal-library';
import MealPicker from '@/app/(app)/meal-picker';
import { COPY } from '@/features/meal-library/constants';
import { buildLibrary, type Library } from '@/features/meal-library/domain';
import { lastSaved, mealPick, newMealName } from '@/features/meal-library/handoff';
import { reportOnce } from '@/lib/reporting';
import type {
  DeleteOutcome,
  LibraryView,
  SaveMealVariables,
  SaveOutcome,
} from '@/features/meal-library/hooks';
import { touchTarget } from '@/test/a11y';
import { makeMealRow, makeTagRow } from '@/test/factories';
import { nativeHeaders, stackPresentations } from '@/test/native-header';

// Meal Library screen tests C-LIB-04 to C-LIB-10 (4-test-plan §4.2), the meal form's C-LFS-01 to
// C-LFS-13 (§4.4) and the picker's C-PICK-01 to C-PICK-10 (§4.6). C-LIB-01 to C-LIB-03, which start
// on Meals, are in meals.test.tsx. The real screens run under the real (app) layout, so focus, the
// header and discard prevention behave as in the app. The hooks are mocked (§8.4): the library
// comes from the real buildLibrary, and the save and delete are spies that return the outcome a
// test chooses.

const DINNER = 'tag-1';
const QUICK = 'tag-2';
const STEW = 'meal-1';
const TACOS = 'meal-2';

const MEAL_ROWS = [
  makeMealRow({
    id: TACOS,
    name: 'Tacos',
    description: 'Beef, corn tortillas',
    library_meal_tags: [{ tag_id: DINNER }, { tag_id: QUICK }],
  }),
  makeMealRow({ id: STEW, name: 'Beef stew', library_meal_tags: [{ tag_id: DINNER }] }),
];
const TAG_ROWS = [
  makeTagRow({ id: DINNER, name: 'Dinner' }),
  makeTagRow({ id: QUICK, name: 'Quick & Easy' }),
];
const LIBRARY = buildLibrary(MEAL_ROWS, TAG_ROWS).library;
const EMPTY: Library = { meals: [], tags: [], tagsById: new Map() };

/** What the mocked hook returns. Changing it re-renders the screen, as the real hook would. */
const mockState = {
  library: LIBRARY,
  status: 'ready' as LibraryView['status'],
  refreshFailedAt: null as number | null,
  version: 0,
  listeners: new Set<() => void>(),
};

/** Changes what the hook returns, from inside a handler that's already in `act`. */
function setMockState(changes: Partial<typeof mockState>) {
  Object.assign(mockState, changes);
  mockState.version += 1;
  mockState.listeners.forEach((listener) => listener());
}

const update = (changes: Partial<typeof mockState>) => act(async () => setMockState(changes));

const mockRefetch = jest.fn(async () => {});
const mockSave = jest.fn<Promise<SaveOutcome>, [SaveMealVariables]>();
const mockDelete = jest.fn<Promise<DeleteOutcome>, [string]>();

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

jest.mock('@/features/meal-library/hooks', () => ({
  useLibrary: () => mockHooks.useLibrary(),
  useSaveMeal: () => mockSave,
  useDeleteMeal: () => mockDelete,
}));

// A new meal's ID, in a sequence a test can name (§8.4).
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

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
// The picker reports bad params (§6). Debug builds log every report; only that one is asserted.
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  reportCrash: jest.fn(),
  reportTestError: jest.fn(),
  setReportingUser: jest.fn(),
}));

function MealsStub() {
  return <Text>Meals screen</Text>;
}

const ROUTES = {
  '(app)/_layout': AppLayout,
  '(app)/(tabs)/meals': MealsStub,
  '(app)/meal-library': MealLibrary,
  '(app)/meal-form': MealForm,
  '(app)/meal-picker': MealPicker,
};

const OFFLINE_BANNER = "Offline — changes will send when you're back online";

let alert: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  newMealName.clear();
  lastSaved.clear();
  mealPick.clear();
  let uuid = 0;
  jest.mocked(randomUUID).mockImplementation(() => `new-${++uuid}`);
  mockSave.mockReset().mockImplementation(async ({ mealId }) => ({ ok: true, mealId }));
  mockDelete.mockReset().mockResolvedValue({ ok: true });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await update({ library: LIBRARY, status: 'ready', refreshFailedAt: null });
});

afterEach(() => {
  alert.mockRestore();
  onlineManager.setOnline(true);
  jest.useRealTimers();
});

/** Opens Meals, then the library over it, as the Library button does. */
async function renderLibrary() {
  const app = await renderRouter(ROUTES, { initialUrl: '/meals' });
  await act(() => router.push('/meal-library'));
  return app;
}

/** Leaves the form without changes, as Cancel does, and returns to the library. */
const closeForm = () => act(() => router.back());

const addMeal = () => fireEvent.press(screen.getByTestId('library-add-meal'));
const search = () => screen.getByLabelText('Search meals');
const row = (id: string) => screen.getByTestId(`meal-row-${id}`);
const toast = () => screen.queryByTestId('toast');
const justSavedRow = () => screen.queryByTestId('library-just-saved');

/** Opens the form for a new meal from the library, with `text` in the search. */
async function openNewMeal(text = '') {
  const app = await renderLibrary();
  if (text !== '') await fireEvent.changeText(search(), text);
  await addMeal();
  return app;
}

/** Opens the form for a meal from its row in the library. */
async function openMeal(id: string) {
  const app = await renderLibrary();
  await fireEvent.press(row(id));
  return app;
}

const nameField = () => screen.getByTestId('meal-form-name');
const descriptionField = () => screen.getByTestId('meal-form-description');
const saveButton = () => screen.getByTestId('meal-form-save');
const cancelButton = () => screen.getByTestId('meal-form-cancel');
const formError = () => screen.queryByTestId('meal-form-error');
const pressSave = () => fireEvent.press(saveButton());
const savedWith = (call: number) => mockSave.mock.calls[call][0];

/** The buttons of the last native alert. */
const alertButtons = (): AlertButton[] => alert.mock.calls.at(-1)?.[2] ?? [];
const pressAlert = (text: string) =>
  act(async () =>
    alertButtons()
      .find((button) => button.text === text)
      ?.onPress?.(),
  );

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

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

describe('Meal form screen', () => {
  it('C-LFS-01 a new meal is titled "New meal", with the name from the search', async () => {
    await openNewMeal('lasag');

    expect(nativeHeaders()).toContainEqual(expect.objectContaining({ title: 'New meal' }));
    expect(nameField()).toHaveDisplayValue('lasag');
    expect(descriptionField()).toHaveDisplayValue('');
    expect(screen.queryByTestId('meal-form-delete')).toBeNull();
  });

  it('C-LFS-01 an edit is titled "Edit meal", with the meal and its tags selected', async () => {
    newMealName.set('ignored');
    await openMeal(TACOS);

    expect(nativeHeaders()).toContainEqual(expect.objectContaining({ title: 'Edit meal' }));
    expect(nameField()).toHaveDisplayValue('Tacos');
    expect(descriptionField()).toHaveDisplayValue('Beef, corn tortillas');
    expect(screen.getByTestId(`tag-chip-${DINNER}`)).toBeSelected();
    expect(screen.getByTestId(`tag-chip-${QUICK}`)).toBeSelected();
    expect(screen.getByTestId('meal-form-delete')).toBeOnTheScreen();
  });

  it('C-LFS-02 presents full screen, with Cancel and Save in the header', async () => {
    await openNewMeal();

    expect(stackPresentations()).toEqual(['push', 'push', 'fullScreenModal']);
    for (const name of ['Cancel', 'Save']) {
      const button = screen.getByRole('button', { name });
      expect(touchTarget(button).width).toBeGreaterThanOrEqual(44);
      expect(touchTarget(button).height).toBeGreaterThanOrEqual(44);
    }
  });

  it('R42.5 Save checks the values first: an empty name saves nothing', async () => {
    const app = await openNewMeal();

    await pressSave();

    expect(screen.getByText('Enter a meal name')).toBeOnTheScreen();
    expect(mockSave).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/meal-form');
  });

  it('C-LFS-03 shows a spinner while saving, and disables Save and Cancel', async () => {
    const pending = deferred<SaveOutcome>();
    mockSave.mockReturnValueOnce(pending.promise);
    await openNewMeal('Lasagna');

    await pressSave();

    expect(screen.getByTestId('meal-form-save-spinner')).toBeOnTheScreen();
    expect(saveButton()).toBeBusy();
    expect(saveButton()).toBeDisabled();
    expect(cancelButton()).toBeDisabled();
    await pressSave();
    await fireEvent.press(cancelButton());
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ ok: true, mealId: 'new-1' }));
  });

  it('C-LFS-04 a new meal saves under its new ID, sets lastSaved and goes back', async () => {
    const handoff = jest.spyOn(lastSaved, 'set');
    const app = await openNewMeal('Lasagna');
    await fireEvent.changeText(descriptionField(), ' Beef and ricotta ');
    await fireEvent.press(screen.getByTestId(`tag-chip-${DINNER}`));

    await pressSave();

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(savedWith(0)).toEqual({
      base: null,
      mealId: 'new-1',
      meal: {
        name: 'Lasagna',
        description: 'Beef and ricotta',
        ingredients: null,
        tags: [{ kind: 'existing', id: DINNER }],
      },
    });
    expect(handoff).toHaveBeenCalledWith({ mealId: 'new-1', kind: 'saved' });
    expect(app.getPathname()).toBe('/meal-library');
    // Unsaved changes don't ask to be discarded once they're saved.
    expect(alert).not.toHaveBeenCalled();
    expect(within(toast()!).getByText('Meal saved')).toBeOnTheScreen();
  });

  it('C-LFS-04 an edit saves against the meal as it opened, and the library shows it', async () => {
    const app = await openMeal(TACOS);
    await fireEvent.changeText(nameField(), 'Fish tacos');

    await pressSave();

    expect(savedWith(0)).toEqual(
      expect.objectContaining({ base: expect.objectContaining({ id: TACOS }), mealId: TACOS }),
    );
    expect(savedWith(0).meal.name).toBe('Fish tacos');
    expect(randomUUID).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/meal-library');
    expect(within(justSavedRow()!).getByTestId(`meal-row-${TACOS}`)).toBeOnTheScreen();
  });

  it('C-LFS-05 Save on an unchanged edit goes back without saving', async () => {
    const app = await openMeal(TACOS);
    // Spaces that trimming removes aren't a change (R42.4, R42.11).
    await fireEvent.changeText(nameField(), 'Tacos  ');

    await pressSave();

    expect(mockSave).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/meal-library');
    expect(alert).not.toHaveBeenCalled();
    expect(toast()).toBeNull();
  });

  it('C-LFS-06 offline keeps every value, and Retry saves the same meal again', async () => {
    mockSave.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    const app = await openNewMeal('Lasagna');
    await fireEvent.changeText(descriptionField(), 'Beef and ricotta');

    await pressSave();

    expect(within(formError()!).getByText(COPY.offline)).toBeOnTheScreen();
    expect(nameField()).toHaveDisplayValue('Lasagna');
    expect(descriptionField()).toHaveDisplayValue('Beef and ricotta');
    expect(saveButton()).toBeEnabled();
    expect(cancelButton()).toBeEnabled();
    expect(app.getPathname()).toBe('/meal-form');

    await fireEvent.press(within(formError()!).getByRole('button', { name: 'Retry' }));

    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(savedWith(1)).toEqual(savedWith(0));
    expect(app.getPathname()).toBe('/meal-library');
  });

  it('C-LFS-13 a new meal keeps its ID across a failed save and the next Save', async () => {
    mockSave.mockResolvedValueOnce({ ok: false, reason: 'failed' });
    await openNewMeal('Lasagna');

    await pressSave();
    await fireEvent.changeText(nameField(), 'Lasagna verde');
    await pressSave();

    expect(mockSave.mock.calls.map(([v]) => v.mealId)).toEqual(['new-1', 'new-1']);
    expect(savedWith(1).meal.name).toBe('Lasagna verde');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('C-LFS-07 deleted elsewhere offers Save as new meal, which saves under a new ID', async () => {
    mockSave.mockResolvedValueOnce({ ok: false, reason: 'deleted' });
    const app = await openMeal(TACOS);
    await fireEvent.changeText(nameField(), 'Fish tacos');

    await pressSave();

    expect(within(formError()!).getByText(COPY.deletedElsewhere)).toBeOnTheScreen();
    expect(within(formError()!).queryByRole('button', { name: 'Retry' })).toBeNull();
    await fireEvent.press(within(formError()!).getByRole('button', { name: COPY.saveAsNew }));

    expect(savedWith(1)).toEqual({
      base: null,
      mealId: 'new-1',
      meal: {
        name: 'Fish tacos',
        description: 'Beef, corn tortillas',
        ingredients: null,
        tags: [
          { kind: 'existing', id: DINNER },
          { kind: 'existing', id: QUICK },
        ],
      },
    });
    expect(app.getPathname()).toBe('/meal-library');
  });

  it('C-LFS-07 a failed Save as new meal retries under the same new ID', async () => {
    mockSave
      .mockResolvedValueOnce({ ok: false, reason: 'deleted' })
      .mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await openMeal(TACOS);
    await fireEvent.changeText(nameField(), 'Fish tacos');
    await pressSave();
    await fireEvent.press(within(formError()!).getByRole('button', { name: COPY.saveAsNew }));

    await fireEvent.press(within(formError()!).getByRole('button', { name: 'Retry' }));

    expect(mockSave.mock.calls.map(([v]) => [v.base?.id ?? null, v.mealId])).toEqual([
      [TACOS, TACOS],
      [null, 'new-1'],
      [null, 'new-1'],
    ]);
    // The meal it replaced is gone, so there's nothing to delete.
    expect(screen.queryByTestId('meal-form-delete')).toBeNull();
  });

  it.each([
    {
      outcome: { ok: false, reason: 'invalid', field: 'description' },
      message: COPY.saveError,
      action: null,
    },
    {
      outcome: { ok: false, reason: 'invalid', field: null },
      message: COPY.saveError,
      action: null,
    },
    { outcome: { ok: false, reason: 'forbidden' }, message: COPY.forbidden, action: null },
    { outcome: { ok: false, reason: 'failed' }, message: COPY.saveError, action: 'Retry' },
  ] as { outcome: SaveOutcome; message: string; action: string | null }[])(
    'C-LFS-08 $outcome.reason ($outcome.field) shows "$message" with $action',
    async ({ outcome, message, action }) => {
      mockSave.mockResolvedValueOnce(outcome);
      await openMeal(TACOS);
      await fireEvent.changeText(descriptionField(), 'Pork, flour tortillas');

      await pressSave();

      expect(within(formError()!).getByText(message)).toBeOnTheScreen();
      expect(
        within(formError()!)
          .queryAllByRole('button')
          .map((b) => b.props.accessibilityLabel),
      ).toEqual(action === null ? [] : [action]);
      const rejected = !outcome.ok && outcome.reason === 'invalid' && outcome.field !== null;
      expect(screen.queryAllByText(COPY.fieldRejected)).toHaveLength(rejected ? 1 : 0);
      expect(descriptionField()).toHaveDisplayValue('Pork, flour tortillas');
    },
  );

  it('C-LFS-09 Cancel with changes asks first: Keep editing stays, Discard leaves', async () => {
    const app = await openNewMeal();
    await fireEvent.changeText(nameField(), 'Lasagna');

    await fireEvent.press(cancelButton());

    expect(alert).toHaveBeenCalledWith('Discard changes?', undefined, expect.any(Array));
    expect(alertButtons().map((b) => [b.text, b.style])).toEqual([
      ['Keep editing', 'cancel'],
      ['Discard', 'destructive'],
    ]);
    await pressAlert('Keep editing');
    expect(app.getPathname()).toBe('/meal-form');
    expect(nameField()).toHaveDisplayValue('Lasagna');

    await fireEvent.press(cancelButton());
    await pressAlert('Discard');

    expect(app.getPathname()).toBe('/meal-library');
    expect(mockSave).not.toHaveBeenCalled();
    expect(toast()).toBeNull();
  });

  it('C-LFS-09 Cancel without changes leaves at once', async () => {
    const app = await openMeal(TACOS);
    // A tag removed and added again is no change (R42.12).
    await fireEvent.press(screen.getByTestId(`tag-chip-${DINNER}`));
    await fireEvent.press(screen.getByTestId(`tag-chip-${DINNER}`));

    await fireEvent.press(cancelButton());

    expect(alert).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/meal-library');
  });

  it('C-LFS-10 Delete meal confirms with the name, and Cancel keeps the meal', async () => {
    const app = await openMeal(TACOS);

    await fireEvent.press(screen.getByTestId('meal-form-delete'));

    expect(alert).toHaveBeenCalledWith(
      'Delete “Tacos”?',
      "It's removed from the library. Meals already planned won't change.",
      expect.any(Array),
    );
    expect(alertButtons().map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Delete', 'destructive'],
    ]);
    await pressAlert('Cancel');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/meal-form');
  });

  it('C-LFS-10 a confirmed delete sets lastSaved and goes back, even with unsaved changes', async () => {
    const handoff = jest.spyOn(lastSaved, 'set');
    const app = await openMeal(TACOS);
    await fireEvent.changeText(nameField(), 'Fish tacos');

    await fireEvent.press(screen.getByTestId('meal-form-delete'));
    await pressAlert('Delete');

    expect(mockDelete).toHaveBeenCalledWith(TACOS);
    expect(handoff).toHaveBeenCalledWith({ mealId: TACOS, kind: 'deleted' });
    expect(app.getPathname()).toBe('/meal-library');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(within(toast()!).getByText('Meal deleted')).toBeOnTheScreen();
  });

  it('C-LFS-10 a failed delete keeps the form, and Retry deletes without asking again', async () => {
    mockDelete.mockResolvedValueOnce({ ok: false, reason: 'failed' });
    const app = await openMeal(TACOS);
    await fireEvent.press(screen.getByTestId('meal-form-delete'));

    await pressAlert('Delete');

    expect(within(formError()!).getByText(COPY.deleteError)).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/meal-form');
    expect(nameField()).toHaveDisplayValue('Tacos');
    await fireEvent.press(within(formError()!).getByRole('button', { name: 'Retry' }));

    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(app.getPathname()).toBe('/meal-library');
  });

  it('C-LFS-10 disables Save, Cancel and Delete meal while deleting', async () => {
    const pending = deferred<DeleteOutcome>();
    mockDelete.mockReturnValueOnce(pending.promise);
    await openMeal(TACOS);
    await fireEvent.press(screen.getByTestId('meal-form-delete'));

    await pressAlert('Delete');

    expect(saveButton()).toBeDisabled();
    expect(cancelButton()).toBeDisabled();
    expect(screen.getByTestId('meal-form-delete')).toBeDisabled();
    expect(screen.queryByTestId('meal-form-save-spinner')).toBeNull();

    await act(async () => pending.resolve({ ok: true }));
  });

  it("C-LFS-11 a change from the other phone doesn't reach the open form", async () => {
    await openMeal(TACOS);
    await fireEvent.changeText(descriptionField(), 'Pork, flour tortillas');

    await update({
      library: buildLibrary(
        [makeMealRow({ id: TACOS, name: 'Fish tacos', description: 'Cod, slaw' })],
        [
          makeTagRow({ id: DINNER, name: 'Dinner' }),
          makeTagRow({ id: QUICK, name: 'Quick & Easy' }),
        ],
      ).library,
    });

    expect(nameField()).toHaveDisplayValue('Tacos');
    expect(descriptionField()).toHaveDisplayValue('Pork, flour tortillas');
    expect(screen.getByTestId(`tag-chip-${DINNER}`)).toBeSelected();
    await pressSave();
    // Only what this member changed is compared and sent (R46.5).
    expect(savedWith(0).base).toEqual(expect.objectContaining({ name: 'Tacos' }));
  });

  it('C-LFS-11 a delete from the other phone keeps the form, so nothing typed is lost', async () => {
    await openMeal(TACOS);
    await fireEvent.changeText(nameField(), 'Fish tacos');

    await update({ library: buildLibrary([], []).library });

    expect(screen.queryByTestId('meal-form-missing')).toBeNull();
    expect(nameField()).toHaveDisplayValue('Fish tacos');
  });

  it("C-LFS-12 an ID that isn't in the library shows the missing meal, with Close", async () => {
    const app = await renderLibrary();

    await act(() => router.push({ pathname: '/meal-form', params: { id: 'meal-gone' } }));

    expect(
      screen.getByRole('header', { name: "This meal isn't in the library any more" }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('meal-form-name')).toBeNull();
    expect(screen.queryByTestId('meal-form-save')).toBeNull();
    expect(screen.queryByTestId('meal-form-cancel')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(app.getPathname()).toBe('/meal-library');
  });

  it('opens an edit once the library has loaded, on a cold start', async () => {
    await update({ library: EMPTY, status: 'loading' });
    await renderRouter(ROUTES, { initialUrl: `/meal-form?id=${TACOS}` });
    expect(screen.queryByTestId('meal-form-name')).toBeNull();
    expect(screen.queryByTestId('meal-form-missing')).toBeNull();

    await update({ status: 'error' });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    await update({ library: LIBRARY, status: 'ready' });

    expect(nameField()).toHaveDisplayValue('Tacos');
    expect(screen.getByTestId('meal-form-cancel')).toBeOnTheScreen();
  });
});

const THURSDAY = '2026-10-22';
const POPPERS = 'meal-3';

/** Opens the picker over Meals for Thursday dinner, as the slot editor's Choose button will. */
async function renderPicker(
  params: Record<string, string> = { date: THURSDAY, mealType: 'dinner' },
) {
  const app = await renderRouter(ROUTES, { initialUrl: '/meals' });
  await act(() => router.push({ pathname: '/meal-picker', params }));
  return app;
}

const addNewMeal = () => screen.getByRole('button', { name: '+ Add new meal' });
const rowIds = () => screen.getAllByTestId(/^meal-row-/).map((r) => r.props.testID);

describe('picker', () => {
  it('C-PICK-01 presents as a page sheet titled "Choose a meal", for Thursday dinner', async () => {
    const app = await renderPicker();

    expect(app.getPathname()).toBe('/meal-picker');
    expect(stackPresentations()).toEqual(['push', 'modal']);
    expect(nativeHeaders()).toContainEqual(expect.objectContaining({ title: 'Choose a meal' }));
    expect(screen.getByText('For Thursday dinner')).toBeOnTheScreen();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(touchTarget(cancel).width).toBeGreaterThanOrEqual(44);
    expect(touchTarget(cancel).height).toBeGreaterThanOrEqual(44);
  });

  it.each([
    { date: '2026-02-30', mealType: 'dinner' },
    { date: THURSDAY, mealType: 'snack' },
    { date: 'Thursday', mealType: 'dinner' },
    { mealType: 'dinner' },
  ] as Record<string, string>[])(
    'C-PICK-02 closes on bad params %j, and reports it once',
    async (params) => {
      const app = await renderPicker(params);

      expect(app.getPathname()).toBe('/meals');
      expect(reportOnce).toHaveBeenCalledTimes(1);
      expect(reportOnce).toHaveBeenCalledWith('picker_bad_params');
      expect(mealPick.read()).toBeNull();
    },
  );

  it('C-PICK-03 shows a cached library at once, with an empty search and no tags', async () => {
    await renderPicker();

    expect(screen.queryByTestId('library-skeleton')).toBeNull();
    expect(rowIds()).toEqual([`meal-row-${STEW}`, `meal-row-${TACOS}`]);
    expect(search()).toHaveDisplayValue('');
    expect(screen.getByTestId('library-filter')).toHaveProp('accessibilityLabel', 'Filter by tags');
  });

  it('C-PICK-04 tapping a meal picks its name and description for the slot, and goes back', async () => {
    const app = await renderPicker();

    await fireEvent.press(row(TACOS));

    expect(mealPick.read()?.value).toEqual({
      date: THURSDAY,
      mealType: 'dinner',
      text: 'Tacos\nBeef, corn tortillas',
    });
    expect(app.getPathname()).toBe('/meals');
  });

  it('C-PICK-05 Cancel goes back without a pick', async () => {
    const app = await renderPicker();

    await fireEvent.press(screen.getByTestId('picker-cancel'));

    expect(app.getPathname()).toBe('/meals');
    expect(mealPick.read()).toBeNull();
  });

  it('C-PICK-06 "+ Add new meal" starts the name from the search and opens the form', async () => {
    const app = await renderPicker();
    await fireEvent.changeText(search(), 'lasag');

    await fireEvent.press(addNewMeal());

    expect(newMealName.read()?.value).toBe('lasag');
    expect(app.getPathname()).toBe('/meal-form');
    expect(app.getSearchParams()).toEqual({});
    expect(nameField()).toHaveDisplayValue('lasag');
  });

  it('C-PICK-06 "+ Add new meal" with an empty search clears the name hand-off', async () => {
    newMealName.set('left over');
    await renderPicker();

    await fireEvent.press(addNewMeal());

    expect(newMealName.read()).toBeNull();
  });

  it('C-PICK-07 after a save, shows "Meal saved" and the Just saved row, which chooses it', async () => {
    // As the real hook does, the saved meal is in the library before the save resolves.
    mockSave.mockImplementationOnce(async ({ mealId, meal }) => {
      setMockState({
        library: buildLibrary(
          [...MEAL_ROWS, makeMealRow({ id: mealId, name: meal.name, description: null })],
          TAG_ROWS,
        ).library,
      });
      return { ok: true, mealId };
    });
    const app = await renderPicker();
    await fireEvent.changeText(search(), 'stew');
    await fireEvent.press(addNewMeal());
    await fireEvent.changeText(nameField(), 'Lasagna');

    await pressSave();

    expect(app.getPathname()).toBe('/meal-picker');
    expect(within(toast()!).getByText('Meal saved')).toBeOnTheScreen();
    // Above the search's results, which don't include it (DD55).
    expect(search()).toHaveDisplayValue('stew');
    expect(within(justSavedRow()!).getByTestId('meal-row-new-1')).toBeOnTheScreen();
    expect(rowIds()).toEqual(['meal-row-new-1', `meal-row-${STEW}`]);
    expect(lastSaved.read()).toBeNull();

    await fireEvent.press(within(justSavedRow()!).getByTestId('meal-row-new-1'));

    expect(mealPick.read()?.value).toEqual({ date: THURSDAY, mealType: 'dinner', text: 'Lasagna' });
    expect(app.getPathname()).toBe('/meals');
  });

  it('C-PICK-07 cancelling the form returns to the picker as it was', async () => {
    const app = await renderPicker();
    await fireEvent.changeText(search(), 'ta');

    await fireEvent.press(addNewMeal());
    await fireEvent.press(cancelButton());

    expect(app.getPathname()).toBe('/meal-picker');
    expect(search()).toHaveDisplayValue('ta');
    expect(toast()).toBeNull();
    expect(justSavedRow()).toBeNull();
  });

  it('C-PICK-08 the empty library says so and offers "+ Add new meal" once', async () => {
    await update({ library: EMPTY });
    const app = await renderPicker();

    expect(screen.getByRole('header', { name: 'No saved meals yet' })).toBeOnTheScreen();
    expect(screen.getByText('For Thursday dinner')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: '+ Add new meal' })).toHaveLength(1);
    await fireEvent.press(
      within(screen.getByTestId('library-empty')).getByRole('button', { name: '+ Add new meal' }),
    );

    expect(app.getPathname()).toBe('/meal-form');
  });

  it('C-PICK-08 shows skeleton rows on the first load, and Cancel still closes', async () => {
    await update({ library: EMPTY, status: 'loading' });
    const app = await renderPicker();

    expect(screen.getByTestId('library-skeleton')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('picker-cancel'));

    expect(app.getPathname()).toBe('/meals');
    expect(mealPick.read()).toBeNull();
  });

  it('C-PICK-08 shows LoadError when nothing has loaded, and its Retry reloads', async () => {
    await update({ library: EMPTY, status: 'error' });
    await renderPicker();

    expect(screen.getByRole('header', { name: "Couldn't load meals" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('C-PICK-08 keeps the meals when a reload fails, with a toast whose Retry reloads', async () => {
    await renderPicker();

    await update({ refreshFailedAt: 1 });

    expect(rowIds()).toHaveLength(2);
    await fireEvent.press(within(toast()!).getByRole('button', { name: 'Retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('C-PICK-08 shows the banner and "Waiting for connection…" while paused with nothing loaded', async () => {
    onlineManager.setOnline(false);
    await update({ library: EMPTY, status: 'waiting' });
    await renderPicker();

    expect(screen.getByText(OFFLINE_BANNER)).toBeOnTheScreen();
    expect(screen.getByText('Waiting for connection…')).toBeOnTheScreen();
  });

  it('C-PICK-08 shows "No meals match" when nothing matches', async () => {
    await renderPicker();

    await fireEvent.changeText(search(), 'lasagna');

    expect(screen.getByRole('header', { name: 'No meals match' })).toBeOnTheScreen();
  });

  it('C-PICK-09 rows only choose: their hint says so, and nothing edits or deletes', async () => {
    const app = await renderPicker();

    expect(row(TACOS)).toHaveProp('accessibilityHint', 'Chooses this meal');
    expect(screen.queryByTestId('library-add-meal')).toBeNull();
    expect(screen.queryByRole('button', { name: /edit|delete/i })).toBeNull();
    expect(screen.getByTestId('library-list').props.refreshControl).toBeUndefined();
    await fireEvent.press(row(STEW));
    expect(app.getPathname()).toBe('/meals');
  });

  it('C-PICK-10 search and tags narrow the list, and a meal with no tags can be chosen', async () => {
    await update({
      library: buildLibrary(
        [...MEAL_ROWS, makeMealRow({ id: POPPERS, name: 'Jalapeño poppers' })],
        TAG_ROWS,
      ).library,
    });
    await renderPicker();

    await fireEvent.press(screen.getByTestId('library-filter'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dinner' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Quick & Easy' }));
    expect(rowIds()).toEqual([`meal-row-${TACOS}`]);
    await fireEvent.press(screen.getByTestId('library-clear-filters'));

    await fireEvent.changeText(search(), 'JALAPENO');
    expect(rowIds()).toEqual([`meal-row-${POPPERS}`]);
    await fireEvent.press(row(POPPERS));

    expect(mealPick.read()?.value.text).toBe('Jalapeño poppers');
  });
});
