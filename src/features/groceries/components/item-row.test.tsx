import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { touchTarget } from '@/test/a11y';
import { makeItem } from '@/test/factories';

import type { GroceryItem } from '../domain';
import { ItemRow } from './item-row';

// Item interaction tests C-ITEM-01–06 and C-ITEM-10 (4-test-plan §4.6). Gestures don't run under
// Jest, and jest-setup.ts draws the swipeable's Delete action beside the row, as if swiped open.

const onSetChecked = jest.fn();
const onSetQuantity = jest.fn();
const onDelete = jest.fn();

const MILK = makeItem({ id: 'milk', name: 'Milk', category: 'dairy', quantity: '1 gallon' });

const ui = (item: GroceryItem) => (
  <GestureHandlerRootView>
    <ItemRow
      item={item}
      first
      last
      onSetChecked={onSetChecked}
      onSetQuantity={onSetQuantity}
      onDelete={onDelete}
    />
  </GestureHandlerRootView>
);

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const row = () => screen.getByTestId('item-row');
const editor = () => screen.getByTestId('quantity-editor');

async function openEditor() {
  await fireEvent.press(screen.getByTestId('quantity-button'));
  return editor();
}

describe('checking', () => {
  it('C-ITEM-01 checks an open item when the row is tapped', async () => {
    await render(ui(MILK));

    await fireEvent.press(row());

    expect(onSetChecked).toHaveBeenCalledWith({ id: 'milk', isChecked: true });
  });

  it('C-ITEM-01 unchecks a checked item when the row is tapped', async () => {
    await render(ui({ ...MILK, isChecked: true }));

    await fireEvent.press(row());

    expect(onSetChecked).toHaveBeenCalledWith({ id: 'milk', isChecked: false });
  });

  it('R7.3 sends the shown state each time, never a toggle', async () => {
    await render(ui(MILK));

    // Two taps before the optimistic change re-renders the row.
    await fireEvent.press(row());
    await fireEvent.press(row());

    expect(onSetChecked.mock.calls).toEqual([
      [{ id: 'milk', isChecked: true }],
      [{ id: 'milk', isChecked: true }],
    ]);
  });

  it('C-ITEM-05 reads "Milk, 1 gallon, not checked", and "checked" once checked', async () => {
    await render(ui(MILK));
    expect(screen.getByLabelText('Milk, 1 gallon, not checked')).toBe(row());

    await screen.rerender(ui({ ...MILK, isChecked: true }));

    expect(row()).toHaveProp('accessibilityLabel', 'Milk, 1 gallon, checked');
    expect(row()).toHaveProp('accessibilityRole', 'button');
  });

  it('leaves out a missing quantity from the label', async () => {
    await render(ui({ ...MILK, quantity: null }));

    expect(row()).toHaveProp('accessibilityLabel', 'Milk, not checked');
  });
});

describe('quantity', () => {
  it('C-ITEM-02 opens the editor on the current quantity, without checking the item', async () => {
    await render(ui(MILK));

    const input = await openEditor();

    expect(input).toHaveDisplayValue('1 gallon');
    expect(onSetChecked).not.toHaveBeenCalled();
    expect(screen.queryByTestId('quantity-button')).not.toBeOnTheScreen();
  });

  it('C-ITEM-02 saves the trimmed value on Return, then closes the editor', async () => {
    await render(ui(MILK));

    const input = await openEditor();
    await fireEvent.changeText(input, '  2 gallons  ');
    await fireEvent(input, 'submitEditing');

    expect(onSetQuantity).toHaveBeenCalledWith({ id: 'milk', quantity: '2 gallons' });
    expect(screen.queryByTestId('quantity-editor')).not.toBeOnTheScreen();
    expect(screen.getByTestId('quantity-button')).toBeOnTheScreen();
  });

  it('C-ITEM-02 clears the quantity with an empty value', async () => {
    await render(ui(MILK));

    const input = await openEditor();
    await fireEvent.changeText(input, '   ');
    await fireEvent(input, 'submitEditing');

    expect(onSetQuantity).toHaveBeenCalledWith({ id: 'milk', quantity: null });
  });

  it('C-ITEM-03 saves when the editor loses focus', async () => {
    await render(ui({ ...MILK, quantity: null }));

    const input = await openEditor();
    await fireEvent.changeText(input, '1 dozen');
    await fireEvent(input, 'blur');

    expect(onSetQuantity).toHaveBeenCalledWith({ id: 'milk', quantity: '1 dozen' });
  });

  it('saves once when Return also blurs the field', async () => {
    await render(ui(MILK));

    const input = await openEditor();
    await fireEvent.changeText(input, '3');
    await act(async () => {
      input.props.onSubmitEditing();
      input.props.onBlur();
    });

    expect(onSetQuantity).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the quantity is unchanged', async () => {
    await render(ui(MILK));

    const input = await openEditor();
    await fireEvent.changeText(input, ' 1 gallon ');
    await fireEvent(input, 'submitEditing');

    expect(onSetQuantity).not.toHaveBeenCalled();
  });

  it('limits the quantity to the database maximum of 50 characters (R8.2)', async () => {
    await render(ui(MILK));

    expect(await openEditor()).toHaveProp('maxLength', 50);
  });

  it('C-ITEM-10 shows "＋" for no quantity, in a target of at least 44 × 44 pt', async () => {
    await render(ui({ ...MILK, quantity: null }));

    const button = screen.getByTestId('quantity-button');
    expect(button).toHaveTextContent('＋');
    const { width, height } = touchTarget(button);
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });
});

describe('deleting', () => {
  it('C-ITEM-04 deletes from the swiped-open Delete action, with no confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await render(ui(MILK));

    await fireEvent.press(screen.getByTestId('item-delete', { includeHiddenElements: true }));

    expect(onDelete).toHaveBeenCalledWith({ id: 'milk' });
    expect(alert).not.toHaveBeenCalled();
    expect(onSetChecked).not.toHaveBeenCalled();
  });

  it('hides the swipe action from VoiceOver, which has the row action instead', async () => {
    await render(ui(MILK));

    expect(screen.queryByTestId('item-delete')).not.toBeOnTheScreen();
    expect(screen.getByTestId('item-delete', { includeHiddenElements: true })).toHaveTextContent(
      'Delete',
    );
  });
});

describe('VoiceOver actions (OI-13)', () => {
  it('C-ITEM-06 offers "Edit quantity" and "Delete"', async () => {
    await render(ui(MILK));

    expect(row().props.accessibilityActions).toEqual([
      { name: 'editQuantity', label: 'Edit quantity' },
      { name: 'delete', label: 'Delete' },
    ]);
  });

  it('C-ITEM-06 deletes with the "Delete" action', async () => {
    await render(ui(MILK));

    await fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

    expect(onDelete).toHaveBeenCalledWith({ id: 'milk' });
  });

  it('C-ITEM-06 opens the editor with the "Edit quantity" action, and lets VoiceOver reach it', async () => {
    await render(ui(MILK));
    expect(row()).toHaveProp('accessible', true);

    await fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName: 'editQuantity' } });

    expect(editor()).toHaveProp('accessibilityLabel', 'Quantity');
    // A single accessibility element would hide the field inside it.
    expect(row()).toHaveProp('accessible', false);
  });
});
