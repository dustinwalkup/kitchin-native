import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import Groceries from '@/app/(app)/(tabs)/groceries';
import { ADD_ITEM_BUTTON_CLEARANCE } from '@/features/groceries/components/add-item-button';
import { ProgressHeader } from '@/features/groceries/components/progress-header';
import { buildSections, type GroceryItem, progress } from '@/features/groceries/domain';
import type { GroceryList } from '@/features/groceries/hooks';
import { ToastProvider } from '@/lib/toast';
import { touchTarget } from '@/test/a11y';
import { makeItem } from '@/test/factories';
import { themes } from '@/ui/theme';

// Groceries screen tests C-GRO-01–11 (4-test-plan §4.5). The screen renders whatever
// useGroceryList returns, so the hook is mocked; its sections and progress still come from the
// real domain.ts, which is never mocked (§8.4).

let mockList: GroceryList;
const mockSetChecked = jest.fn();
const mockSetQuantity = jest.fn();
const mockDeleteItem = jest.fn();
const mockClearChecked = jest.fn();
jest.mock('@/features/groceries/hooks', () => ({
  useGroceryList: () => mockList,
  useSetChecked: () => mockSetChecked,
  useSetQuantity: () => mockSetQuantity,
  useDeleteItem: () => mockDeleteItem,
  useClearChecked: () => mockClearChecked,
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const { light } = themes;
const OFFLINE_BANNER = "Offline — changes will send when you're back online";

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

beforeEach(() => {
  jest.clearAllMocks();
  mockList = listOf(ITEMS);
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

const refreshControl = () => screen.getByTestId('groceries-list').props.refreshControl.props;

describe('Groceries', () => {
  it('C-GRO-01 shows sections in the fixed order, and none for empty categories', async () => {
    await renderGroceries();

    expect(sectionLabels()).toEqual(['Produce, 2 left', 'Dairy & Eggs, 2 left', 'Other, 1 left']);
    for (const label of ['Meat & Fish', 'Pantry', 'Frozen', 'Bakery']) {
      expect(screen.queryByText(label, { exact: false })).not.toBeOnTheScreen();
    }
  });

  it("C-GRO-01 lists each section's open items first, oldest first", async () => {
    await renderGroceries();

    const rows = screen.getAllByTestId('item-row').map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual([
      'Bananas, 6, not checked',
      'Spinach, not checked',
      'Apples, checked',
      'Eggs, not checked',
      'Milk, 1 gallon, not checked',
      'Foil, not checked',
    ]);
  });

  it('C-GRO-02 shows the emoji, the label and an "N left" badge in each section header', async () => {
    mockList = listOf([
      ...ITEMS,
      makeItem({ id: 'yogurt', name: 'Yogurt', category: 'dairy', isChecked: true }),
    ]);
    await renderGroceries();

    const [produce, dairy] = screen.getAllByTestId('section-header');
    expect(within(produce).getByText('🥬 Produce')).toBeOnTheScreen();
    expect(within(produce).getByText('2 left')).toHaveStyle({ color: light.category.produce.fg });
    // Checked items don't count.
    expect(within(dairy).getByText('🥛 Dairy & Eggs')).toBeOnTheScreen();
    expect(within(dairy).getByText('2 left')).toBeOnTheScreen();
  });

  it('C-GRO-02 says "0 left" for a section whose items are all checked', async () => {
    mockList = listOf([
      makeItem({ id: 'peas', name: 'Peas', category: 'frozen', isChecked: true }),
    ]);
    await renderGroceries();

    expect(sectionLabels()).toEqual(['Frozen, 0 left']);
    expect(screen.getByText('0 left')).toBeOnTheScreen();
  });

  it('C-GRO-03 shows the full name with no line limit, and the quantity when there is one', async () => {
    const longName = 'Extra-virgin olive oil from the little shop by the market '.repeat(3).trim();
    mockList = listOf([
      makeItem({ id: 'oil', name: longName, category: 'pantry', quantity: '2 bottles' }),
      makeItem({ id: 'salt', name: 'Salt', category: 'pantry' }),
    ]);
    await renderGroceries();

    const name = screen.getByText(longName);
    expect(name).not.toHaveProp('numberOfLines');
    expect(name).not.toHaveProp('ellipsizeMode');
    expect(screen.getByText('2 bottles')).toBeOnTheScreen();

    // Without a quantity, the quantity button offers to add one.
    const salt = screen.getByLabelText('Salt, not checked');
    expect(
      within(salt)
        .getAllByText(/./)
        .map((text) => text.props.children),
    ).toEqual(['Salt', '＋']);
  });

  it('C-GRO-04 strikes through, mutes and ticks a checked item, and not an open one', async () => {
    await renderGroceries();

    const apples = screen.getByLabelText('Apples, checked');
    expect(within(apples).getByText('Apples')).toHaveStyle({
      textDecorationLine: 'line-through',
      color: light.inkMuted,
    });
    expect(within(apples).getByTestId('checkbox-mark')).toHaveStyle({
      backgroundColor: light.primary,
    });

    const spinach = screen.getByLabelText('Spinach, not checked');
    expect(within(spinach).getByText('Spinach')).toHaveStyle({ color: light.ink });
    expect(within(spinach).getByText('Spinach')).not.toHaveStyle({
      textDecorationLine: 'line-through',
    });
    expect(within(spinach).getByTestId('checkbox-mark')).toHaveStyle({
      backgroundColor: light.background,
      borderColor: light.controlBorder,
    });
  });

  it('C-GRO-05 shows "3 of 12 checked" and a bold cactus 25%', async () => {
    mockList = listOf(
      Array.from({ length: 12 }, (_, i) =>
        makeItem({ id: `item-${i}`, name: `Item ${i}`, isChecked: i < 3 }),
      ),
    );
    await renderGroceries();

    expect(screen.getByText('3 of 12 checked')).toBeOnTheScreen();
    expect(screen.getByText('25%')).toHaveStyle({ color: light.cactus, fontWeight: '700' });
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '25%' });
    expect(screen.getByLabelText('3 of 12 checked, 25%')).toBeOnTheScreen();
  });

  it('C-GRO-06 gives ProgressHeader no percentage or bar for an empty list', async () => {
    await render(<ProgressHeader progress={progress([])} />);

    expect(screen.getByLabelText('0 of 0 checked')).toBeOnTheScreen();
    expect(screen.queryByText(/%/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('progress-fill')).not.toBeOnTheScreen();
  });

  it('C-GRO-06 shows the empty state, and no progress or percentage, for an empty list', async () => {
    mockList = listOf([]);
    await renderGroceries();

    expect(screen.getByText('No items yet')).toBeOnTheScreen();
    expect(screen.getByText('Add some items to get started')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-header')).not.toBeOnTheScreen();
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
    expect(screen.queryByText('No items yet')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('progress-header')).not.toBeOnTheScreen();
  });

  it('C-GRO-08 shows "Couldn\'t load groceries" with Retry when nothing has loaded', async () => {
    mockList = listOf([], { status: 'error' });
    await renderGroceries();

    expect(screen.getByRole('header', { name: "Couldn't load groceries" })).toBeOnTheScreen();
    expect(screen.queryByText('No items yet')).not.toBeOnTheScreen();
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
    expect(screen.queryByText('No items yet')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('skeleton-rows')).not.toBeOnTheScreen();
  });

  it('C-GRO-11 uses only static testIDs, none containing an item name (R26.7)', async () => {
    const STATIC_IDS = new Set([
      'groceries-list',
      'progress-header',
      'progress-fill',
      'section-header',
      'item-row',
      'checkbox-mark',
      'quantity-button',
      'item-delete',
      'add-item-button',
    ]);
    await renderGroceries();

    const ids = testIds(screen.toJSON());
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(STATIC_IDS);
    for (const { name, id } of ITEMS) {
      expect(ids.filter((testId) => testId.includes(name) || testId.includes(id))).toEqual([]);
    }
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
// item-row.test.tsx and clear-checked-button.test.tsx cover the components in detail.
describe('Groceries item interactions', () => {
  const row = (label: string) => screen.getByLabelText(label);

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

    const produce = screen
      .getAllByTestId('item-row')
      .slice(0, 3)
      .map((r) => r.props.accessibilityLabel);
    expect(produce).toEqual(['Spinach, not checked', 'Apples, checked', 'Bananas, 6, checked']);
  });

  it('C-ITEM-02 saves an edited quantity through useSetQuantity', async () => {
    await renderGroceries();

    await fireEvent.press(within(row('Bananas, 6, not checked')).getByTestId('quantity-button'));
    const editor = screen.getByTestId('quantity-editor');
    await fireEvent.changeText(editor, ' 8 ');
    await fireEvent(editor, 'submitEditing');

    expect(mockSetQuantity).toHaveBeenCalledWith({ id: 'bananas', quantity: '8' });
  });

  it('C-ITEM-06 deletes through useDeleteItem from the row\'s "Delete" action', async () => {
    await renderGroceries();

    await fireEvent(row('Milk, 1 gallon, not checked'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });

    expect(mockDeleteItem).toHaveBeenCalledWith({ id: 'milk' });
  });

  it('C-ITEM-09 clears checked items through useClearChecked, after confirming the count', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderGroceries();

    await fireEvent.press(screen.getByRole('button', { name: 'Clear checked' }));
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe('Clear 1 checked item?');
    expect(mockClearChecked).not.toHaveBeenCalled();
    await act(async () => (buttons as AlertButton[]).find((b) => b.text === 'Clear')?.onPress?.());

    expect(mockClearChecked).toHaveBeenCalledTimes(1);
  });

  it('C-ITEM-07 disables Clear checked while nothing is checked', async () => {
    mockList = listOf(ITEMS.filter((i) => !i.isChecked));
    await renderGroceries();

    expect(screen.getByRole('button', { name: 'Clear checked' })).toBeDisabled();
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
