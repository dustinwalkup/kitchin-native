import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Alert, type AlertButton, Text } from 'react-native';

import TabsLayout from '@/app/(app)/(tabs)/_layout';
import AppLayout from '@/app/(app)/_layout';
import MealForm from '@/app/(app)/meal-form';
import MealPicker from '@/app/(app)/meal-picker';
import { buildLibrary, type Library } from '@/features/meal-library/domain';
import { lastSaved, newMealName, newMealType } from '@/features/meal-library/handoff';
import type {
  DeleteOutcome,
  LibraryView,
  SaveMealVariables,
  SaveOutcome,
} from '@/features/meal-library/hooks';
import { buildWeek, type MealEntry } from '@/features/meals/domain';
import type { MealWeek, SetMealVariables } from '@/features/meals/hooks';
import type { IsoDate, Weekday } from '@/lib/calendar';
import { reportOnce } from '@/lib/reporting';
import { touchTarget } from '@/test/a11y';
import { makeMealEntry, makeMealRow, makeTagRow } from '@/test/factories';
import { stackPresentations } from '@/test/native-header';
import { themes } from '@/ui/theme';

// The plan sheet (specs/redesign/design.md §5.4), which replaced the inline slot editor and the
// picker of meal-library §3.10, so it carries the picker's C-PICK tests that still apply. The real
// sheet and meal form run under the real (app) and tabs layouts, over a stub Meals, so the sheet's
// presentation, focus and discard prevention behave as in the app. The hooks are mocked (§8.4): the
// week comes from the real buildWeek, the library from the real buildLibrary, and saves are spies.
// 2026-10-22 is a Thursday, in the Monday week of 2026-10-19 and the Sunday week of 2026-10-18.

const THURSDAY = '2026-10-22';
const FAVOURITE = 'tag-1';
const QUICK = 'tag-2';
const STEW = 'meal-1';
const TACOS = 'meal-2';
const POPPERS = 'meal-3';
const TACOS_PHOTO = 'household-1/tacos.jpg';
const TACOS_URL = 'https://storage.test/tacos.jpg?token=1';
const TACOS_TEXT = 'Tacos\nBeef, corn tortillas';

const MEAL_ROWS = [
  makeMealRow({
    id: TACOS,
    name: 'Tacos',
    description: 'Beef, corn tortillas',
    meal_type: 'dinner',
    image_path: TACOS_PHOTO,
    library_meal_tags: [{ tag_id: QUICK }],
  }),
  makeMealRow({ id: STEW, name: 'Beef stew', library_meal_tags: [{ tag_id: FAVOURITE }] }),
  makeMealRow({ id: POPPERS, name: 'Jalapeño poppers', meal_type: 'lunch' }),
];
const TAG_ROWS = [
  makeTagRow({ id: FAVOURITE, name: 'Family Favorite' }),
  makeTagRow({ id: QUICK, name: 'Quick & Easy' }),
];
const LIBRARY = buildLibrary(MEAL_ROWS, TAG_ROWS).library;
const EMPTY: Library = { meals: [], tags: [], tagsById: new Map() };

/** What the mocked hooks return. Changing it re-renders the screens, as the real hooks would. */
const mockState = {
  weekStart: 0 as Weekday,
  entries: [] as MealEntry[],
  weekStatus: 'ready' as MealWeek['status'],
  library: LIBRARY,
  status: 'ready' as LibraryView['status'],
  refreshFailedAt: null as number | null,
  recentIds: [] as string[],
  imageUrls: { [TACOS_PHOTO]: TACOS_URL } as Record<string, string>,
  version: 0,
  listeners: new Set<() => void>(),
};

/** Changes what the hooks return, from inside a handler that's already in `act`. */
function setMockState(changes: Partial<typeof mockState>) {
  Object.assign(mockState, changes);
  mockState.version += 1;
  mockState.listeners.forEach((listener) => listener());
}

const update = (changes: Partial<typeof mockState>) => act(async () => setMockState(changes));

const mockRefetch = jest.fn(async () => {});
const mockSetMeal = jest.fn<void, [SetMealVariables]>();
const mockSave = jest.fn<Promise<SaveOutcome>, [SaveMealVariables]>();
const mockDelete = jest.fn<Promise<DeleteOutcome>, [string]>();
/** Each week start the sheet asked `useMealWeek` for, and the start day it gave `useSetMeal`. */
let mockWeekStarts: IsoDate[] = [];
let mockSetMealStart: Weekday | null = null;

// jest.mock factories may only use names that start with "mock", and hooks must start with "use",
// so the stand-ins are methods of one object.
const mockHooks = {
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
    const { weekStatus, entries } = mockHooks.useMockState();
    mockWeekStarts.push(weekStart);
    return {
      days: weekStatus === 'ready' ? buildWeek(weekStart, entries) : [],
      status: weekStatus,
      refetch: mockRefetch,
      refreshFailedAt: null,
    };
  },

  useSetMeal(start: Weekday) {
    mockSetMealStart = start;
    return mockSetMeal;
  },

  useLibrary(): LibraryView {
    const { library, status, refreshFailedAt } = mockHooks.useMockState();
    return { library, status, refetch: mockRefetch, refreshFailedAt };
  },

  useMealImageUrls(paths: (string | null)[]) {
    const { imageUrls } = mockHooks.useMockState();
    return Object.fromEntries(
      paths.flatMap((path) => (path !== null && imageUrls[path] ? [[path, imageUrls[path]]] : [])),
    );
  },
};

jest.mock('@/features/meals/hooks', () => ({
  useMealWeek: (weekStart: IsoDate) => mockHooks.useMealWeek(weekStart),
  useSetMeal: (start: Weekday) => mockHooks.useSetMeal(start),
  useRecentLibraryMealIds: () => mockHooks.useMockState().recentIds,
}));
jest.mock('@/features/meal-library/hooks', () => ({
  useLibrary: () => mockHooks.useLibrary(),
  useMealImageUrls: (paths: (string | null)[]) => mockHooks.useMealImageUrls(paths),
  useSaveMeal: () => mockSave,
  useDeleteMeal: () => mockDelete,
  useNewImagePath: () => () => null,
}));
jest.mock('@/features/household/use-week-start', () => ({
  useWeekStart: () => mockHooks.useMockState().weekStart,
}));

// A new meal's ID, in a sequence a test can name (§8.4).
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

// The (app) layout's channel, table handlers and variant, which these tests don't use.
jest.mock('@/features/groceries/realtime', () => ({ groceryTableHandlers: {} }));
jest.mock('@/features/meals/realtime', () => ({ mealTableHandlers: {} }));
jest.mock('@/features/meal-library/realtime', () => ({ libraryTableHandlers: {} }));
jest.mock('@/features/household/realtime', () => ({ householdTableHandlers: {} }));
jest.mock('@/features/household/use-household-realtime', () => ({
  useHouseholdRealtime: () => {},
}));
jest.mock('@/features/household/use-connection-state', () => ({
  useReconnectingIndicator: () => false,
  useRealtimeDegradedReport: () => {},
}));
jest.mock('@/lib/env', () => ({ env: { variant: 'production', sentryDsn: null } }));
// The sheet reports bad params (§6). Debug builds log every report; only that one is asserted.
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

// Routes these tests never open.
function UnusedStub() {
  return null;
}

const ROUTES = {
  '(app)/_layout': AppLayout,
  '(app)/(tabs)/_layout': TabsLayout,
  '(app)/(tabs)/groceries': UnusedStub,
  '(app)/(tabs)/meals': MealsStub,
  '(app)/(tabs)/meal-library': UnusedStub,
  '(app)/(tabs)/settings': UnusedStub,
  '(app)/meal-form': MealForm,
  '(app)/meal-picker': MealPicker,
};

const OFFLINE_BANNER = "Offline — changes will send when you're back online";
const theme = themes.light;

let alert: jest.SpyInstance;
let announce: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  newMealName.clear();
  newMealType.clear();
  lastSaved.clear();
  mockWeekStarts = [];
  mockSetMealStart = null;
  let uuid = 0;
  jest.mocked(randomUUID).mockImplementation(() => `new-${++uuid}`);
  mockSave.mockReset().mockImplementation(async ({ mealId }) => ({ ok: true, mealId }));
  mockDelete.mockReset().mockResolvedValue({ ok: true });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  await update({
    weekStart: 0,
    entries: [],
    weekStatus: 'ready',
    library: LIBRARY,
    status: 'ready',
    refreshFailedAt: null,
    recentIds: [],
    imageUrls: { [TACOS_PHOTO]: TACOS_URL },
  });
});

afterEach(() => {
  alert.mockRestore();
  announce.mockRestore();
  onlineManager.setOnline(true);
  jest.useRealTimers();
});

/** Opens the sheet over Meals, as tapping a slot does: for Thursday dinner unless a test says. */
async function renderSheet(
  params: Record<string, string> = { date: THURSDAY, mealType: 'dinner' },
) {
  const app = await renderRouter(ROUTES, { initialUrl: '/meals' });
  await act(() => router.push({ pathname: '/meal-picker', params }));
  return app;
}

/** A slot's entry: typed text unless it names the library meal it was chosen from. */
const planned = (body: string, libraryMealId: string | null = null) =>
  makeMealEntry({ id: 'entry-1', date: THURSDAY, mealType: 'dinner', body, libraryMealId });

const title = () => screen.getByRole('header', { name: /·/ });
const tab = (key: 'library' | 'write') => screen.getByTestId(`plan-mode-${key}`);
const selectedTab = () =>
  (['library', 'write'] as const).find((key) => tab(key).props.accessibilityState?.selected);
const current = () => screen.queryByTestId('plan-current');
const editor = () => screen.getByTestId('slot-editor');
const typeIn = (text: string) => fireEvent.changeText(editor(), text);
const saveButton = () => screen.getByTestId('plan-save');
const search = () => screen.getByLabelText('Search meals');
const row = (id: string) => screen.getByTestId(`meal-row-${id}`);
const rowIds = () => screen.getAllByTestId(/^meal-row-/).map((r) => r.props.testID);
const recentIds = () => screen.queryAllByTestId(/^recent-meal-/).map((r) => r.props.testID);
const toast = () => screen.queryByTestId('toast');
const justSavedRow = () => screen.queryByTestId('library-just-saved');
const nameField = () => screen.getByTestId('meal-form-name');

interface HostNode {
  props: Record<string, unknown>;
  children: (HostNode | string)[];
}

/** The `source` of every image drawn inside `node`. Jest draws no image, so it can't be seen. */
function imageSources(node: HostNode): unknown[] {
  const own = 'source' in node.props ? [node.props.source] : [];
  return [
    ...own,
    ...node.children.flatMap((child) => (typeof child === 'string' ? [] : imageSources(child))),
  ];
}

/** The buttons of the last native alert. */
const alertButtons = (): AlertButton[] => alert.mock.calls.at(-1)?.[2] ?? [];
const pressAlert = (text: string) =>
  act(async () =>
    alertButtons()
      .find((button) => button.text === text)
      ?.onPress?.(),
  );

describe('plan sheet', () => {
  it('C-PICK-01 presents as a page sheet titled "Thu, Oct 22 · Dinner", with Cancel', async () => {
    const app = await renderSheet();

    expect(app.getPathname()).toBe('/meal-picker');
    expect(stackPresentations()).toEqual(['push', 'modal']);
    expect(title()).toHaveTextContent('Thu, Oct 22 · Dinner');
    const cancel = screen.getByTestId('picker-cancel');
    expect(cancel).toHaveProp('accessibilityLabel', 'Cancel');
    expect(touchTarget(cancel).width).toBeGreaterThanOrEqual(44);
    expect(touchTarget(cancel).height).toBeGreaterThanOrEqual(44);
  });

  it('names the slot from its own params, such as Saturday breakfast', async () => {
    await renderSheet({ date: '2026-10-24', mealType: 'breakfast' });

    expect(title()).toHaveTextContent('Sat, Oct 24 · Breakfast');
  });

  it.each([
    { date: '2026-02-30', mealType: 'dinner' },
    { date: THURSDAY, mealType: 'snack' },
    { date: 'Thursday', mealType: 'dinner' },
    { mealType: 'dinner' },
    { date: THURSDAY },
  ] as Record<string, string>[])(
    'C-PICK-02 closes on bad params %j, and reports it once',
    async (params) => {
      const app = await renderSheet(params);

      expect(app.getPathname()).toBe('/meals');
      expect(reportOnce).toHaveBeenCalledTimes(1);
      expect(reportOnce).toHaveBeenCalledWith('picker_bad_params');
      expect(mockSetMeal).not.toHaveBeenCalled();
    },
  );

  it('C-PICK-05 Cancel goes back without saving', async () => {
    const app = await renderSheet();

    await fireEvent.press(screen.getByTestId('picker-cancel'));

    expect(app.getPathname()).toBe('/meals');
    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it("reads the slot's week, laid out from the household's start day (R48.4)", async () => {
    await update({ weekStart: 6 });
    await renderSheet();

    expect(new Set(mockWeekStarts)).toEqual(new Set(['2026-10-18']));
    expect(mockSetMealStart).toBe(6);
  });

  it('R26.7 uses only static test IDs, none with meal text', async () => {
    await update({ entries: [planned(TACOS_TEXT, TACOS)], recentIds: [TACOS] });
    await renderSheet();

    const ids = screen
      .getAllByTestId(/./, { includeHiddenElements: true })
      .map((e) => e.props.testID as string);
    expect(ids).toEqual(expect.arrayContaining(['plan-current', 'plan-mode-library']));
    expect(ids.filter((id) => /Tacos|Beef|stew|Jalape/i.test(id))).toEqual([]);
  });
});

describe('what the slot holds', () => {
  it('shows nothing planned for an empty slot, and opens on the library', async () => {
    await renderSheet();

    expect(current()).toBeNull();
    expect(selectedTab()).toBe('library');
    expect(tab('library')).toHaveProp('accessibilityLabel', 'Choose from library');
    expect(tab('write')).toHaveProp('accessibilityLabel', 'Enter manually');
    expect(screen.queryByTestId('plan-save')).toBeNull();
    expect(rowIds()).toHaveLength(3);
  });

  it('shows typed text as planned, its first line then the rest, and opens on Enter manually', async () => {
    await update({ entries: [planned('Leftovers\nFrom Sunday')] });
    await renderSheet();

    const card = within(current()!);
    expect(card.getByText('Planned')).toBeOnTheScreen();
    expect(card.getByText('Leftovers')).toBeOnTheScreen();
    expect(card.getByText('From Sunday')).toHaveStyle({ color: theme.inkMuted });
    expect(card.getByTestId('meal-type-icon', { includeHiddenElements: true })).toBeTruthy();
    expect(card.getByTestId('slot-clear')).toHaveProp('accessibilityLabel', 'Remove from plan');
    // Typed text has no library meal to edit.
    expect(screen.queryByTestId('plan-edit-meal')).toBeNull();
    expect(selectedTab()).toBe('write');
    expect(editor()).toHaveDisplayValue('Leftovers\nFrom Sunday');
    expect(editor()).toHaveProp('autoFocus', true);
  });

  it('shows a library meal with its photo and Edit library meal, and opens on the library (DD-R10)', async () => {
    await update({ entries: [planned(TACOS_TEXT, TACOS)] });
    await renderSheet();

    const card = within(current()!);
    expect(card.getByText('Tacos')).toBeOnTheScreen();
    expect(card.getByText('Beef, corn tortillas')).toBeOnTheScreen();
    expect(card.getByTestId('plan-edit-meal').props.accessibilityLabel).toBe('Edit library meal');
    // The photo, by its signed URL, cached under its Storage key.
    expect(imageSources(current()!)).toEqual([[{ uri: TACOS_URL, cacheKey: TACOS_PHOTO }]]);
    expect(selectedTab()).toBe('library');
  });

  it('shows the planned copy of a meal deleted since, with no Edit library meal (K19)', async () => {
    await update({ entries: [planned('Lasagne', 'meal-gone')] });
    await renderSheet();

    const card = within(current()!);
    expect(card.getByText('Lasagne')).toBeOnTheScreen();
    expect(card.getByTestId('meal-type-icon', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('plan-edit-meal')).toBeNull();
    expect(selectedTab()).toBe('library');
  });

  it('R33.2 Remove from plan clears the slot, announces it and closes', async () => {
    await update({ entries: [planned(TACOS_TEXT, TACOS)] });
    const app = await renderSheet();

    await fireEvent.press(screen.getByTestId('slot-clear'));

    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'dinner', body: null }]]);
    expect(announce).toHaveBeenCalledWith('Thursday dinner cleared');
    expect(app.getPathname()).toBe('/meals');
  });

  it('Remove from plan closes without asking, even with unsaved typed text', async () => {
    await update({ entries: [planned('Leftovers')] });
    const app = await renderSheet();
    await typeIn('Leftover chili');

    await fireEvent.press(screen.getByTestId('slot-clear'));

    expect(alert).not.toHaveBeenCalled();
    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'dinner', body: null }]]);
    expect(app.getPathname()).toBe('/meals');
  });

  it('Edit library meal opens the meal in the form, with only its ID as a param', async () => {
    await update({ entries: [planned(TACOS_TEXT, TACOS)] });
    const app = await renderSheet();

    await fireEvent.press(screen.getByTestId('plan-edit-meal'));

    expect(app.getPathname()).toBe('/meal-form');
    expect(app.getSearchParams()).toEqual({ id: TACOS });
    expect(nameField()).toHaveDisplayValue('Tacos');
  });

  it('after editing the library meal, says "Meal saved" and leaves the plan\'s text alone (K19)', async () => {
    await update({ entries: [planned(TACOS_TEXT, TACOS)] });
    const app = await renderSheet();
    await fireEvent.press(screen.getByTestId('plan-edit-meal'));
    await fireEvent.changeText(nameField(), 'Fish tacos');

    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ mealId: TACOS }));
    expect(app.getPathname()).toBe('/meal-picker');
    expect(within(toast()!).getByText('Meal saved')).toBeOnTheScreen();
    expect(toast()).toHaveStyle({ top: 8 });
    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(lastSaved.read()).toBeNull();
  });

  it('after deleting the library meal from the form, says "Meal deleted" and keeps the plan', async () => {
    await update({ entries: [planned(TACOS_TEXT, TACOS)] });
    const app = await renderSheet();
    await fireEvent.press(screen.getByTestId('plan-edit-meal'));
    await fireEvent.press(screen.getByTestId('meal-form-delete'));
    await pressAlert('Delete');

    expect(mockDelete).toHaveBeenCalledWith(TACOS, TACOS_PHOTO);
    expect(app.getPathname()).toBe('/meal-picker');
    expect(within(toast()!).getByText('Meal deleted')).toBeOnTheScreen();
    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(within(current()!).getByText('Tacos')).toBeOnTheScreen();
  });

  it('DD27 keeps the slot as it opened when the other phone changes it', async () => {
    await update({ entries: [planned('Leftovers')] });
    await renderSheet();

    await update({ entries: [planned('Pizza')] });

    expect(within(current()!).getByText('Leftovers')).toBeOnTheScreen();
    expect(editor()).toHaveDisplayValue('Leftovers');
    expect(saveButton()).toBeDisabled();
  });

  it('opens on the slot once the week has loaded, when opened before it', async () => {
    await update({ weekStatus: 'loading', entries: [planned('Leftovers')] });
    await renderSheet();
    expect(current()).toBeNull();
    expect(selectedTab()).toBe('library');

    await update({ weekStatus: 'ready' });

    expect(within(current()!).getByText('Leftovers')).toBeOnTheScreen();
    expect(selectedTab()).toBe('write');
    expect(editor()).toHaveDisplayValue('Leftovers');
  });
});

describe('choosing from the library', () => {
  it('C-PICK-03 shows a cached library at once, every meal, with an empty search', async () => {
    await renderSheet();

    expect(screen.queryByTestId('library-skeleton')).toBeNull();
    expect(rowIds()).toEqual([`meal-row-${STEW}`, `meal-row-${POPPERS}`, `meal-row-${TACOS}`]);
    expect(search()).toHaveDisplayValue('');
    // Every type: a filter never hides a meal from a slot it wasn't saved for (DD-R6).
    expect(screen.getByTestId('type-chip-all')).toBeSelected();
  });

  it('C-PICK-04 tapping a meal saves its name and description, with its link, and closes', async () => {
    const app = await renderSheet();

    await fireEvent.press(row(TACOS));

    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: THURSDAY, mealType: 'dinner', body: TACOS_TEXT, libraryMealId: TACOS }],
    ]);
    expect(announce).toHaveBeenCalledWith('Thursday dinner: Tacos');
    expect(app.getPathname()).toBe('/meals');
  });

  it('C-PICK-04 choosing the meal already planned sends no write, and closes', async () => {
    await update({ entries: [planned(TACOS_TEXT, TACOS)] });
    const app = await renderSheet();

    await fireEvent.press(row(TACOS));

    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/meals');
  });

  it('C-PICK-04 choosing a meal whose text the slot already has still saves the link', async () => {
    await update({ entries: [planned('Beef stew')] });
    await renderSheet();
    await fireEvent.press(tab('library'));

    await fireEvent.press(row(STEW));

    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: THURSDAY, mealType: 'dinner', body: 'Beef stew', libraryMealId: STEW }],
    ]);
  });

  it('C-PICK-04 choosing another meal for a slot with typed text replaces it, unasked', async () => {
    await update({ entries: [planned('Leftovers')] });
    const app = await renderSheet();
    await typeIn('Leftover chili');
    await fireEvent.press(tab('library'));

    await fireEvent.press(row(STEW));

    expect(alert).not.toHaveBeenCalled();
    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: THURSDAY, mealType: 'dinner', body: 'Beef stew', libraryMealId: STEW }],
    ]);
    expect(app.getPathname()).toBe('/meals');
  });

  it('shows Recently used, newest first, skipping meals deleted since, and a card chooses (DD-R10)', async () => {
    await update({ recentIds: [TACOS, 'meal-gone', STEW, TACOS] });
    const app = await renderSheet();

    expect(screen.getByText('Recently used')).toBeOnTheScreen();
    expect(recentIds()).toEqual([`recent-meal-${TACOS}`, `recent-meal-${STEW}`]);
    expect(screen.getByTestId(`recent-meal-${TACOS}`)).toHaveProp(
      'accessibilityHint',
      'Chooses this meal',
    );

    await fireEvent.press(screen.getByTestId(`recent-meal-${STEW}`));

    expect(mockSetMeal).toHaveBeenCalledWith({
      date: THURSDAY,
      mealType: 'dinner',
      body: 'Beef stew',
      libraryMealId: STEW,
    });
    expect(app.getPathname()).toBe('/meals');
  });

  it('hides Recently used while searching, and has none before anything is planned', async () => {
    await renderSheet();
    expect(screen.queryByTestId('recent-meals')).toBeNull();

    await update({ recentIds: [TACOS] });
    expect(recentIds()).toEqual([`recent-meal-${TACOS}`]);
    await fireEvent.changeText(search(), 'stew');

    expect(screen.queryByTestId('recent-meals')).toBeNull();
    expect(rowIds()).toEqual([`meal-row-${STEW}`]);
  });

  it('C-PICK-06 "Create a new meal" starts the form from the search and the slot’s type', async () => {
    const app = await renderSheet();
    await fireEvent.changeText(search(), 'lasag');

    await fireEvent.press(screen.getByTestId('picker-new-meal'));

    expect(newMealName.read()?.value).toBe('lasag');
    expect(newMealType.read()?.value).toBe('dinner');
    expect(app.getPathname()).toBe('/meal-form');
    expect(app.getSearchParams()).toEqual({});
    expect(nameField()).toHaveDisplayValue('lasag');
    expect(screen.getByTestId('meal-form-type-dinner')).toBeSelected();
  });

  it('C-PICK-06 "Create a new meal" with an empty search clears the name hand-off', async () => {
    newMealName.set('left over');
    await renderSheet({ date: THURSDAY, mealType: 'lunch' });

    await fireEvent.press(screen.getByTestId('picker-new-meal'));

    expect(newMealName.read()).toBeNull();
    expect(newMealType.read()?.value).toBe('lunch');
  });

  it('C-PICK-07 a meal created from the sheet is chosen for the slot once the form saves it', async () => {
    // As the real hook does, the saved meal is in the library before the save resolves.
    mockSave.mockImplementationOnce(async ({ mealId, meal }) => {
      setMockState({
        library: buildLibrary(
          [...MEAL_ROWS, makeMealRow({ id: mealId, name: meal.name, description: 'With ricotta' })],
          TAG_ROWS,
        ).library,
      });
      return { ok: true, mealId };
    });
    const app = await renderSheet();
    await fireEvent.press(screen.getByTestId('picker-new-meal'));
    await fireEvent.changeText(nameField(), 'Lasagne');

    await fireEvent.press(screen.getByTestId('meal-form-save'));

    expect(mockSetMeal.mock.calls).toEqual([
      [
        {
          date: THURSDAY,
          mealType: 'dinner',
          body: 'Lasagne\nWith ricotta',
          libraryMealId: 'new-1',
        },
      ],
    ]);
    expect(announce).toHaveBeenCalledWith('Thursday dinner: Lasagne');
    expect(app.getPathname()).toBe('/meals');
    expect(lastSaved.read()).toBeNull();
  });

  it('C-PICK-07 offers a new meal not yet in the library as the Just saved row, which chooses it', async () => {
    const app = await renderSheet();
    await fireEvent.changeText(search(), 'stew');
    await fireEvent.press(screen.getByTestId('picker-new-meal'));
    await fireEvent.changeText(nameField(), 'Lasagne');

    await fireEvent.press(screen.getByTestId('meal-form-save'));

    // The library hasn't caught up, so the sheet can't choose it yet.
    expect(app.getPathname()).toBe('/meal-picker');
    expect(mockSetMeal).not.toHaveBeenCalled();
    expect(within(toast()!).getByText('Meal saved')).toBeOnTheScreen();
    expect(justSavedRow()).toBeNull();

    await update({
      library: buildLibrary([...MEAL_ROWS, makeMealRow({ id: 'new-1', name: 'Lasagne' })], TAG_ROWS)
        .library,
    });

    // Above the search's results, which don't include it (DD55).
    expect(search()).toHaveDisplayValue('stew');
    expect(within(justSavedRow()!).getByTestId('meal-row-new-1')).toBeOnTheScreen();
    await fireEvent.press(within(justSavedRow()!).getByTestId('meal-row-new-1'));

    expect(mockSetMeal).toHaveBeenCalledWith({
      date: THURSDAY,
      mealType: 'dinner',
      body: 'Lasagne',
      libraryMealId: 'new-1',
    });
    expect(app.getPathname()).toBe('/meals');
  });

  it('C-PICK-07 cancelling the form returns to the sheet as it was', async () => {
    const app = await renderSheet();
    await fireEvent.changeText(search(), 'ta');

    await fireEvent.press(screen.getByTestId('picker-new-meal'));
    await fireEvent.press(screen.getByTestId('meal-form-cancel'));

    expect(app.getPathname()).toBe('/meal-picker');
    expect(search()).toHaveDisplayValue('ta');
    expect(toast()).toBeNull();
    expect(justSavedRow()).toBeNull();
    expect(mockSetMeal).not.toHaveBeenCalled();
  });

  it('C-PICK-09 rows only choose: their hint says so, and nothing edits or deletes', async () => {
    await renderSheet();

    expect(row(TACOS)).toHaveProp('accessibilityHint', 'Chooses this meal');
    expect(screen.queryByTestId('library-add-meal')).toBeNull();
    expect(screen.queryAllByTestId(/^meal-delete-/, { includeHiddenElements: true })).toHaveLength(
      0,
    );
    expect(row(TACOS).props.accessibilityActions).toBeUndefined();
    expect(row(TACOS).children.at(-1)).not.toHaveProp('name', 'chevron.right');
    expect(screen.getByTestId('library-list').props.refreshControl).toBeUndefined();
  });

  it('C-PICK-10 the search, type and tags narrow the list, and a meal of another type can be chosen', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByTestId('type-chip-lunch'));
    expect(rowIds()).toEqual([`meal-row-${POPPERS}`]);
    await fireEvent.press(screen.getByTestId('type-chip-all'));
    await fireEvent.press(screen.getByRole('button', { name: /^Quick & Easy/ }));
    expect(rowIds()).toEqual([`meal-row-${TACOS}`]);
    await fireEvent.press(screen.getByTestId('library-clear-filters'));

    await fireEvent.changeText(search(), 'JALAPENO');
    expect(rowIds()).toEqual([`meal-row-${POPPERS}`]);
    await fireEvent.press(row(POPPERS));

    expect(mockSetMeal).toHaveBeenCalledWith({
      date: THURSDAY,
      mealType: 'dinner',
      body: 'Jalapeño poppers',
      libraryMealId: POPPERS,
    });
  });
});

describe('library states (C-PICK-08)', () => {
  it('opens an empty slot on Enter manually when the library is empty', async () => {
    await update({ library: EMPTY });
    await renderSheet();

    expect(selectedTab()).toBe('write');
    expect(editor()).toHaveDisplayValue('');
  });

  it('the empty library says so, and its New meal opens the form', async () => {
    await update({ library: EMPTY });
    const app = await renderSheet();
    await fireEvent.press(tab('library'));

    expect(screen.getByRole('header', { name: 'No meals yet' })).toBeOnTheScreen();
    // The empty state's own action, so New meal shows once.
    expect(screen.queryByTestId('picker-new-meal')).toBeNull();
    await fireEvent.press(
      within(screen.getByTestId('library-empty')).getByRole('button', { name: 'New meal' }),
    );

    expect(app.getPathname()).toBe('/meal-form');
    expect(newMealType.read()?.value).toBe('dinner');
  });

  it('keeps what is planned and the mode switch above the empty library', async () => {
    await update({ library: EMPTY, entries: [planned('Leftovers')] });
    const app = await renderSheet();
    await fireEvent.press(tab('library'));

    expect(screen.getByTestId('library-empty')).toBeOnTheScreen();
    expect(within(current()!).getByText('Leftovers')).toBeOnTheScreen();
    expect(screen.getByTestId('slot-clear')).toBeOnTheScreen();
    // Enter manually is still reachable, with the slot's text.
    await fireEvent.press(tab('write'));
    expect(selectedTab()).toBe('write');
    expect(editor()).toHaveDisplayValue('Leftovers');

    await fireEvent.press(tab('library'));
    await fireEvent.press(screen.getByTestId('slot-clear'));

    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'dinner', body: null }]]);
    expect(app.getPathname()).toBe('/meals');
  });

  it('shows skeleton rows on the first load, and Cancel still closes', async () => {
    await update({ library: EMPTY, status: 'loading' });
    const app = await renderSheet();

    expect(selectedTab()).toBe('library');
    expect(screen.getByTestId('library-skeleton')).toBeOnTheScreen();
    // The mode switch shows in every state, so the member can type a meal meanwhile.
    expect(tab('write')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('picker-cancel'));

    expect(app.getPathname()).toBe('/meals');
  });

  it('shows LoadError when nothing has loaded, and its Retry reloads', async () => {
    await update({ library: EMPTY, status: 'error' });
    await renderSheet();

    expect(screen.getByRole('header', { name: "Couldn't load meals" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    // Typing a meal in doesn't need the library.
    await fireEvent.press(tab('write'));
    expect(editor()).toBeOnTheScreen();
  });

  it('keeps the meals when a reload fails, with a toast at the top whose Retry reloads', async () => {
    await renderSheet();

    await update({ refreshFailedAt: 1 });

    expect(rowIds()).toHaveLength(3);
    expect(toast()).toHaveStyle({ top: 8 });
    expect(within(toast()!).getByText("Couldn't load meals")).toBeOnTheScreen();
    await fireEvent.press(within(toast()!).getByRole('button', { name: 'Retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows the banner and "Waiting for connection…" while paused with nothing loaded', async () => {
    onlineManager.setOnline(false);
    await update({ library: EMPTY, status: 'waiting' });
    await renderSheet();

    expect(screen.getByText(OFFLINE_BANNER)).toBeOnTheScreen();
    expect(screen.getByText('Waiting for connection…')).toBeOnTheScreen();
    expect(tab('write')).toBeOnTheScreen();
  });

  it('shows "No matching meals" when nothing matches', async () => {
    await renderSheet();

    await fireEvent.changeText(search(), 'lasagne');

    expect(screen.getByRole('header', { name: 'No matching meals' })).toBeOnTheScreen();
  });
});

describe('entering a meal manually', () => {
  it('has a field named for the meal type, with Save disabled until the text changes', async () => {
    await renderSheet();
    await fireEvent.press(tab('write'));

    expect(selectedTab()).toBe('write');
    expect(editor()).toHaveProp('accessibilityLabel', 'Dinner');
    expect(editor()).toHaveProp('placeholder', "What's for dinner?");
    expect(editor()).toHaveProp('autoFocus', true);
    expect(
      screen.getByText("Typed meals stay in this plan; they aren't added to the library."),
    ).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();

    await typeIn('Soup');
    expect(saveButton()).toBeEnabled();
    await typeIn('');
    expect(saveButton()).toBeDisabled();
  });

  it('R32.3 Save writes the trimmed text with no link, announces it and closes', async () => {
    const app = await renderSheet();
    await fireEvent.press(tab('write'));
    await typeIn('  Soup and bread \n');

    await fireEvent.press(saveButton());

    expect(mockSetMeal.mock.calls).toEqual([
      [{ date: THURSDAY, mealType: 'dinner', body: 'Soup and bread', libraryMealId: null }],
    ]);
    expect(announce).toHaveBeenCalledWith('Thursday dinner: Soup and bread');
    expect(alert).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/meals');
  });

  it('R32.7 keeps Save disabled when only the spacing around the text changed', async () => {
    await update({ entries: [planned('Leftovers')] });
    await renderSheet();

    await typeIn('  Leftovers  ');

    expect(saveButton()).toBeDisabled();
  });

  it('R33.1 Save on emptied text clears the slot', async () => {
    await update({ entries: [planned('Leftovers')] });
    await renderSheet();

    await typeIn('   ');
    await fireEvent.press(saveButton());

    expect(mockSetMeal.mock.calls).toEqual([[{ date: THURSDAY, mealType: 'dinner', body: null }]]);
  });

  it('editing the text of a library meal saves it as typed, with no link (DD-R10)', async () => {
    await update({ entries: [planned(TACOS_TEXT, TACOS)] });
    await renderSheet();
    await fireEvent.press(tab('write'));
    expect(editor()).toHaveDisplayValue(TACOS_TEXT);
    // Chosen from the tabs, not opened on them, so the field takes focus.
    expect(editor()).toHaveProp('autoFocus', true);

    await typeIn(`${TACOS_TEXT}, no cheese`);
    await fireEvent.press(saveButton());

    expect(mockSetMeal).toHaveBeenCalledWith({
      date: THURSDAY,
      mealType: 'dinner',
      body: `${TACOS_TEXT}, no cheese`,
      libraryMealId: null,
    });
  });

  it('switching back to the library keeps what was typed', async () => {
    await renderSheet();
    await fireEvent.press(tab('write'));
    await typeIn('Soup');

    await fireEvent.press(tab('library'));
    expect(screen.queryByTestId('plan-save')).toBeNull();
    await fireEvent.press(tab('write'));

    expect(editor()).toHaveDisplayValue('Soup');
    expect(saveButton()).toBeEnabled();
  });

  it.each([
    [450, null],
    [451, '49 characters left'],
    [499, '1 character left'],
    [500, 'No characters left'],
  ])('R32.5 at %i characters shows %s', async (length, counter) => {
    await renderSheet();
    await fireEvent.press(tab('write'));

    await typeIn('a'.repeat(length));

    if (counter === null) {
      expect(screen.queryByText(/characters? left/)).toBeNull();
    } else {
      expect(screen.getByText(counter)).toBeOnTheScreen();
    }
  });

  it('R32.5 shows "No characters left" in bold, and keeps the first 500 of a longer paste', async () => {
    await renderSheet();
    await fireEvent.press(tab('write'));

    await typeIn('b'.repeat(600));

    expect(editor().props.value).toHaveLength(500);
    expect(screen.getByText('No characters left')).toHaveStyle({ fontWeight: '700' });
  });

  it('R42.12 asks before Cancel drops typed text: Keep editing stays, Discard closes unsaved', async () => {
    const app = await renderSheet();
    await fireEvent.press(tab('write'));
    await typeIn('Soup');

    await fireEvent.press(screen.getByTestId('picker-cancel'));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('Discard this meal?');
    expect(alertButtons().map((b) => [b.text, b.style])).toEqual([
      ['Keep editing', 'cancel'],
      ['Discard', 'destructive'],
    ]);
    await pressAlert('Keep editing');
    expect(app.getPathname()).toBe('/meal-picker');
    expect(editor()).toHaveDisplayValue('Soup');

    await fireEvent.press(screen.getByTestId('picker-cancel'));
    await pressAlert('Discard');

    expect(app.getPathname()).toBe('/meals');
    expect(mockSetMeal).not.toHaveBeenCalled();
  });

  it('R45.7 asks before a swipe down drops typed text, too', async () => {
    const app = await renderSheet();
    await fireEvent.press(tab('write'));
    await typeIn('Soup');

    // A swipe down removes the sheet's route, as going back does.
    await act(() => router.back());

    expect(alert).toHaveBeenCalledTimes(1);
    expect(app.getPathname()).toBe('/meal-picker');
  });

  it('closes at once when the text is back as it opened', async () => {
    await update({ entries: [planned('Leftovers')] });
    const app = await renderSheet();
    await typeIn('Leftovers and bread');
    await typeIn('Leftovers');

    await fireEvent.press(screen.getByTestId('picker-cancel'));

    expect(alert).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/meals');
  });
});
