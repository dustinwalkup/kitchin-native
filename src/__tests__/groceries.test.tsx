import AsyncStorage from '@react-native-async-storage/async-storage';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import Groceries from '@/app/(app)/(tabs)/groceries';
import { ADD_ITEM_BUTTON_CLEARANCE } from '@/features/groceries/components/add-item-button';
import { STEP_SAVE_DELAY_MS } from '@/features/groceries/components/item-row';
import { ProgressHeader } from '@/features/groceries/components/progress-header';
import { EMPTY_STATE } from '@/features/groceries/constants';
import { buildSections, type GroceryItem, progress } from '@/features/groceries/domain';
import type { GroceryList } from '@/features/groceries/hooks';
import { ToastProvider } from '@/lib/toast';
import { touchTarget } from '@/test/a11y';
import { makeItem } from '@/test/factories';
import { themes } from '@/ui/theme';

// Groceries screen tests C-GRO-01–11 (4-test-plan §4.5), as redesigned (specs/redesign/design.md
// §4.1). The screen renders whatever useGroceryList returns, so the hook is mocked; its sections
// and progress still come from the real domain.ts, which is never mocked (§8.4).

let mockList: GroceryList;
const mockSetChecked = jest.fn();
const mockSetQuantity = jest.fn();
const mockDeleteItem = jest.fn();
const mockClearChecked = jest.fn();
const mockUncheckAll = jest.fn();
jest.mock('@/features/groceries/hooks', () => ({
  useGroceryList: () => mockList,
  useSetChecked: () => mockSetChecked,
  useSetQuantity: () => mockSetQuantity,
  useDeleteItem: () => mockDeleteItem,
  useClearChecked: () => mockClearChecked,
  useUncheckAll: () => mockUncheckAll,
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
// Rendered on its own, the screen has no tab navigator to hand its header to, so the header's
// right-hand side is drawn in place, above the list.
jest.mock('expo-router/js-tabs', () => ({
  Tabs: {
    Screen: ({ options }: { options?: { headerRight?: () => import('react').ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
}));
// The pill has its own test (C-NET-02), and needs the household channel; here it only marks where
// the screen puts it.
jest.mock('@/features/household/components/reconnecting-pill', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ReconnectingPill: () => createElement(Text, null, 'Reconnecting pill') };
});

const { light } = themes;
const OFFLINE_BANNER = "Offline — changes will send when you're back online";
const HIDE_CHECKED_KEY = 'kitchin.pref.groceries.hideChecked';

function listOf(items: GroceryItem[], overrides: Partial<GroceryList> = {}): GroceryList {
  return {
    listId: 'list-1',
    items,
    sections: buildSections(items),
    progress: progress(items),
    status: 'ready',
    refetch: jest.fn(async () => {}),
    isRefetching: false,
    refreshFailedAt: null,
    ...overrides,
  };
}

const ITEMS = [
  makeItem({ id: 'eggs', name: 'Eggs', category: 'dairy' }),
  makeItem({ id: 'foil', name: 'Foil', category: 'other' }),
  makeItem({ id: 'bananas', name: 'Bananas', category: 'produce', quantity: '6' }),
  makeItem({ id: 'apples', name: 'Apples', category: 'produce', isChecked: true }),
  makeItem({ id: 'milk', name: 'Milk', category: 'dairy', quantity: '1 gallon' }),
  makeItem({ id: 'spinach', name: 'Spinach', category: 'produce' }),
];

const allChecked = (items: GroceryItem[]) => items.map((i) => ({ ...i, isChecked: true }));

let alert: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockList = listOf(ITEMS);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

const ui = () => (
  <GestureHandlerRootView>
    <ToastProvider>
      <Groceries />
    </ToastProvider>
  </GestureHandlerRootView>
);

const renderGroceries = () => render(ui());

const sectionLabels = () =>
  screen.getAllByTestId('section-header').map((header) => header.props.accessibilityLabel);
const rowLabels = () =>
  screen.queryAllByTestId('item-row').map((row) => row.props.accessibilityLabel);
const row = (label: string) => screen.getByLabelText(label);

const refreshControl = () => screen.getByTestId('groceries-list').props.refreshControl.props;

const hideChecked = () => screen.getByTestId('hide-checked');
const setHideChecked = (value: boolean) => fireEvent(hideChecked(), 'valueChange', value);

/** The title and buttons of the latest confirmation. */
function confirmation(): { title: string; buttons: AlertButton[] } {
  const [title, , buttons] = alert.mock.calls.at(-1);
  return { title, buttons };
}

const pressAlertButton = (text: string) =>
  act(async () =>
    confirmation()
      .buttons.find((b) => b.text === text)
      ?.onPress?.(),
  );

describe('Groceries', () => {
  it('puts only the Reconnecting pill in the header, beside the title (R13.4)', async () => {
    await renderGroceries();

    expect(screen.getByText('Reconnecting pill')).toBeOnTheScreen();
    // The header has no buttons of its own: Uncheck all and Clear checked are in the panel.
    expect(testIds(screen.toJSON())[0]).toBe('groceries-list');
    expect(screen.queryByRole('button', { name: 'List options' })).not.toBeOnTheScreen();
  });

  it('C-GRO-01 shows sections in the fixed order, and none for empty categories', async () => {
    await renderGroceries();

    expect(sectionLabels()).toEqual(['Produce, 2 left', 'Dairy & Eggs, 2 left', 'Other, 1 left']);
    for (const label of ['Meat & Seafood', 'Pantry', 'Frozen', 'Bakery', 'Beverages']) {
      expect(screen.queryByText(label, { exact: false })).not.toBeOnTheScreen();
    }
  });

  it("C-GRO-01 lists each section's open items first, oldest first", async () => {
    await renderGroceries();

    expect(rowLabels()).toEqual([
      'Bananas, 6, not checked',
      'Spinach, not checked',
      'Apples, checked',
      'Eggs, not checked',
      'Milk, 1 gallon, not checked',
      'Foil, not checked',
    ]);
  });

  it('C-GRO-02 shows the emoji, the label and a sage "N left" count in each section header', async () => {
    mockList = listOf([
      ...ITEMS,
      makeItem({ id: 'yogurt', name: 'Yogurt', category: 'dairy', isChecked: true }),
    ]);
    await renderGroceries();

    const [produce, dairy] = screen.getAllByTestId('section-header');
    expect(within(produce).getByText('🥬')).toBeOnTheScreen();
    expect(within(produce).getByText('Produce')).toBeOnTheScreen();
    expect(within(produce).getByText('2 left')).toHaveStyle({ color: light.sageInk });
    // Checked items don't count.
    expect(within(dairy).getByText('🥚')).toBeOnTheScreen();
    expect(within(dairy).getByText('Dairy & Eggs')).toBeOnTheScreen();
    expect(within(dairy).getByText('2 left')).toBeOnTheScreen();
  });

  it('C-GRO-02 says "Done" for a section whose items are all checked', async () => {
    mockList = listOf([
      makeItem({ id: 'peas', name: 'Peas', category: 'frozen', isChecked: true }),
    ]);
    await renderGroceries();

    expect(sectionLabels()).toEqual(['Frozen, 0 left']);
    expect(screen.getByText('Done')).toHaveStyle({ color: light.inkMuted });
    expect(screen.queryByText('0 left')).not.toBeOnTheScreen();
  });

  it('C-GRO-03 shows the full name with no line limit, and the quantity when there is one', async () => {
    const longName = 'Extra-virgin olive oil from the little shop by the market '.repeat(3).trim();
    mockList = listOf([
      makeItem({ id: 'oil', name: longName, category: 'pantry', quantity: '2 bottles' }),
      makeItem({ id: 'thyme', name: 'Thyme', category: 'pantry', quantity: 'a sprig' }),
      makeItem({ id: 'salt', name: 'Salt', category: 'pantry' }),
    ]);
    await renderGroceries();

    const name = screen.getByText(longName);
    expect(name).not.toHaveProp('numberOfLines');
    expect(name).not.toHaveProp('ellipsizeMode');
    // A count steps with − and +; anything else opens the editor.
    expect(
      within(row(`${longName}, 2 bottles, not checked`)).getByTestId('quantity-stepper'),
    ).toHaveTextContent('2 bottles');
    expect(
      within(row('Thyme, a sprig, not checked')).getByTestId('quantity-button'),
    ).toHaveTextContent('a sprig');

    // Without a quantity, the row shows only the name.
    expect(
      within(row('Salt, not checked'))
        .getAllByText(/./)
        .map((text) => text.props.children),
    ).toEqual(['Salt']);
  });

  it('C-GRO-04 strikes through, mutes and ticks a checked item, and not an open one', async () => {
    await renderGroceries();

    const apples = row('Apples, checked');
    expect(within(apples).getByText('Apples')).toHaveStyle({
      textDecorationLine: 'line-through',
      color: light.inkMuted,
    });
    expect(within(apples).getByTestId('checkbox-mark')).toHaveStyle({
      backgroundColor: light.sage,
    });

    const spinach = row('Spinach, not checked');
    expect(within(spinach).getByText('Spinach')).toHaveStyle({ color: light.ink });
    expect(within(spinach).getByText('Spinach')).not.toHaveStyle({
      textDecorationLine: 'line-through',
    });
    expect(within(spinach).getByTestId('checkbox-mark')).toHaveStyle({
      backgroundColor: light.background,
      borderColor: light.controlBorder,
    });
  });

  it('C-GRO-05 shows "3 of 12 items", a bold terracotta 25% and a sage bar', async () => {
    mockList = listOf(
      Array.from({ length: 12 }, (_, i) =>
        makeItem({ id: `item-${i}`, name: `Item ${i}`, isChecked: i < 3 }),
      ),
    );
    await renderGroceries();

    expect(screen.getByText('3 of 12 items')).toBeOnTheScreen();
    expect(screen.getByText('25%')).toHaveStyle({ color: light.accent, fontWeight: '700' });
    expect(screen.getByTestId('progress-fill')).toHaveStyle({
      width: '25%',
      backgroundColor: light.sage,
    });
    expect(screen.getByLabelText('3 of 12 checked, 25%')).toBe(
      screen.getByTestId('progress-header'),
    );
  });

  it('C-GRO-05 says "All 12 items" once everything is checked', async () => {
    mockList = listOf(
      allChecked(
        Array.from({ length: 12 }, (_, i) => makeItem({ id: `item-${i}`, name: `Item ${i}` })),
      ),
    );
    await renderGroceries();

    expect(screen.getByText('All 12 items')).toBeOnTheScreen();
    expect(screen.getByText('100%')).toBeOnTheScreen();
  });

  it('C-GRO-06 gives ProgressHeader no percentage or bar for an empty list', async () => {
    await render(
      <ProgressHeader
        progress={progress([])}
        hideChecked={false}
        onHideCheckedChange={jest.fn()}
        uncheckCount={0}
        onUncheckAll={jest.fn()}
        onClearChecked={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('0 of 0 checked')).toBeOnTheScreen();
    expect(screen.getByText('0 of 0 items')).toBeOnTheScreen();
    expect(screen.queryByText(/%/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('progress-fill')).not.toBeOnTheScreen();
  });

  it('C-GRO-06 shows the empty state, and no progress or percentage, for an empty list', async () => {
    mockList = listOf([]);
    await renderGroceries();

    expect(screen.getByRole('header', { name: EMPTY_STATE.title })).toBeOnTheScreen();
    expect(screen.getByText(EMPTY_STATE.description)).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-header')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('hide-checked')).not.toBeOnTheScreen();
    expect(screen.queryByText(/%/)).not.toBeOnTheScreen();
  });

  it('C-GRO-06 offers a way to add an item from the empty state', async () => {
    mockList = listOf([]);
    await renderGroceries();

    await fireEvent.press(screen.getByRole('button', { name: 'Add an item' }));

    expect(mockPush).toHaveBeenCalledWith('/add-item');
  });

  it('C-GRO-07 shows skeleton rows on the first load', async () => {
    mockList = listOf([], { status: 'loading' });
    await renderGroceries();

    expect(screen.getByTestId('skeleton-rows')).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading groceries')).toBeOnTheScreen();
    expect(screen.queryByText(EMPTY_STATE.title)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('progress-header')).not.toBeOnTheScreen();
  });

  it('C-GRO-08 shows "Couldn\'t load groceries" with Retry when nothing has loaded', async () => {
    mockList = listOf([], { status: 'error' });
    await renderGroceries();

    expect(screen.getByRole('header', { name: "Couldn't load groceries" })).toBeOnTheScreen();
    expect(screen.queryByText(EMPTY_STATE.title)).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(mockList.refetch).toHaveBeenCalledTimes(1);
  });

  it('C-GRO-08 keeps the loaded items when a reload fails, with a Retry toast', async () => {
    await renderGroceries();
    mockList = { ...mockList, refreshFailedAt: 1 };
    await screen.rerender(ui());

    expect(screen.getAllByTestId('item-row')).toHaveLength(ITEMS.length);
    expect(screen.getByText("Couldn't load groceries")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(mockList.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('item-row')).toHaveLength(ITEMS.length);
  });

  it('C-GRO-08 shows the toast once per failed reload', async () => {
    // React Native's Jest setup already mocks it, so earlier tests' calls are still recorded.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    const toasts = () =>
      announce.mock.calls.filter(([message]) => message === "Couldn't load groceries");
    mockList = listOf(ITEMS, { refreshFailedAt: 1 });
    await renderGroceries();
    expect(toasts()).toHaveLength(1);

    await screen.rerender(ui());
    expect(toasts()).toHaveLength(1);

    mockList = { ...mockList, refreshFailedAt: 2 };
    await screen.rerender(ui());
    expect(toasts()).toHaveLength(2);
  });

  it('C-GRO-09 reloads on pull to refresh, with the spinner up until the reload finishes', async () => {
    let finish!: () => void;
    mockList = listOf(ITEMS, {
      refetch: jest.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    });
    await renderGroceries();
    expect(refreshControl().refreshing).toBe(false);

    await act(async () => void refreshControl().onRefresh());

    expect(mockList.refetch).toHaveBeenCalledTimes(1);
    expect(refreshControl().refreshing).toBe(true);
    await act(async () => finish());
    expect(refreshControl().refreshing).toBe(false);
  });

  it("doesn't show the pull spinner for a background reload", async () => {
    mockList = listOf(ITEMS, { isRefetching: true });
    await renderGroceries();

    expect(refreshControl().refreshing).toBe(false);
  });

  it('drops the pull spinner while offline, where the reload waits for the connection', async () => {
    mockList = listOf(ITEMS, { refetch: jest.fn(() => new Promise<void>(() => {})) });
    await renderGroceries();
    await act(async () => onlineManager.setOnline(false));

    await act(async () => void refreshControl().onRefresh());

    expect(refreshControl().refreshing).toBe(false);
    expect(screen.getByText(OFFLINE_BANNER)).toBeOnTheScreen();
  });

  it('C-GRO-09 pull to refresh also works on the empty and error states', async () => {
    mockList = listOf([], { status: 'error' });
    await renderGroceries();

    await act(async () => void refreshControl().onRefresh());

    expect(mockList.refetch).toHaveBeenCalledTimes(1);
  });

  it('C-GRO-10 shows the offline banner and "Waiting for connection…" when paused with no data', async () => {
    onlineManager.setOnline(false);
    mockList = listOf([], { status: 'waiting' });
    await renderGroceries();

    expect(screen.getByText(OFFLINE_BANNER)).toBeOnTheScreen();
    expect(screen.getByText('Waiting for connection…')).toBeOnTheScreen();
    expect(screen.queryByText(EMPTY_STATE.title)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('skeleton-rows')).not.toBeOnTheScreen();
  });

  it('C-GRO-11 uses only static testIDs, none containing an item name (R26.7)', async () => {
    const items = [
      ...ITEMS,
      makeItem({ id: 'thyme', name: 'Thyme', category: 'pantry', quantity: 'a sprig' }),
    ];
    mockList = listOf(items);
    await renderGroceries();

    const ids = testIds(screen.toJSON());
    expect(new Set(ids)).toEqual(
      new Set([
        'groceries-list',
        'progress-header',
        'progress-fill',
        'hide-checked',
        'uncheck-all',
        'clear-checked',
        'section-header',
        'item-edit',
        'item-delete',
        'item-row',
        'checkbox-mark',
        'quantity-stepper',
        'quantity-button',
        'add-item-button',
      ]),
    );
    for (const { name, id } of items) {
      expect(ids.filter((testId) => testId.includes(name) || testId.includes(id))).toEqual([]);
    }
  });

  it('C-GRO-11 uses static testIDs for the panel actions, the footer and the all-hidden state', async () => {
    await AsyncStorage.setItem(HIDE_CHECKED_KEY, 'true');
    mockList = listOf(allChecked(ITEMS));
    await renderGroceries();

    expect(testIds(screen.toJSON())).toEqual([
      'groceries-list',
      'progress-header',
      'progress-fill',
      'hide-checked',
      'uncheck-all',
      'clear-checked',
      'groceries-all-hidden',
      'show-checked',
      'add-item-button',
    ]);
  });

  it.each([
    ['loading', ['skeleton-rows']],
    ['error', ['load-error']],
    ['waiting', ['waiting-for-connection']],
    ['ready', ['groceries-empty', 'add-item-button']],
  ] as const)('C-GRO-11 uses static testIDs for the %s state', async (status, stateIds) => {
    mockList = listOf([], { status });
    await renderGroceries();

    expect(testIds(screen.toJSON())).toEqual(['groceries-list', ...stateIds]);
  });
});

// Task 4.7: each interaction reaches the right mutation hook with the right variables.
// item-row.test.tsx covers the row in detail.
describe('Groceries item interactions', () => {
  it('C-ITEM-01 checks an open item and unchecks a checked one through useSetChecked', async () => {
    await renderGroceries();

    await fireEvent.press(row('Spinach, not checked'));
    await fireEvent.press(row('Apples, checked'));

    expect(mockSetChecked.mock.calls).toEqual([
      [{ id: 'spinach', isChecked: true }],
      [{ id: 'apples', isChecked: false }],
    ]);
  });

  it('R7.5 moves a checked item below the open ones in its section', async () => {
    mockSetChecked.mockImplementation(({ id, isChecked }: { id: string; isChecked: boolean }) => {
      mockList = listOf(mockList.items.map((i) => (i.id === id ? { ...i, isChecked } : i)));
    });
    await renderGroceries();

    await fireEvent.press(row('Bananas, 6, not checked'));
    await screen.rerender(ui());

    expect(rowLabels().slice(0, 3)).toEqual([
      'Spinach, not checked',
      'Apples, checked',
      'Bananas, 6, checked',
    ]);
  });

  it('C-ITEM-02 saves an edited quantity through useSetQuantity', async () => {
    mockList = listOf([
      ...ITEMS,
      makeItem({ id: 'thyme', name: 'Thyme', category: 'pantry', quantity: 'a sprig' }),
    ]);
    await renderGroceries();

    await fireEvent.press(
      within(row('Thyme, a sprig, not checked')).getByTestId('quantity-button'),
    );
    const editor = screen.getByTestId('quantity-editor');
    await fireEvent.changeText(editor, ' 2 sprigs ');
    await fireEvent(editor, 'submitEditing');

    expect(mockSetQuantity).toHaveBeenCalledWith({ id: 'thyme', quantity: '2 sprigs' });
  });

  it('steps a counted quantity through useSetQuantity once the taps pause', async () => {
    jest.useFakeTimers();
    try {
      await renderGroceries();
      const stepper = within(row('Bananas, 6, not checked')).getByTestId('quantity-stepper');

      await fireEvent.press(stepper.children[2] as typeof stepper);
      await fireEvent.press(stepper.children[2] as typeof stepper);
      expect(mockSetQuantity).not.toHaveBeenCalled();
      await act(async () => void jest.advanceTimersByTime(STEP_SAVE_DELAY_MS));

      expect(mockSetQuantity.mock.calls).toEqual([[{ id: 'bananas', quantity: '8' }]]);
      expect(mockSetChecked).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('C-ITEM-06 deletes through useDeleteItem from the row\'s "Delete" action', async () => {
    await renderGroceries();

    await fireEvent(row('Milk, 1 gallon, not checked'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });

    expect(mockDeleteItem).toHaveBeenCalledWith({ id: 'milk' });
  });

  it('opens the edit sheet for the item from its swiped-open Edit action', async () => {
    await renderGroceries();

    // The swipe actions are drawn in row order.
    const edits = screen.getAllByTestId('item-edit', { includeHiddenElements: true });
    await fireEvent.press(edits[rowLabels().indexOf('Milk, 1 gallon, not checked')]);

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/edit-item', params: { id: 'milk' } });
    expect(mockSetChecked).not.toHaveBeenCalled();
  });

  it('opens the edit sheet with the row\'s "Edit item" action', async () => {
    await renderGroceries();

    await fireEvent(row('Eggs, not checked'), 'accessibilityAction', {
      nativeEvent: { actionName: 'edit' },
    });

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/edit-item', params: { id: 'eggs' } });
  });
});

describe('Hide checked items', () => {
  it('hides checked items with the switch, keeping the counts and the progress', async () => {
    await renderGroceries();
    expect(hideChecked()).toHaveProp('value', false);
    expect(hideChecked()).toHaveProp('accessibilityLabel', 'Hide checked items');

    await setHideChecked(true);

    expect(hideChecked()).toHaveProp('value', true);
    expect(rowLabels()).not.toContain('Apples, checked');
    expect(rowLabels()).toHaveLength(ITEMS.length - 1);
    expect(sectionLabels()).toEqual(['Produce, 2 left', 'Dairy & Eggs, 2 left', 'Other, 1 left']);
    expect(screen.getByLabelText('1 of 6 checked, 17%')).toBeOnTheScreen();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(HIDE_CHECKED_KEY, 'true');
  });

  it('starts with checked items hidden when this device remembers the choice', async () => {
    await AsyncStorage.setItem(HIDE_CHECKED_KEY, 'true');
    await renderGroceries();

    expect(hideChecked()).toHaveProp('value', true);
    expect(rowLabels()).not.toContain('Apples, checked');
  });

  it('closes the list with "Show 1 checked item" while they are hidden, which shows them', async () => {
    await renderGroceries();
    expect(screen.queryByTestId('show-checked')).not.toBeOnTheScreen();

    await setHideChecked(true);
    const show = screen.getByRole('button', { name: 'Show 1 checked item' });
    expect(show).toBe(screen.getByTestId('show-checked'));
    await fireEvent.press(show);

    expect(rowLabels()).toContain('Apples, checked');
    expect(hideChecked()).toHaveProp('value', false);
    expect(screen.queryByTestId('show-checked')).not.toBeOnTheScreen();
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(HIDE_CHECKED_KEY, 'false');
  });

  it('counts several hidden items in the plural, and drops a section with nothing open', async () => {
    mockList = listOf([
      ...ITEMS,
      makeItem({ id: 'peas', name: 'Peas', category: 'frozen', isChecked: true }),
    ]);
    await renderGroceries();

    await setHideChecked(true);

    expect(screen.getByRole('button', { name: 'Show 2 checked items' })).toBeOnTheScreen();
    expect(sectionLabels()).toEqual(['Produce, 2 left', 'Dairy & Eggs, 2 left', 'Other, 1 left']);
  });

  it("says everything's checked off when every item is checked and hidden", async () => {
    mockList = listOf(allChecked(ITEMS));
    await renderGroceries();

    await setHideChecked(true);

    expect(screen.getByTestId('groceries-all-hidden')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: "Everything's checked off" })).toBeOnTheScreen();
    expect(screen.queryAllByTestId('section-header')).toEqual([]);
    expect(screen.getByText('All 6 items')).toBeOnTheScreen();
    expect(screen.queryByText(EMPTY_STATE.title)).not.toBeOnTheScreen();
  });
});

describe('Collapsing sections', () => {
  const header = (label: string) => screen.getByRole('button', { name: label });

  it('collapses a section when its heading is tapped, and expands it again', async () => {
    await renderGroceries();
    expect(header('Produce, 2 left')).toBeExpanded();
    expect(header('Produce, 2 left')).toHaveProp('accessibilityHint', 'Hides this section');

    await fireEvent.press(header('Produce, 2 left'));

    expect(rowLabels()).toEqual([
      'Eggs, not checked',
      'Milk, 1 gallon, not checked',
      'Foil, not checked',
    ]);
    // The heading and its count stay.
    expect(sectionLabels()).toEqual(['Produce, 2 left', 'Dairy & Eggs, 2 left', 'Other, 1 left']);
    expect(header('Produce, 2 left')).toBeCollapsed();
    expect(header('Produce, 2 left')).toHaveProp('accessibilityHint', 'Shows this section');

    await fireEvent.press(header('Produce, 2 left'));

    expect(rowLabels()).toHaveLength(ITEMS.length);
    expect(header('Produce, 2 left')).toBeExpanded();
  });

  it('collapses each section on its own', async () => {
    await renderGroceries();

    await fireEvent.press(header('Dairy & Eggs, 2 left'));
    await fireEvent.press(header('Other, 1 left'));

    expect(rowLabels()).toEqual([
      'Bananas, 6, not checked',
      'Spinach, not checked',
      'Apples, checked',
    ]);
  });
});

// R10 as redesigned: Uncheck all and Clear checked sit in the progress panel, each confirmed first.
// list-actions.test.ts and progress-header.test.tsx cover the confirmations and buttons in detail.
describe('Uncheck all and Clear checked', () => {
  const uncheckAll = () => screen.getByRole('button', { name: 'Uncheck all' });
  const clearChecked = () => screen.getByRole('button', { name: 'Clear checked' });

  it('C-ITEM-09 clears checked items through useClearChecked, after confirming the count', async () => {
    await renderGroceries();

    await fireEvent.press(clearChecked());
    expect(confirmation().title).toBe('Clear 1 checked item?');
    expect(mockClearChecked).not.toHaveBeenCalled();
    await pressAlertButton('Clear');

    expect(mockClearChecked).toHaveBeenCalledTimes(1);
  });

  it('C-ITEM-08 clears nothing on Cancel (R10.5)', async () => {
    mockList = listOf(allChecked(ITEMS));
    await renderGroceries();

    await fireEvent.press(clearChecked());
    expect(confirmation().title).toBe('Clear 6 checked items?');
    await pressAlertButton('Cancel');

    expect(mockClearChecked).not.toHaveBeenCalled();
  });

  it('C-ITEM-13 unchecks through useUncheckAll, keeping a checked duplicate of an open item', async () => {
    mockList = listOf([
      ...ITEMS,
      makeItem({ id: 'old-milk', name: 'Milk', category: 'dairy', isChecked: true }),
    ]);
    await renderGroceries();

    await fireEvent.press(uncheckAll());
    expect(confirmation().title).toBe('Uncheck 1 item?');
    expect(mockUncheckAll).not.toHaveBeenCalled();
    await pressAlertButton('Uncheck');

    expect(mockUncheckAll).toHaveBeenCalledWith({ keepIds: ['old-milk'] });
  });

  it('C-ITEM-12 unchecks nothing on Cancel', async () => {
    await renderGroceries();

    await fireEvent.press(uncheckAll());
    await pressAlertButton('Cancel');

    expect(mockUncheckAll).not.toHaveBeenCalled();
  });

  it('C-ITEM-07 C-ITEM-11 offers neither while nothing is checked', async () => {
    mockList = listOf(ITEMS.filter((i) => !i.isChecked));
    await renderGroceries();

    expect(screen.queryByTestId('uncheck-all')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('clear-checked')).not.toBeOnTheScreen();
  });

  it('C-ITEM-11 disables Uncheck all while every checked item has the name of an open one', async () => {
    mockList = listOf([
      makeItem({ id: 'milk', name: 'Milk', category: 'dairy' }),
      makeItem({ id: 'old-milk', name: 'Milk', category: 'dairy', isChecked: true }),
    ]);
    await renderGroceries();

    expect(uncheckAll()).toBeDisabled();
    expect(clearChecked()).toBeEnabled();
    await fireEvent.press(uncheckAll());
    expect(alert).not.toHaveBeenCalled();
  });

  it('stays in the panel while checked items are hidden', async () => {
    await AsyncStorage.setItem(HIDE_CHECKED_KEY, 'true');
    await renderGroceries();

    expect(rowLabels()).not.toContain('Apples, checked');
    await fireEvent.press(clearChecked());

    expect(confirmation().title).toBe('Clear 1 checked item?');
  });
});

// Task 4.8: the "＋" opens the add-item sheet (§3.4).
describe('Groceries add button', () => {
  it('opens the add-item sheet', async () => {
    await renderGroceries();

    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));

    expect(mockPush).toHaveBeenCalledWith('/add-item');
  });

  it('N11 has a touch target of at least 44 × 44 pt', async () => {
    await renderGroceries();

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'Add item' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('leaves room below the last row, so the button never covers it', async () => {
    await renderGroceries();

    expect(screen.getByTestId('groceries-list').props.contentContainerStyle).toMatchObject({
      paddingBottom: ADD_ITEM_BUTTON_CLEARANCE,
    });
  });

  it.each(['loading', 'error', 'waiting'] as const)(
    "isn't offered while the list is %s, since adding needs the loaded list",
    async (status) => {
      mockList = listOf([], { status });
      await renderGroceries();

      expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeOnTheScreen();
    },
  );
});

interface JsonNode {
  props: { testID?: unknown };
  children: (JsonNode | string)[] | null;
}

/** Every testID in the rendered tree (`screen.toJSON()`), in order. */
function testIds(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(testIds);
  const { props, children } = node as JsonNode;
  const own = typeof props.testID === 'string' ? [props.testID] : [];
  return [...own, ...(children ?? []).flatMap(testIds)];
}
