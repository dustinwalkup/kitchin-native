import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useSyncExternalStore } from 'react';
import {
  type ActionSheetIOSOptions,
  ActionSheetIOS,
  Alert,
  type AlertButton,
  Text,
} from 'react-native';

import TabsLayout from '@/app/(app)/(tabs)/_layout';
import MealLibrary from '@/app/(app)/(tabs)/meal-library';
import AppLayout from '@/app/(app)/_layout';
import MealForm from '@/app/(app)/meal-form';
import { COPY } from '@/features/meal-library/constants';
import { buildLibrary, type Library } from '@/features/meal-library/domain';
import { lastSaved, newMealName, newMealType } from '@/features/meal-library/handoff';
import type {
  DeleteOutcome,
  LibraryView,
  SaveMealVariables,
  SaveOutcome,
} from '@/features/meal-library/hooks';
import { pickPhoto } from '@/features/meal-library/photo';
import { touchTarget } from '@/test/a11y';
import { makeMealRow, makeTagRow } from '@/test/factories';
import { stackPresentations } from '@/test/native-header';

// Meal Library screen tests C-LIB-04 to C-LIB-14 (4-test-plan §4.2) and the meal form's C-LFS-01 to
// C-LFS-13 (§4.4), as redesigned (specs/redesign/design.md §5.2, §5.3). C-LIB-01 to C-LIB-03, which
// start on Meals, are in meals.test.tsx, and the plan sheet that replaced the picker has its own
// tests. The real screens run under the real (app) and tabs layouts, so focus, the header, the tab
// bar and discard prevention behave as in the app. The hooks are mocked (§8.4): the library comes
// from the real buildLibrary, and the save and delete are spies that return the outcome a test
// chooses.

const COMFORT = 'tag-1';
const QUICK = 'tag-2';
const STEW = 'meal-1';
const TACOS = 'meal-2';
const TACOS_PHOTO = 'household-1/tacos.jpg';
const TACOS_URL = 'https://storage.test/tacos.jpg?token=1';
const NEW_PHOTO = 'household-1/new-photo.jpg';
const PICKED = 'file:///cache/ImageManipulator/picked.jpg';

const MEAL_ROWS = [
  makeMealRow({
    id: TACOS,
    name: 'Tacos',
    description: 'Beef, corn tortillas',
    meal_type: 'dinner',
    image_path: TACOS_PHOTO,
    library_meal_tags: [{ tag_id: COMFORT }, { tag_id: QUICK }],
  }),
  makeMealRow({ id: STEW, name: 'Beef stew', library_meal_tags: [{ tag_id: COMFORT }] }),
];
const TAG_ROWS = [
  makeTagRow({ id: COMFORT, name: 'Comfort food' }),
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
const mockDelete = jest.fn<Promise<DeleteOutcome>, [string, (string | null)?]>();
// The signed URLs the photos have, by key, and the key a new photo gets.
const mockImageUrls: Record<string, string> = {};
const mockNewImagePath = jest.fn<string | null, []>();

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
  useMealImageUrls: () => mockImageUrls,
  useNewImagePath: () => mockNewImagePath,
}));

// The camera and the photo library are native; a test chooses what the member picked.
jest.mock('@/features/meal-library/photo', () => ({ pickPhoto: jest.fn() }));

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
  useReconnectingIndicator: () => false,
  useRealtimeDegradedReport: () => {},
}));
jest.mock('@/lib/env', () => ({ env: { variant: 'production', sentryDsn: null } }));
// Debug builds log every report.
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

// Tabs these tests never open.
function UnusedStub() {
  return null;
}

const ROUTES = {
  '(app)/_layout': AppLayout,
  '(app)/(tabs)/_layout': TabsLayout,
  '(app)/(tabs)/groceries': UnusedStub,
  '(app)/(tabs)/meals': MealsStub,
  '(app)/(tabs)/meal-library': MealLibrary,
  '(app)/(tabs)/settings': UnusedStub,
  '(app)/meal-form': MealForm,
};

const OFFLINE_BANNER = "Offline — changes will send when you're back online";

let alert: jest.SpyInstance;
let actionSheet: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  newMealName.clear();
  newMealType.clear();
  lastSaved.clear();
  let uuid = 0;
  jest.mocked(randomUUID).mockImplementation(() => `new-${++uuid}`);
  mockSave.mockReset().mockImplementation(async ({ mealId }) => ({ ok: true, mealId }));
  mockDelete.mockReset().mockResolvedValue({ ok: true });
  for (const key of Object.keys(mockImageUrls)) delete mockImageUrls[key];
  mockImageUrls[TACOS_PHOTO] = TACOS_URL;
  mockNewImagePath.mockReset().mockReturnValue(NEW_PHOTO);
  jest.mocked(pickPhoto).mockResolvedValue({ kind: 'picked', uri: PICKED });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  actionSheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
  await update({ library: LIBRARY, status: 'ready', refreshFailedAt: null });
});

afterEach(() => {
  alert.mockRestore();
  actionSheet.mockRestore();
  onlineManager.setOnline(true);
  jest.useRealTimers();
});

/** Opens Meals, then the Library tab. */
async function renderLibrary() {
  const app = await renderRouter(ROUTES, { initialUrl: '/meals' });
  await fireEvent.press(tab('Library'));
  return app;
}

const tab = (name: 'Meals' | 'Library') =>
  screen.getByRole('button', { name: new RegExp(`^${name}, tab`) });

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

/** The options of the last action sheet. */
const sheetOptions = (): ActionSheetIOSOptions => actionSheet.mock.calls.at(-1)?.[0];
/** Picks an option of the last action sheet by its title, as the member's tap would. */
const pressSheet = (title: string) =>
  act(async () => {
    const [options, callback] = actionSheet.mock.calls.at(-1)!;
    callback((options as ActionSheetIOSOptions).options.indexOf(title));
  });
const photo = () => screen.getByTestId('meal-form-photo');
// expo-image's view, which only a photo with a URL draws.
const photoImages = () => photo().queryAll((node) => node.props.recyclingKey !== undefined);

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
    expect(row(TACOS)).toHaveProp(
      'accessibilityLabel',
      'Tacos, dinner. Tags: Comfort food, Quick & Easy',
    );
    expect(row(TACOS)).toHaveProp('accessibilityHint', 'Edits this meal');
  });

  it("§5.2 shows each meal's photo from its signed URL", async () => {
    await renderLibrary();

    const photos = row(TACOS).queryAll((node) => node.props.recyclingKey === TACOS_PHOTO);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveProp('source', [{ uri: TACOS_URL, cacheKey: TACOS_PHOTO }]);
  });

  it('C-LIB-01 is its own tab, titled "Meal Library"', async () => {
    const app = await renderLibrary();

    expect(app.getPathname()).toBe('/meal-library');
    expect(tab('Library')).toBeSelected();
    expect(screen.getByRole('heading', { name: 'Meal Library' })).toBeOnTheScreen();
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

  it('DD-R6 Add meal clears a meal type the plan sheet left, so the new meal starts with none', async () => {
    newMealType.set('dinner');
    await renderLibrary();

    await addMeal();

    expect(newMealType.read()).toBeNull();
    expect(screen.getByTestId('meal-form-type-dinner')).not.toBeSelected();
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

  it('C-LIB-09 opens with an empty search, every type and no tags, and keeps them after the form closes', async () => {
    await renderLibrary();
    expect(search()).toHaveDisplayValue('');
    expect(screen.getByLabelText('Filter by tags')).toBeOnTheScreen();
    expect(screen.getByTestId('type-chip-all')).toBeSelected();

    await fireEvent.changeText(search(), 'ta');
    await fireEvent.press(screen.getByRole('button', { name: 'Comfort food' }));
    await fireEvent.press(screen.getByTestId('type-chip-dinner'));
    await fireEvent.press(row(TACOS));
    await closeForm();

    expect(search()).toHaveDisplayValue('ta');
    expect(screen.getByLabelText('Filter by tags, 1 selected')).toBeOnTheScreen();
    expect(screen.getByTestId('type-chip-dinner')).toBeSelected();
    expect(screen.getAllByTestId(/^meal-row-/).map((r) => r.props.testID)).toEqual([
      `meal-row-${TACOS}`,
    ]);
  });

  it('C-LIB-14 keeps the search, type and tags while the member visits another tab', async () => {
    await renderLibrary();
    await fireEvent.changeText(search(), 'ta');
    await fireEvent.press(screen.getByRole('button', { name: 'Comfort food' }));
    await fireEvent.press(screen.getByTestId('type-chip-dinner'));

    await fireEvent.press(tab('Meals'));
    expect(screen.getByText('Meals screen')).toBeOnTheScreen();
    await fireEvent.press(tab('Library'));

    expect(search()).toHaveDisplayValue('ta');
    expect(screen.getByLabelText('Filter by tags, 1 selected')).toBeOnTheScreen();
    expect(screen.getByTestId('type-chip-dinner')).toBeSelected();
  });
});

describe('deleting from the list (C-LIB-11 to C-LIB-13)', () => {
  /** Presses a row's Delete, as if swiped open (jest-setup.ts draws it beside the row). */
  const swipeDelete = (id: string) =>
    fireEvent.press(screen.getByTestId(`meal-delete-${id}`, { includeHiddenElements: true }));

  it('C-LIB-11 every row has a chevron, and Delete behind a swipe that VoiceOver reaches as an action', async () => {
    await renderLibrary();

    expect(row(TACOS).children.at(-1)).toHaveProp('name', 'chevron.right');
    expect(row(TACOS).props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
    expect(screen.queryByTestId(`meal-delete-${TACOS}`)).toBeNull();
    expect(
      screen.getByTestId(`meal-delete-${TACOS}`, { includeHiddenElements: true }),
    ).toHaveTextContent('Delete');
  });

  it('C-LIB-12 Delete asks first, with the name and the plans message, and Cancel keeps the meal', async () => {
    await renderLibrary();

    await swipeDelete(TACOS);

    expect(alert).toHaveBeenCalledWith('Delete “Tacos”?', COPY.deleteBody, expect.any(Array));
    await pressAlert('Cancel');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(row(TACOS)).toBeOnTheScreen();
  });

  it('C-LIB-12 a confirmed delete deletes the meal and its photo, and shows "Meal deleted"', async () => {
    const app = await renderLibrary();

    await swipeDelete(TACOS);
    await pressAlert('Delete');

    expect(mockDelete.mock.calls).toEqual([[TACOS, TACOS_PHOTO]]);
    expect(within(toast()!).getByText('Meal deleted')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/meal-library');
  });

  it("C-LIB-12 VoiceOver's Delete action asks first too", async () => {
    await renderLibrary();

    await fireEvent(row(STEW), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

    expect(alert).toHaveBeenCalledWith('Delete “Beef stew”?', COPY.deleteBody, expect.any(Array));
    await pressAlert('Delete');
    // Beef stew has no photo.
    expect(mockDelete.mock.calls).toEqual([[STEW, null]]);
  });

  it("C-LIB-13 offline keeps the meal, and the toast's Retry deletes without asking again", async () => {
    mockDelete.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await renderLibrary();

    await swipeDelete(TACOS);
    await pressAlert('Delete');

    expect(row(TACOS)).toBeOnTheScreen();
    expect(within(toast()!).getByText(COPY.offline)).toBeOnTheScreen();
    alert.mockClear();
    await fireEvent.press(within(toast()!).getByRole('button', { name: 'Retry' }));

    expect(alert).not.toHaveBeenCalled();
    expect(mockDelete.mock.calls).toEqual([
      [TACOS, TACOS_PHOTO],
      [TACOS, TACOS_PHOTO],
    ]);
    expect(within(toast()!).getByText('Meal deleted')).toBeOnTheScreen();
  });

  it('C-LIB-13 any other failure says "Couldn\'t delete this meal", with Retry', async () => {
    mockDelete.mockResolvedValueOnce({ ok: false, reason: 'failed' });
    await renderLibrary();

    await swipeDelete(TACOS);
    await pressAlert('Delete');

    expect(within(toast()!).getByText(COPY.deleteError)).toBeOnTheScreen();
    expect(within(toast()!).getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
  });

  it('C-LIB-13 a forbidden delete says so, with no Retry', async () => {
    mockDelete.mockResolvedValueOnce({ ok: false, reason: 'forbidden' });
    await renderLibrary();

    await swipeDelete(TACOS);
    await pressAlert('Delete');

    expect(within(toast()!).getByText(COPY.forbidden)).toBeOnTheScreen();
    expect(within(toast()!).queryByRole('button', { name: 'Retry' })).toBeNull();
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

  it('lists a saved meal once, in its place, when the list already shows it (DD55)', async () => {
    await renderLibrary();
    await addMeal();

    await act(async () => lastSaved.set({ mealId: TACOS, kind: 'saved' }));
    await closeForm();

    expect(within(toast()!).getByText('Meal saved')).toBeOnTheScreen();
    expect(justSavedRow()).toBeNull();
    expect(screen.getAllByTestId(`meal-row-${TACOS}`)).toHaveLength(1);
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
    // The search hides Beef stew, so it shows as the Just saved row.
    await fireEvent.changeText(search(), 'taco');
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

    expect(screen.getByRole('header', { name: 'No meals yet' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Search meals')).toBeNull();
    await fireEvent.press(
      within(screen.getByTestId('library-empty')).getByRole('button', { name: 'Add meal' }),
    );

    expect(app.getPathname()).toBe('/meal-form');
  });

  it('shows "No matching meals" below the search when nothing matches', async () => {
    await renderLibrary();

    await fireEvent.changeText(search(), 'lasagna');

    expect(screen.getByRole('header', { name: 'No matching meals' })).toBeOnTheScreen();
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

    expect(screen.getByRole('header', { name: 'New meal' })).toBeOnTheScreen();
    expect(nameField()).toHaveDisplayValue('lasag');
    expect(descriptionField()).toHaveDisplayValue('');
    expect(photo()).toHaveProp('accessibilityLabel', COPY.addPhoto);
    for (const key of ['breakfast', 'lunch', 'dinner']) {
      expect(screen.getByTestId(`meal-form-type-${key}`)).not.toBeSelected();
    }
    expect(screen.queryByTestId('meal-form-delete')).toBeNull();
  });

  it('C-LFS-01 an edit is titled "Edit meal", with the meal, its type, photo and tags', async () => {
    newMealName.set('ignored');
    newMealType.set('lunch');
    await openMeal(TACOS);

    expect(screen.getByRole('header', { name: 'Edit meal' })).toBeOnTheScreen();
    expect(nameField()).toHaveDisplayValue('Tacos');
    expect(descriptionField()).toHaveDisplayValue('Beef, corn tortillas');
    expect(screen.getByTestId('meal-form-type-dinner')).toBeSelected();
    expect(screen.getByTestId('meal-form-type-lunch')).not.toBeSelected();
    expect(photo()).toHaveProp('accessibilityLabel', COPY.changePhoto);
    expect(photoImages()[0]).toHaveProp('source', [{ uri: TACOS_URL, cacheKey: TACOS_PHOTO }]);
    expect(screen.getByTestId(`tag-chip-${COMFORT}`)).toBeSelected();
    expect(screen.getByTestId(`tag-chip-${QUICK}`)).toBeSelected();
    expect(screen.getByTestId('meal-form-delete')).toBeOnTheScreen();
  });

  it("DD-R6 a new meal from a slot's plan sheet starts with the slot's type", async () => {
    newMealType.set('lunch');
    await renderLibrary();
    await act(() => router.push('/meal-form'));

    expect(screen.getByTestId('meal-form-type-lunch')).toBeSelected();
    await fireEvent.changeText(nameField(), 'Soup');
    await pressSave();

    expect(savedWith(0).meal).toEqual(expect.objectContaining({ name: 'Soup', mealType: 'lunch' }));
  });

  it('C-LFS-02 presents full screen, with Cancel and Save in its own header', async () => {
    await openNewMeal();

    expect(stackPresentations()).toEqual(['push', 'fullScreenModal']);
    expect(cancelButton()).toHaveProp('accessibilityLabel', 'Cancel');
    expect(saveButton()).toHaveProp('accessibilityLabel', 'Save');
    for (const button of [cancelButton(), saveButton()]) {
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
    await fireEvent.press(screen.getByTestId('meal-form-type-dinner'));
    await fireEvent.press(screen.getByTestId(`tag-chip-${COMFORT}`));

    await pressSave();

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(savedWith(0)).toEqual({
      base: null,
      mealId: 'new-1',
      meal: {
        name: 'Lasagna',
        description: 'Beef and ricotta',
        ingredients: null,
        mealType: 'dinner',
        imagePath: null,
        tags: [{ kind: 'existing', id: COMFORT }],
      },
      upload: null,
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
    // Once, in its place, since nothing hides it (DD55).
    expect(justSavedRow()).toBeNull();
    expect(screen.getAllByTestId(`meal-row-${TACOS}`)).toHaveLength(1);
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

  // The other phone's delete removed the stored photo too, so the new meal saves without it.
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
        mealType: 'dinner',
        imagePath: null,
        tags: [
          { kind: 'existing', id: COMFORT },
          { kind: 'existing', id: QUICK },
        ],
      },
      upload: null,
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
    // A tag or type removed and added again is no change (R42.12).
    await fireEvent.press(screen.getByTestId(`tag-chip-${COMFORT}`));
    await fireEvent.press(screen.getByTestId(`tag-chip-${COMFORT}`));
    await fireEvent.press(screen.getByTestId('meal-form-type-dinner'));
    await fireEvent.press(screen.getByTestId('meal-form-type-dinner'));

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

    // Its photo goes with it (design §6.5).
    expect(mockDelete).toHaveBeenCalledWith(TACOS, TACOS_PHOTO);
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
          makeTagRow({ id: COMFORT, name: 'Comfort food' }),
          makeTagRow({ id: QUICK, name: 'Quick & Easy' }),
        ],
      ).library,
    });

    expect(nameField()).toHaveDisplayValue('Tacos');
    expect(descriptionField()).toHaveDisplayValue('Pork, flour tortillas');
    expect(screen.getByTestId(`tag-chip-${COMFORT}`)).toBeSelected();
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

describe('the meal form photo (§5.3, §6.5)', () => {
  it('offers Take photo and Choose from library for a meal without one', async () => {
    await openNewMeal('Lasagna');

    await fireEvent.press(photo());

    expect(sheetOptions()).toEqual({
      options: [COPY.takePhoto, COPY.choosePhoto, 'Cancel'],
      cancelButtonIndex: 2,
      destructiveButtonIndex: undefined,
    });
  });

  it('offers Remove photo too, as the destructive choice, for a meal with one', async () => {
    await openMeal(TACOS);

    await fireEvent.press(photo());

    expect(sheetOptions()).toEqual({
      options: [COPY.takePhoto, COPY.choosePhoto, COPY.removePhoto, 'Cancel'],
      cancelButtonIndex: 3,
      destructiveButtonIndex: 2,
    });
  });

  it.each([
    [COPY.takePhoto, 'camera'],
    [COPY.choosePhoto, 'library'],
  ] as const)(
    '%s shows the picked photo, and Save uploads it with the meal',
    async (title, source) => {
      await openNewMeal('Lasagna');
      await fireEvent.press(photo());

      await pressSheet(title);

      expect(pickPhoto).toHaveBeenCalledWith(source);
      expect(photo()).toHaveProp('accessibilityLabel', COPY.changePhoto);
      expect(photoImages()[0]).toHaveProp('source', [{ uri: PICKED, cacheKey: NEW_PHOTO }]);

      await pressSave();

      expect(savedWith(0)).toEqual(
        expect.objectContaining({
          meal: expect.objectContaining({ imagePath: NEW_PHOTO }),
          upload: { uri: PICKED, path: NEW_PHOTO },
        }),
      );
    },
  );

  it('DD46 a retried save uploads the picked photo to the key it got when picked', async () => {
    mockSave.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await openNewMeal('Lasagna');
    await fireEvent.press(photo());
    await pressSheet(COPY.choosePhoto);

    await pressSave();
    await fireEvent.press(within(formError()!).getByRole('button', { name: 'Retry' }));

    expect(mockSave.mock.calls.map(([v]) => v.upload)).toEqual([
      { uri: PICKED, path: NEW_PHOTO },
      { uri: PICKED, path: NEW_PHOTO },
    ]);
    expect(mockNewImagePath).toHaveBeenCalledTimes(1);
  });

  it('replacing a stored photo saves the new key; the hook removes the old one', async () => {
    await openMeal(TACOS);
    await fireEvent.press(photo());
    await pressSheet(COPY.takePhoto);

    await pressSave();

    expect(savedWith(0)).toEqual(
      expect.objectContaining({
        base: expect.objectContaining({ imagePath: TACOS_PHOTO }),
        meal: expect.objectContaining({ imagePath: NEW_PHOTO }),
        upload: { uri: PICKED, path: NEW_PHOTO },
      }),
    );
  });

  it('Remove photo takes it off the meal, which Save sends', async () => {
    await openMeal(TACOS);
    await fireEvent.press(photo());

    await pressSheet(COPY.removePhoto);

    expect(photo()).toHaveProp('accessibilityLabel', COPY.addPhoto);
    expect(photoImages()).toEqual([]);
    expect(pickPhoto).not.toHaveBeenCalled();
    await pressSave();
    expect(savedWith(0)).toEqual(
      expect.objectContaining({
        meal: expect.objectContaining({ imagePath: null }),
        upload: null,
      }),
    );
  });

  it('a new photo is a change, so Cancel asks first', async () => {
    const app = await openMeal(TACOS);
    await fireEvent.press(photo());
    await pressSheet(COPY.choosePhoto);

    await fireEvent.press(cancelButton());

    expect(alert).toHaveBeenCalledWith(COPY.discardTitle, undefined, expect.any(Array));
    expect(app.getPathname()).toBe('/meal-form');
  });

  it('Cancel in the sheet, or a cancelled picker, changes nothing', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ kind: 'cancelled' });
    const app = await openMeal(TACOS);
    await fireEvent.press(photo());
    await pressSheet('Cancel');
    await fireEvent.press(photo());
    await pressSheet(COPY.takePhoto);

    expect(pickPhoto).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    expect(photoImages()[0]).toHaveProp('source', [{ uri: TACOS_URL, cacheKey: TACOS_PHOTO }]);
    await fireEvent.press(cancelButton());
    expect(app.getPathname()).toBe('/meal-library');
  });

  it.each([
    ['denied', COPY.photoPermission],
    ['failed', COPY.photoError],
  ] as const)('a %s photo says why, and keeps the photo the form had', async (kind, message) => {
    jest.mocked(pickPhoto).mockResolvedValue({ kind });
    await openNewMeal('Lasagna');
    await fireEvent.press(photo());

    await pressSheet(COPY.takePhoto);

    expect(alert).toHaveBeenCalledWith(message);
    expect(photo()).toHaveProp('accessibilityLabel', COPY.addPhoto);
    expect(mockNewImagePath).not.toHaveBeenCalled();
  });

  it('adds no photo when the household has no folder for it yet', async () => {
    mockNewImagePath.mockReturnValue(null);
    await openNewMeal('Lasagna');
    await fireEvent.press(photo());

    await pressSheet(COPY.choosePhoto);

    expect(photo()).toHaveProp('accessibilityLabel', COPY.addPhoto);
    await pressSave();
    expect(savedWith(0).upload).toBeNull();
  });

  it('shows the placeholder until a stored photo has a signed URL', async () => {
    delete mockImageUrls[TACOS_PHOTO];
    await openMeal(TACOS);

    expect(photo()).toHaveProp('accessibilityLabel', COPY.changePhoto);
    expect(photoImages()).toEqual([]);
  });
});
