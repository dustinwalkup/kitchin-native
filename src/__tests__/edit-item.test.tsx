import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';

import EditItem from '@/app/(app)/edit-item';
import { buildSections, type GroceryItem, progress } from '@/features/groceries/domain';
import type { GroceryList } from '@/features/groceries/hooks';
import type { ToastApi } from '@/lib/toast';
import { makeItem } from '@/test/factories';
import { themes } from '@/ui/theme';

// The edit-item sheet (specs/redesign/design.md §4.3): the add form, filled in from the item, with
// Save and a confirmed Delete item. The hooks are mocked; the duplicate check and validation come
// from the real domain.ts (4-test-plan §8.4). useEditItem's own tests cover what it sends.

type HostElement = ReturnType<typeof screen.getByTestId>;

let mockList: GroceryList;
let mockParams: { id?: string };
let mockToast: ToastApi;
const mockEditItem = jest.fn();
const mockDeleteItem = jest.fn();
jest.mock('@/features/groceries/hooks', () => ({
  useGroceryList: () => mockList,
  // The real hook shows its toasts through the nearest ToastProvider.
  useEditItem: () => {
    mockToast = jest.requireActual('@/lib/toast').useToast();
    return mockEditItem;
  },
  useDeleteItem: () => mockDeleteItem,
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

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

const MILK = makeItem({ id: 'milk', name: 'Milk', category: 'dairy', quantity: '1 gallon' });
const EGGS = makeItem({ id: 'eggs', name: 'Eggs', category: 'dairy' });
const BEFORE = { name: 'Milk', category: 'dairy', quantity: '1 gallon' };

let alert: jest.SpyInstance;
let announce: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockList = listOf([MILK, EGGS]);
  mockParams = { id: 'milk' };
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

// The sheet brings its own ToastProvider, so none is wrapped around it here.
const renderSheet = () => render(<EditItem />);

const nameField = () => screen.getByTestId('item-form-name');
const quantityField = () => screen.getByTestId('item-form-quantity-field');
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const categoryTile = (label: string) => screen.getByRole('button', { name: label });
const selectedCategories = () =>
  screen.getAllByRole('button', { selected: true }).map((tile) => tile.props.accessibilityLabel);
const increment = () => screen.getByTestId('item-form-quantity').children[2] as HostElement;

/** The title, message and buttons of the latest confirmation. */
function confirmation(): { title: string; message: string; buttons: AlertButton[] } {
  const [title, message, buttons] = alert.mock.calls.at(-1);
  return { title, message, buttons };
}

const pressAlertButton = (text: string) =>
  act(async () =>
    confirmation()
      .buttons.find((b) => b.text === text)
      ?.onPress?.(),
  );

describe('Edit-item sheet', () => {
  it('fills the form from the item, with Cancel, Save and Delete item', async () => {
    await renderSheet();

    expect(screen.getByRole('header', { name: 'Edit item' })).toBeOnTheScreen();
    expect(nameField()).toHaveDisplayValue('Milk');
    expect(quantityField()).toHaveDisplayValue('1 gallon');
    expect(selectedCategories()).toEqual(['Dairy & Eggs']);
    expect(saveButton()).toBe(screen.getByTestId('edit-item-save'));
    expect(saveButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBe(
      screen.getByTestId('edit-item-cancel'),
    );
    const remove = screen.getByRole('button', { name: 'Delete item' });
    expect(remove).toBe(screen.getByTestId('edit-item-delete'));
    expect(within(remove).getByText('Delete item')).toHaveStyle({ color: light.destructive });
  });

  it('edits rather than adds: no keyboard on opening, Return saves, and no quick add', async () => {
    await renderSheet();

    expect(nameField()).toHaveProp('autoFocus', false);
    for (const field of [nameField(), quantityField()]) {
      expect(field).toHaveProp('returnKeyType', 'done');
      expect(field).toHaveProp('submitBehavior', 'blurAndSubmit');
    }
    expect(screen.queryByTestId('quick-add')).not.toBeOnTheScreen();
  });

  it('saves the new name and category with the item as it opened, then closes', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), ' Oat milk ');
    await fireEvent.press(categoryTile('Beverages'));
    await fireEvent.press(saveButton());

    expect(mockEditItem.mock.calls).toEqual([
      [
        {
          id: 'milk',
          before: BEFORE,
          after: { name: 'Oat milk', category: 'beverages', quantity: '1 gallon' },
        },
      ],
    ]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the category as it was while the name changes', async () => {
    await renderSheet();

    // "Bread" would suggest Bakery for a new item, but an item being edited keeps its category.
    await fireEvent.changeText(nameField(), 'Bread');
    expect(selectedCategories()).toEqual(['Dairy & Eggs']);
  });

  it('saves a stepped quantity', async () => {
    await renderSheet();

    await fireEvent.press(increment());
    expect(quantityField()).toHaveDisplayValue('2 gallon');
    await fireEvent.press(saveButton());

    expect(mockEditItem).toHaveBeenCalledWith({
      id: 'milk',
      before: BEFORE,
      after: { ...BEFORE, quantity: '2 gallon' },
    });
  });

  it('saves a cleared quantity as none', async () => {
    await renderSheet();

    await fireEvent.changeText(quantityField(), '  ');
    await fireEvent.press(saveButton());

    expect(mockEditItem).toHaveBeenCalledWith({
      id: 'milk',
      before: BEFORE,
      after: { ...BEFORE, quantity: null },
    });
  });

  it('saves with Return in the name field', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Whole milk');
    await fireEvent(nameField(), 'submitEditing');

    expect(mockEditItem).toHaveBeenCalledWith({
      id: 'milk',
      before: BEFORE,
      after: { ...BEFORE, name: 'Whole milk' },
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('saves with Return in the quantity field', async () => {
    await renderSheet();

    await fireEvent.changeText(quantityField(), '2 gallons');
    await fireEvent(quantityField(), 'submitEditing');

    expect(mockEditItem).toHaveBeenCalledWith({
      id: 'milk',
      before: BEFORE,
      after: { ...BEFORE, quantity: '2 gallons' },
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("doesn't save with Return in the quantity field while the name is a duplicate", async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Eggs');
    await fireEvent(quantityField(), 'submitEditing');

    expect(mockEditItem).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('closes without saving when nothing changed', async () => {
    await renderSheet();

    // Trimmed, the name is what it was.
    await fireEvent.changeText(nameField(), ' Milk ');
    await fireEvent.press(saveButton());

    expect(mockEditItem).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("doesn't count the item's own name, in another case, as a duplicate", async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'MILK');

    expect(screen.queryByText('Milk is already on the list.')).not.toBeOnTheScreen();
    await fireEvent.press(saveButton());
    expect(mockEditItem).toHaveBeenCalledWith({
      id: 'milk',
      before: BEFORE,
      after: { ...BEFORE, name: 'MILK' },
    });
  });

  it('R5.6 says another open item has the name, and disables Save', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'eggs ');

    expect(screen.getByText('Eggs is already on the list.')).toHaveStyle({
      color: light.accentInk,
    });
    expect(announce).toHaveBeenCalledWith('Eggs is already on the list.');
    expect(saveButton()).toBeDisabled();
    await fireEvent(nameField(), 'submitEditing');
    expect(mockEditItem).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('R5.7 allows the name of an item that is only checked', async () => {
    mockList = listOf([MILK, { ...EGGS, isChecked: true }]);
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Eggs');

    expect(screen.queryByText('Eggs is already on the list.')).not.toBeOnTheScreen();
    expect(saveButton()).toBeEnabled();
  });

  it('asks for a name before saving, and stays open', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), '');
    await fireEvent.press(saveButton());

    expect(screen.getByText('Enter a name.')).toHaveStyle({ color: light.destructive });
    expect(announce).toHaveBeenCalledWith('Enter a name.');
    expect(mockEditItem).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('Cancel closes without saving', async () => {
    await renderSheet();

    await fireEvent.changeText(nameField(), 'Oat milk');
    await fireEvent.press(screen.getByTestId('edit-item-cancel'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockEditItem).not.toHaveBeenCalled();
  });

  it('keeps the item as the sheet opened while the other phone changes it', async () => {
    await renderSheet();

    mockList = listOf([{ ...MILK, name: 'Skim milk', quantity: '2 gallons' }, EGGS]);
    await screen.rerender(<EditItem />);

    expect(nameField()).toHaveDisplayValue('Milk');
    expect(quantityField()).toHaveDisplayValue('1 gallon');
    await fireEvent.changeText(nameField(), 'Oat milk');
    await fireEvent.press(saveButton());
    expect(mockEditItem).toHaveBeenCalledWith({
      id: 'milk',
      before: BEFORE,
      after: { ...BEFORE, name: 'Oat milk' },
    });
  });

  it('shows the toasts of its saves itself, at the top, as the sheet covers the app', async () => {
    await renderSheet();

    await act(async () => mockToast.show({ message: 'Eggs is already on the list' }));

    expect(screen.getByText('Eggs is already on the list')).toBeOnTheScreen();
    expect(screen.getByTestId('toast')).toHaveStyle({ top: 8 });
  });

  it('C-NET-01 shows the offline banner in the sheet', async () => {
    onlineManager.setOnline(false);
    await renderSheet();

    expect(
      screen.getByText("Offline — changes will send when you're back online"),
    ).toBeOnTheScreen();
  });
});

describe('Edit-item delete', () => {
  it('asks before deleting, and Cancel keeps the item', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByTestId('edit-item-delete'));

    const { title, message, buttons } = confirmation();
    expect(title).toBe('Delete Milk?');
    expect(message).toBe("It'll be removed from the list.");
    expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]);
    await pressAlertButton('Cancel');
    expect(mockDeleteItem).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('deletes once confirmed, says so to VoiceOver, and closes', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByTestId('edit-item-delete'));
    await pressAlertButton('Delete');

    expect(mockDeleteItem.mock.calls).toEqual([[{ id: 'milk' }]]);
    expect(announce).toHaveBeenCalledWith('Deleted Milk');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockEditItem).not.toHaveBeenCalled();
  });
});

describe('Edit-item missing item', () => {
  it.each([
    ['deleted on the other phone', { id: 'gone' }],
    ['not named', {}],
  ])('says the item is no longer on the list when it was %s', async (_, params) => {
    mockParams = params;
    await renderSheet();

    expect(screen.getByTestId('edit-item-missing')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: "This item isn't on the list any more" }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('item-form-name')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeOnTheScreen();
  });

  it('closes from the message or the header', async () => {
    mockParams = { id: 'gone' };
    await renderSheet();

    const [header, message] = screen.getAllByRole('button', { name: 'Close' });
    await fireEvent.press(message);
    await fireEvent.press(header);

    expect(mockBack).toHaveBeenCalledTimes(2);
  });

  it('shows the form once the list has loaded, when opened before it', async () => {
    mockList = listOf([], { status: 'loading', listId: undefined });
    await renderSheet();
    expect(screen.queryByTestId('item-form-name')).not.toBeOnTheScreen();

    mockList = listOf([MILK, EGGS]);
    await screen.rerender(<EditItem />);

    expect(nameField()).toHaveDisplayValue('Milk');
    expect(quantityField()).toHaveDisplayValue('1 gallon');
    expect(selectedCategories()).toEqual(['Dairy & Eggs']);

    // From then on, it keeps the item as it was when the form appeared.
    mockList = listOf([{ ...MILK, name: 'Skim milk', quantity: '2 gallons' }, EGGS]);
    await screen.rerender(<EditItem />);
    expect(nameField()).toHaveDisplayValue('Milk');
    expect(quantityField()).toHaveDisplayValue('1 gallon');

    await fireEvent.changeText(nameField(), 'Oat milk');
    await fireEvent.press(saveButton());
    expect(mockEditItem).toHaveBeenCalledWith({
      id: 'milk',
      before: BEFORE,
      after: { ...BEFORE, name: 'Oat milk' },
    });
  });

  it('keeps the open form when the item leaves the list meanwhile', async () => {
    await renderSheet();

    mockList = listOf([EGGS]);
    await screen.rerender(<EditItem />);

    expect(nameField()).toHaveDisplayValue('Milk');
    expect(screen.queryByTestId('edit-item-missing')).not.toBeOnTheScreen();
  });

  it('shows only the header while the list is still loading', async () => {
    mockList = listOf([], { status: 'loading', listId: undefined });
    await renderSheet();

    expect(screen.getByRole('header', { name: 'Edit item' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    expect(screen.queryByTestId('edit-item-missing')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('item-form-name')).not.toBeOnTheScreen();
  });
});
