import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, TextInput } from 'react-native';

import AddItem from '@/app/(app)/add-item';
import { CATEGORIES, COMMON_ITEMS } from '@/features/groceries/constants';
import { buildSections, type GroceryItem, progress } from '@/features/groceries/domain';
import type { GroceryList } from '@/features/groceries/hooks';
import type { ToastApi } from '@/lib/toast';
import { makeItem } from '@/test/factories';
import { themes } from '@/ui/theme';

// Add-item sheet tests C-ADD-01–09 (4-test-plan §4.7). The hooks are mocked; the category
// suggestion, the duplicate check and the quick-add chips come from the real domain.ts (§8.4).

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

const nameField = () => screen.getByLabelText('Name');
const quantityField = () => screen.getByLabelText('Quantity (optional)');
const addButton = () => screen.getByRole('button', { name: 'Add' });
const categoryChip = (label: string) => screen.getByRole('button', { name: label });
const selectedCategories = () =>
  screen.getAllByRole('button', { selected: true }).map((chip) => chip.props.accessibilityLabel);
const announced = () => announce.mock.calls.map(([message]) => message);
/** The fields that `focus()` was called on, by label. */
const focused = () =>
  focus.mock.contexts.map((field: { props: { accessibilityLabel: string } }) => {
    return field.props.accessibilityLabel;
  });

describe('Add-item sheet', () => {
  it('C-ADD-01 shows Name, the category chips, Quantity and Add, with Name focused', async () => {
    await renderSheet();

    expect(screen.getByRole('header', { name: 'Add item' })).toBeOnTheScreen();
    expect(nameField()).toHaveProp('autoFocus', true);
    for (const { label } of CATEGORIES) expect(categoryChip(label)).toBeOnTheScreen();
    expect(quantityField()).toBeOnTheScreen();
    expect(addButton()).toBeEnabled();
    // Exactly one category is selected: Other, until a name suggests another (R5.2).
    expect(selectedCategories()).toEqual(['Other']);
  });

  it('C-ADD-01 shows the label of the selected category only, and every emoji', async () => {
    await renderSheet();

    expect(within(categoryChip('Other')).getByText('🛒 Other')).toBeOnTheScreen();
    expect(within(categoryChip('Dairy & Eggs')).getByText('🥛')).toBeOnTheScreen();
    expect(categoryChip('Other')).toHaveStyle({ backgroundColor: light.cactus });
  });

  it('C-ADD-02 selects the category of a common item as its name is typed', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'milk');
    expect(selectedCategories()).toEqual(['Dairy & Eggs']);
    expect(within(categoryChip('Dairy & Eggs')).getByText('🥛 Dairy & Eggs')).toBeOnTheScreen();

    await fireEvent.changeText(nameField(), 'kombucha');
    expect(selectedCategories()).toEqual(['Other']);
  });

  it('C-ADD-03 stops following the name once the member picks a category', async () => {
    await renderSheet();

    await fireEvent.press(categoryChip('Bakery'));
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

    await fireEvent.changeText(nameField(), 'Eggs');
    await fireEvent.changeText(quantityField(), 'x'.repeat(51));
    expect(screen.getByText('Keep the quantity to 50 characters or fewer.')).toBeOnTheScreen();
    await fireEvent.press(addButton());

    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it('C-ADD-05 says an open item is already on the list, and disables Add', async () => {
    mockList = listOf([makeItem({ id: 'milk', name: 'Milk', category: 'dairy' })]);
    await renderSheet();

    await fireEvent.changeText(nameField(), 'milk ');

    // Not an error, so not in the error colour (R5.6).
    expect(screen.getByText('Milk is already on the list.')).toHaveStyle({ color: light.ink });
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
    await fireEvent.press(categoryChip('Pantry'));
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
  });

  it('C-ADD-07 adds from the quantity field with Return too', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Eggs');
    await fireEvent.changeText(quantityField(), '6');
    await fireEvent(quantityField(), 'submitEditing');

    expect(mockAddItem).toHaveBeenCalledWith({ name: 'Eggs', category: 'dairy', quantity: '6' });
    expect(focused()).toEqual(['Name']);
  });

  it('C-ADD-08 groups the quick-add chips by category, in the fixed order', async () => {
    await renderSheet();

    const groups = screen.getAllByTestId('quick-add-group');
    expect(groups).toHaveLength(CATEGORIES.length);
    CATEGORIES.forEach(({ key, label, emoji }, i) => {
      expect(within(groups[i]).getByText(`${emoji} ${label}`)).toBeOnTheScreen();
      const chips = within(groups[i]).getAllByRole('button');
      expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual(COMMON_ITEMS[key]);
    });
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

    await fireEvent.press(screen.getByRole('button', { name: 'Bananas' }));

    expect(mockAddItem).toHaveBeenCalledWith({
      name: 'Bananas',
      category: 'produce',
      quantity: null,
    });
    expect(announced()).toContain('Added Bananas');
  });

  it('closes with Done', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("offers nothing to add until the list has loaded, since duplicates can't be checked", async () => {
    mockList = listOf([], { status: 'loading', listId: undefined });
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Eggs');
    expect(addButton()).toBeDisabled();
    await fireEvent(nameField(), 'submitEditing');
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Quick add')).not.toBeOnTheScreen();
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
