import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, TextInput } from 'react-native';

import AddItem, { ADDED_NOTE_MS } from '@/app/(app)/add-item';
import { CATEGORIES, COMMON_ITEMS } from '@/features/groceries/constants';
import { buildSections, type GroceryItem, progress } from '@/features/groceries/domain';
import type { GroceryList } from '@/features/groceries/hooks';
import type { ToastApi } from '@/lib/toast';
import { makeItem } from '@/test/factories';
import { themes } from '@/ui/theme';

// Add-item sheet tests C-ADD-01–09 (4-test-plan §4.7), as redesigned (specs/redesign/design.md
// §4.2). The hooks are mocked; the category suggestion, the duplicate check and the quick-add
// chips come from the real domain.ts (§8.4).

type HostElement = ReturnType<typeof screen.getByTestId>;

let mockList: GroceryList;
let mockToast: ToastApi;
const mockAddItem = jest.fn();
jest.mock('@/features/groceries/hooks', () => ({
  useGroceryList: () => mockList,
  // The real hook shows its toasts through the nearest ToastProvider.
  useAddItem: () => {
    mockToast = jest.requireActual('@/lib/toast').useToast();
    return mockAddItem;
  },
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

const { light } = themes;

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

let announce: jest.SpyInstance;
let focus: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockList = listOf([]);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  focus = jest.spyOn(TextInput.prototype, 'focus');
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

// The sheet brings its own ToastProvider, so none is wrapped around it here.
const renderSheet = () => render(<AddItem />);

const nameField = () => screen.getByTestId('item-form-name');
const quantityField = () => screen.getByTestId('item-form-quantity-field');
const addButton = () => screen.getByRole('button', { name: 'Add' });
const categoryTile = (label: string) => screen.getByRole('button', { name: label });
const selectedCategories = () =>
  screen.getAllByRole('button', { selected: true }).map((tile) => tile.props.accessibilityLabel);
const chipNames = () =>
  within(screen.getByTestId('quick-add'))
    .getAllByTestId('quick-add-chip')
    .map((chip) => chip.props.accessibilityLabel);
const quickAddTitle = () => within(screen.getByTestId('quick-add')).getByRole('header');
/** The form's − or +, around the quantity field. */
const stepButton = (kind: 'decrement' | 'increment') =>
  screen.getByTestId('item-form-quantity').children[kind === 'decrement' ? 0 : 2] as HostElement;
const addedNote = () => screen.queryByTestId('added-note', { includeHiddenElements: true });
const announced = () => announce.mock.calls.map(([message]) => message);
/** The fields that `focus()` was called on, by label. */
const focused = () =>
  focus.mock.contexts.map((field: { props: { accessibilityLabel: string } }) => {
    return field.props.accessibilityLabel;
  });

describe('Add-item sheet', () => {
  it('C-ADD-01 shows Name, quick add, Quantity, the category tiles and Add, with Name focused', async () => {
    await renderSheet();

    expect(screen.getByRole('header', { name: 'Add item' })).toBeOnTheScreen();
    expect(nameField()).toHaveProp('accessibilityLabel', 'Name');
    expect(nameField()).toHaveProp('autoFocus', true);
    expect(quantityField()).toHaveProp('accessibilityLabel', 'Quantity');
    expect(quantityField()).toHaveProp('placeholder', '1');
    for (const { label } of CATEGORIES) expect(categoryTile(label)).toBeOnTheScreen();
    expect(addButton()).toBe(screen.getByTestId('add-item-submit'));
    expect(addButton()).toBeEnabled();
    // Exactly one category is selected: Other, until a name suggests another (R5.2).
    expect(selectedCategories()).toEqual(['Other']);
    // The suggestions sit right under the name, so they stay above the keyboard.
    const order = testIds(screen.toJSON()).filter((id) =>
      ['item-form-name', 'quick-add', 'item-form-quantity', 'category-produce'].includes(id),
    );
    expect(order).toEqual([
      'item-form-name',
      'quick-add',
      'item-form-quantity',
      'category-produce',
    ]);
  });

  it('C-ADD-01 shows each tile with its emoji and name, the selected one blush and terracotta', async () => {
    await renderSheet();

    for (const { key, label, emoji } of CATEGORIES) {
      const tile = screen.getByTestId(`category-${key}`);
      expect(tile).toHaveProp('accessibilityLabel', label);
      // VoiceOver reads the name, without the emoji (N10).
      expect(within(tile).getByText(emoji, { includeHiddenElements: true })).toBeOnTheScreen();
      expect(within(tile).queryByText(emoji)).not.toBeOnTheScreen();
      expect(within(tile).getByText(label)).toBeOnTheScreen();
    }
    expect(categoryTile('Other')).toHaveStyle({
      backgroundColor: light.accentSoft,
      borderColor: light.accent,
    });
    expect(within(categoryTile('Other')).getByText('Other')).toHaveStyle({
      color: light.accentInk,
      fontWeight: '600',
    });
    expect(categoryTile('Bakery')).toHaveStyle({
      backgroundColor: light.background,
      borderColor: light.border,
    });
    expect(within(categoryTile('Bakery')).getByText('Bakery')).toHaveStyle({ color: light.ink });
  });

  it('C-ADD-02 selects the category of a common item as its name is typed', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'milk');
    expect(selectedCategories()).toEqual(['Dairy & Eggs']);

    await fireEvent.changeText(nameField(), 'kombucha');
    expect(selectedCategories()).toEqual(['Beverages']);

    await fireEvent.changeText(nameField(), 'birthday candles');
    expect(selectedCategories()).toEqual(['Other']);
  });

  it('C-ADD-03 stops following the name once the member picks a category', async () => {
    await renderSheet();

    await fireEvent.press(categoryTile('Bakery'));
    await fireEvent.changeText(nameField(), 'milk');

    expect(selectedCategories()).toEqual(['Bakery']);
  });

  it("C-ADD-04 asks for a name when Add is pressed without one, and doesn't add", async () => {
    await renderSheet();
    // A fresh form isn't an error.
    expect(screen.queryByText('Enter a name.')).not.toBeOnTheScreen();

    await fireEvent.changeText(nameField(), '   ');
    await fireEvent.press(addButton());

    expect(screen.getByText('Enter a name.')).toHaveStyle({ color: light.destructive });
    expect(announced()).toContain('Enter a name.');
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("C-ADD-04 flags a 201-character name as it's typed, and doesn't add it", async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'a'.repeat(201));
    expect(screen.getByText('Keep the name to 200 characters or fewer.')).toBeOnTheScreen();
    await fireEvent.press(addButton());
    await fireEvent(nameField(), 'submitEditing');

    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("C-ADD-04 flags a 51-character quantity, and doesn't add the item", async () => {
    await renderSheet();
    // The field itself stops at the database's 50 characters (R8.2).
    expect(quantityField()).toHaveProp('maxLength', 50);

    await fireEvent.changeText(nameField(), 'Eggs');
    await fireEvent.changeText(quantityField(), 'x'.repeat(51));
    expect(screen.getByText('Keep the quantity to 50 characters or fewer.')).toHaveStyle({
      color: light.destructive,
    });
    await fireEvent.press(addButton());

    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it('C-ADD-05 says an open item is already on the list, and disables Add', async () => {
    mockList = listOf([makeItem({ id: 'milk', name: 'Milk', category: 'dairy' })]);
    await renderSheet();

    await fireEvent.changeText(nameField(), 'milk ');

    // Not an error, so not in the error colour (R5.6).
    expect(screen.getByText('Milk is already on the list.')).toHaveStyle({
      color: light.accentInk,
    });
    expect(announced()).toContain('Milk is already on the list.');
    expect(addButton()).toBeDisabled();
    await fireEvent(nameField(), 'submitEditing');
    expect(mockAddItem).not.toHaveBeenCalled();

    await fireEvent.changeText(nameField(), 'milk chocolate');
    expect(screen.queryByText('Milk is already on the list.')).not.toBeOnTheScreen();
    expect(addButton()).toBeEnabled();
  });

  it('C-ADD-05 adds an item again when the only one with that name is checked (R5.7)', async () => {
    mockList = listOf([makeItem({ id: 'milk', name: 'Milk', isChecked: true })]);
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Milk');

    expect(screen.queryByText('Milk is already on the list.')).not.toBeOnTheScreen();
    await fireEvent.press(addButton());
    expect(mockAddItem).toHaveBeenCalledTimes(1);
  });

  it('C-ADD-06 adds the trimmed name and quantity, then clears the form for the next item', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), '  Eggs ');
    await fireEvent.changeText(quantityField(), ' 1 dozen  ');
    await fireEvent.press(addButton());

    expect(mockAddItem).toHaveBeenCalledWith({
      name: 'Eggs',
      category: 'dairy',
      quantity: '1 dozen',
    });
    expect(nameField()).toHaveDisplayValue('');
    expect(quantityField()).toHaveDisplayValue('');
    expect(focused()).toEqual(['Name']);
    expect(announced()).toContain('Added Eggs');
  });

  it('C-ADD-06 sends no quantity when the field is blank, and the picked category', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Kombucha');
    await fireEvent.press(categoryTile('Pantry'));
    await fireEvent.changeText(quantityField(), '   ');
    await fireEvent.press(addButton());

    expect(mockAddItem).toHaveBeenCalledWith({
      name: 'Kombucha',
      category: 'pantry',
      quantity: null,
    });
    // The next item's category follows its name again.
    expect(selectedCategories()).toEqual(['Other']);
  });

  it('C-ADD-06 says "✓ Added Eggs" under the header after each add, for a moment', async () => {
    jest.useFakeTimers();
    try {
      await renderSheet();
      expect(addedNote()).not.toBeOnTheScreen();

      await fireEvent.changeText(nameField(), 'Eggs');
      await fireEvent.press(addButton());
      expect(addedNote()).toHaveTextContent('✓ Added Eggs');
      expect(addedNote()).toHaveStyle({ color: light.sageInk });
      // VoiceOver hears the announcement instead.
      expect(screen.queryByTestId('added-note')).not.toBeOnTheScreen();

      // Each add starts the moment again.
      await act(async () => void jest.advanceTimersByTime(ADDED_NOTE_MS - 500));
      await fireEvent.changeText(nameField(), 'Milk');
      await fireEvent(nameField(), 'submitEditing');
      expect(addedNote()).toHaveTextContent('✓ Added Milk');
      await act(async () => void jest.advanceTimersByTime(ADDED_NOTE_MS - 1));
      expect(addedNote()).toBeOnTheScreen();

      await act(async () => void jest.advanceTimersByTime(1));
      expect(addedNote()).not.toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('C-ADD-07 adds three items in a row, with Return, and stays open', async () => {
    await renderSheet();

    for (const name of ['Bananas', 'Bread', 'Salmon']) {
      await fireEvent.changeText(nameField(), name);
      await fireEvent(nameField(), 'submitEditing');
    }

    expect(mockAddItem.mock.calls).toEqual([
      [{ name: 'Bananas', category: 'produce', quantity: null }],
      [{ name: 'Bread', category: 'bakery', quantity: null }],
      [{ name: 'Salmon', category: 'meat', quantity: null }],
    ]);
    expect(focused()).toEqual(['Name', 'Name', 'Name']);
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Add item' })).toBeOnTheScreen();
    // Return adds and keeps the keyboard up for the next item.
    expect(nameField()).toHaveProp('submitBehavior', 'submit');
    expect(nameField()).toHaveProp('returnKeyType', 'go');
  });

  it('C-ADD-07 adds from the quantity field with Return too', async () => {
    await renderSheet();
    // Return there adds as well, and keeps the keyboard up for the next item.
    expect(quantityField()).toHaveProp('returnKeyType', 'go');
    expect(quantityField()).toHaveProp('submitBehavior', 'submit');

    await fireEvent.changeText(nameField(), 'Eggs');
    await fireEvent.changeText(quantityField(), '6');
    await fireEvent(quantityField(), 'submitEditing');

    expect(mockAddItem).toHaveBeenCalledWith({ name: 'Eggs', category: 'dairy', quantity: '6' });
    expect(focused()).toEqual(['Name']);
    expect(quantityField()).toHaveDisplayValue('');
  });

  it('closes with Done', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByTestId('add-item-done')).toBeOnTheScreen();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("offers nothing to add until the list has loaded, since duplicates can't be checked", async () => {
    mockList = listOf([], { status: 'loading', listId: undefined });
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Eggs');
    expect(addButton()).toBeDisabled();
    await fireEvent(nameField(), 'submitEditing');
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(screen.queryByTestId('quick-add')).not.toBeOnTheScreen();
  });

  it('C-NET-01 shows the offline banner in the sheet, which covers the screen behind it', async () => {
    onlineManager.setOnline(false);
    await renderSheet();

    expect(
      screen.getByText("Offline — changes will send when you're back online"),
    ).toBeOnTheScreen();
  });

  it('shows the toasts of its adds itself, as the sheet covers the app behind it', async () => {
    await renderSheet();

    await act(async () => mockToast.show({ message: "Couldn't save that change" }));

    expect(screen.getByText("Couldn't save that change")).toBeOnTheScreen();
    // At the top, where the keyboard can't cover it.
    expect(screen.getByTestId('toast')).toHaveStyle({ top: 8 });
  });
});

describe('Add-item quantity', () => {
  it('steps an empty quantity from one, so + makes it 2', async () => {
    await renderSheet();
    // No quantity counts as one, which can't go lower.
    expect(stepButton('decrement')).toBeDisabled();

    await fireEvent.press(stepButton('increment'));
    expect(quantityField()).toHaveDisplayValue('2');
    await fireEvent.press(stepButton('increment'));
    expect(quantityField()).toHaveDisplayValue('3');
    await fireEvent.press(stepButton('decrement'));
    await fireEvent.press(stepButton('decrement'));

    expect(quantityField()).toHaveDisplayValue('1');
    expect(stepButton('decrement')).toBeDisabled();
  });

  it('steps the count of a typed quantity and keeps its unit', async () => {
    await renderSheet();

    await fireEvent.changeText(quantityField(), ' 2 lbs ');
    await fireEvent.press(stepButton('increment'));

    expect(quantityField()).toHaveDisplayValue('3 lbs');
  });

  it("can't step a quantity with no count, which is typed instead", async () => {
    await renderSheet();

    await fireEvent.changeText(quantityField(), 'a bunch');

    expect(stepButton('decrement')).toBeDisabled();
    expect(stepButton('increment')).toBeDisabled();
  });

  it('adds the stepped quantity', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Lemons');
    await fireEvent.press(stepButton('increment'));
    await fireEvent.press(stepButton('increment'));
    await fireEvent.press(addButton());

    expect(mockAddItem).toHaveBeenCalledWith({
      name: 'Lemons',
      category: 'produce',
      quantity: '3',
    });
    expect(quantityField()).toHaveDisplayValue('');
  });
});

describe('Quick add', () => {
  it('C-ADD-08 offers the popular staples under "Quick add" before a name or category', async () => {
    await renderSheet();

    expect(quickAddTitle()).toHaveTextContent('Quick add');
    expect(chipNames()).toEqual([
      'Bananas',
      'Apples',
      'Spinach',
      'Onions',
      'Avocado',
      'Chicken Breast',
      'Milk',
      'Eggs',
      'Bread',
      'Coffee',
    ]);
  });

  it("C-ADD-08 offers the picked category's common items under its name", async () => {
    await renderSheet();

    await fireEvent.press(categoryTile('Beverages'));

    expect(quickAddTitle()).toHaveTextContent('Quick add · Beverages');
    expect(chipNames()).toEqual(COMMON_ITEMS.beverages);
  });

  it('C-ADD-08 suggests the common items matching a typed name, and none when nothing matches', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'cream');
    expect(quickAddTitle()).toHaveTextContent('Suggestions');
    expect(chipNames()).toEqual(['Cream', 'Sour Cream', 'Heavy Cream', 'Ice Cream']);

    await fireEvent.changeText(nameField(), 'kimchi');
    expect(screen.queryByTestId('quick-add')).not.toBeOnTheScreen();
  });

  it('C-ADD-08 shows a disabled ✓ chip for an open item, and not for a checked one', async () => {
    mockList = listOf([
      makeItem({ id: 'apples', name: 'apples', category: 'produce' }),
      makeItem({ id: 'milk', name: 'Milk', category: 'dairy', isChecked: true }),
    ]);
    await renderSheet();

    const apples = screen.getByRole('button', { name: 'Apples, already added' });
    expect(apples).toBeDisabled();
    expect(screen.getByText('✓ Apples')).toBeOnTheScreen();
    await fireEvent.press(apples);
    expect(mockAddItem).not.toHaveBeenCalled();

    expect(screen.getByRole('button', { name: 'Milk' })).toBeEnabled();
  });

  it('C-ADD-09 adds a tapped chip to its category with no quantity', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByRole('button', { name: 'Coffee' }));

    expect(mockAddItem).toHaveBeenCalledWith({
      name: 'Coffee',
      category: 'beverages',
      quantity: null,
    });
    expect(announced()).toContain('Added Coffee');
    expect(addedNote()).toHaveTextContent('✓ Added Coffee');
  });

  it("C-ADD-09 adds a suggestion to the common item's own category, whatever is picked", async () => {
    await renderSheet();

    await fireEvent.press(categoryTile('Frozen'));
    await fireEvent.changeText(nameField(), 'pepp');
    await fireEvent.press(screen.getByRole('button', { name: 'Bell Peppers' }));

    expect(mockAddItem).toHaveBeenCalledWith({
      name: 'Bell Peppers',
      category: 'produce',
      quantity: null,
    });
  });
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
