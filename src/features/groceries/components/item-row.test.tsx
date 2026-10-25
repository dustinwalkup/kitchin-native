import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { touchTarget } from '@/test/a11y';
import { makeItem } from '@/test/factories';

import type { GroceryItem } from '../domain';
import { ItemRow, STEP_SAVE_DELAY_MS } from './item-row';

// Item interaction tests C-ITEM-01–06 and C-ITEM-10 (4-test-plan §4.6), with the redesign's
// quantity stepper and Edit action (specs/redesign/design.md §4.1). Gestures don't run under Jest,
// and jest-setup.ts draws the swipeable's actions beside the row, as if swiped open.

type HostElement = ReturnType<typeof screen.getByTestId>;

const onSetChecked = jest.fn();
const onSetQuantity = jest.fn();
const onDelete = jest.fn();
const onEdit = jest.fn();

// "1 gallon" starts with a count, so it steps; "a bunch" doesn't, so it opens the editor.
const MILK = makeItem({ id: 'milk', name: 'Milk', category: 'dairy', quantity: '1 gallon' });
const CILANTRO = makeItem({
  id: 'cilantro',
  name: 'Cilantro',
  category: 'produce',
  quantity: 'a bunch',
});

const ui = (item: GroceryItem) => (
  <GestureHandlerRootView>
    <ItemRow
      item={item}
      first
      last
      onSetChecked={onSetChecked}
      onSetQuantity={onSetQuantity}
      onDelete={onDelete}
      onEdit={onEdit}
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
const stepper = () => screen.getByTestId('quantity-stepper');
/** The stepper's − or +, which are hidden from VoiceOver and have no testID of their own. */
const stepButton = (kind: 'decrement' | 'increment') =>
  stepper().children[kind === 'decrement' ? 0 : 2] as HostElement;
const accessibilityAction = (actionName: string) =>
  fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName } });

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

describe('quantity stepper', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const wait = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

  it.each(['1 gallon', '2', '12 pack'])(
    'shows − and + for %j, which starts with a count, and keeps its unit',
    async (quantity) => {
      await render(ui({ ...MILK, quantity }));

      expect(stepper()).toHaveTextContent(quantity);
      expect(screen.queryByTestId('quantity-button')).not.toBeOnTheScreen();
      // The row is the one VoiceOver element, with the stepper's actions (N10).
      expect(stepper()).toHaveProp('accessible', false);
    },
  );

  it('steps at once, and saves the last value once the taps pause', async () => {
    await render(ui(MILK));

    await fireEvent.press(stepButton('increment'));
    await wait(STEP_SAVE_DELAY_MS - 100);
    await fireEvent.press(stepButton('increment'));
    await fireEvent.press(stepButton('increment'));

    // Each tap steps from what's on screen, not from the saved value.
    expect(stepper()).toHaveTextContent('4 gallon');
    expect(row()).toHaveProp('accessibilityLabel', 'Milk, 4 gallon, not checked');
    await wait(STEP_SAVE_DELAY_MS - 1);
    expect(onSetQuantity).not.toHaveBeenCalled();

    await wait(1);
    expect(onSetQuantity.mock.calls).toEqual([[{ id: 'milk', quantity: '4 gallon' }]]);
    expect(onSetChecked).not.toHaveBeenCalled();
  });

  it('steps down, and disables − at 1', async () => {
    await render(ui({ ...MILK, quantity: '2 lbs' }));
    expect(stepButton('decrement')).toBeEnabled();

    await fireEvent.press(stepButton('decrement'));

    expect(stepper()).toHaveTextContent('1 lbs');
    expect(stepButton('decrement')).toBeDisabled();
    expect(stepButton('increment')).toBeEnabled();
    await wait(STEP_SAVE_DELAY_MS);
    expect(onSetQuantity).toHaveBeenCalledWith({ id: 'milk', quantity: '1 lbs' });
  });

  it('disables + at 999', async () => {
    await render(ui({ ...MILK, quantity: '999' }));

    expect(stepButton('increment')).toBeDisabled();
    expect(stepButton('decrement')).toBeEnabled();
  });

  it.each([
    ['−', '1', 'decrement'],
    ['+', '999', 'increment'],
  ] as const)(
    'takes a tap on %s at %s without checking the item or saving anything',
    async (_, quantity, kind) => {
      await render(ui({ ...MILK, quantity }));
      expect(stepButton(kind)).toBeDisabled();

      await fireEvent.press(stepButton(kind));
      await wait(STEP_SAVE_DELAY_MS);

      // The disabled button keeps the touch, so it never falls through to the row.
      expect(onSetChecked).not.toHaveBeenCalled();
      expect(onSetQuantity).not.toHaveBeenCalled();
      expect(stepper()).toHaveTextContent(quantity);
    },
  );

  it('saves a pending step when the row unmounts', async () => {
    await render(ui(MILK));

    await fireEvent.press(stepButton('increment'));
    await screen.unmount();

    expect(onSetQuantity.mock.calls).toEqual([[{ id: 'milk', quantity: '2 gallon' }]]);
  });

  it('saves nothing on unmount when nothing was stepped', async () => {
    await render(ui(MILK));

    await screen.unmount();

    expect(onSetQuantity).not.toHaveBeenCalled();
  });

  it('follows the item again once the save lands, including an undo', async () => {
    await render(ui(MILK));
    await fireEvent.press(stepButton('increment'));
    await wait(STEP_SAVE_DELAY_MS);

    await screen.rerender(ui({ ...MILK, quantity: '2 gallon' }));
    expect(stepper()).toHaveTextContent('2 gallon');

    // The save failed, and the mutation put the old quantity back.
    await screen.rerender(ui(MILK));
    expect(stepper()).toHaveTextContent('1 gallon');
    expect(onSetQuantity).toHaveBeenCalledTimes(1);
  });

  it('keeps its pending value while another change to the item arrives', async () => {
    await render(ui(MILK));
    await fireEvent.press(stepButton('increment'));

    await screen.rerender(ui({ ...MILK, quantity: '5 gallon' }));
    expect(stepper()).toHaveTextContent('2 gallon');

    await wait(STEP_SAVE_DELAY_MS);
    expect(onSetQuantity.mock.calls).toEqual([[{ id: 'milk', quantity: '2 gallon' }]]);
  });

  it('steps with the "Increase quantity" and "Decrease quantity" actions', async () => {
    await render(ui({ ...MILK, quantity: '3' }));

    await accessibilityAction('increment');
    await accessibilityAction('increment');
    await accessibilityAction('decrement');

    expect(row()).toHaveProp('accessibilityLabel', 'Milk, 4, not checked');
    await wait(STEP_SAVE_DELAY_MS);
    expect(onSetQuantity.mock.calls).toEqual([[{ id: 'milk', quantity: '4' }]]);
  });

  it('does nothing when the action would step below 1', async () => {
    await render(ui({ ...MILK, quantity: '1' }));

    await accessibilityAction('decrement');
    await wait(STEP_SAVE_DELAY_MS);

    expect(stepper()).toHaveTextContent('1');
    expect(onSetQuantity).not.toHaveBeenCalled();
  });

  it("shows a checked item's quantity as text to edit, not − and +", async () => {
    await render(ui({ ...MILK, isChecked: true }));

    expect(screen.queryByTestId('quantity-stepper')).not.toBeOnTheScreen();
    expect(screen.getByTestId('quantity-button')).toHaveTextContent('1 gallon');
  });
});

describe('quantity editor', () => {
  it('C-ITEM-02 opens the editor on a quantity with no count, without checking the item', async () => {
    await render(ui(CILANTRO));
    expect(screen.queryByTestId('quantity-stepper')).not.toBeOnTheScreen();

    const input = await openEditor();

    expect(input).toHaveDisplayValue('a bunch');
    expect(onSetChecked).not.toHaveBeenCalled();
    expect(screen.queryByTestId('quantity-button')).not.toBeOnTheScreen();
  });

  it('C-ITEM-02 saves the trimmed value on Return, then closes the editor', async () => {
    await render(ui(CILANTRO));

    const input = await openEditor();
    await fireEvent.changeText(input, '  2 bunches  ');
    await fireEvent(input, 'submitEditing');

    expect(onSetQuantity).toHaveBeenCalledWith({ id: 'cilantro', quantity: '2 bunches' });
    expect(screen.queryByTestId('quantity-editor')).not.toBeOnTheScreen();
    expect(screen.getByTestId('quantity-button')).toBeOnTheScreen();
  });

  it('C-ITEM-02 clears the quantity with an empty value', async () => {
    await render(ui(CILANTRO));

    const input = await openEditor();
    await fireEvent.changeText(input, '   ');
    await fireEvent(input, 'submitEditing');

    expect(onSetQuantity).toHaveBeenCalledWith({ id: 'cilantro', quantity: null });
  });

  it('C-ITEM-03 saves when the editor loses focus', async () => {
    await render(ui(CILANTRO));

    const input = await openEditor();
    await fireEvent.changeText(input, '1 dozen');
    await fireEvent(input, 'blur');

    expect(onSetQuantity).toHaveBeenCalledWith({ id: 'cilantro', quantity: '1 dozen' });
  });

  it('saves once when Return also blurs the field', async () => {
    await render(ui(CILANTRO));

    const input = await openEditor();
    await fireEvent.changeText(input, '3');
    await act(async () => {
      input.props.onSubmitEditing();
      input.props.onBlur();
    });

    expect(onSetQuantity).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the quantity is unchanged', async () => {
    await render(ui(CILANTRO));

    const input = await openEditor();
    await fireEvent.changeText(input, ' a bunch ');
    await fireEvent(input, 'submitEditing');

    expect(onSetQuantity).not.toHaveBeenCalled();
  });

  it('limits the quantity to the database maximum of 50 characters (R8.2)', async () => {
    await render(ui(CILANTRO));

    expect(await openEditor()).toHaveProp('maxLength', 50);
  });

  it('C-ITEM-10 makes the quantity a target of at least 44 × 44 pt', async () => {
    await render(ui(CILANTRO));

    const button = screen.getByTestId('quantity-button');
    expect(button).toHaveTextContent('a bunch');
    expect(button).toHaveProp('accessibilityLabel', 'Edit quantity');
    const { width, height } = touchTarget(button);
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('shows nothing for no quantity, and VoiceOver can still add one', async () => {
    await render(ui({ ...MILK, quantity: null }));
    expect(screen.queryByTestId('quantity-button')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('quantity-stepper')).not.toBeOnTheScreen();

    await accessibilityAction('editQuantity');
    await fireEvent.changeText(editor(), '2');
    await fireEvent(editor(), 'submitEditing');

    expect(onSetQuantity).toHaveBeenCalledWith({ id: 'milk', quantity: '2' });
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

  it('hides the swipe actions from VoiceOver, which has the row actions instead', async () => {
    await render(ui(MILK));

    expect(screen.queryByTestId('item-delete')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('item-edit')).not.toBeOnTheScreen();
    expect(screen.getByTestId('item-delete', { includeHiddenElements: true })).toHaveTextContent(
      'Delete',
    );
    expect(screen.getByTestId('item-edit', { includeHiddenElements: true })).toHaveTextContent(
      'Edit',
    );
  });
});

describe('editing', () => {
  it('opens the edit sheet from the swiped-open Edit action', async () => {
    await render(ui(MILK));

    await fireEvent.press(screen.getByTestId('item-edit', { includeHiddenElements: true }));

    expect(onEdit).toHaveBeenCalledWith('milk');
    expect(onSetChecked).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('opens the edit sheet with the "Edit item" action', async () => {
    await render(ui(CILANTRO));

    await accessibilityAction('edit');

    expect(onEdit).toHaveBeenCalledWith('cilantro');
  });
});

describe('VoiceOver actions (OI-13)', () => {
  it('C-ITEM-06 offers "Increase quantity" and "Decrease quantity" for a count, then Edit and Delete', async () => {
    await render(ui(MILK));

    expect(row().props.accessibilityActions).toEqual([
      { name: 'increment', label: 'Increase quantity' },
      { name: 'decrement', label: 'Decrease quantity' },
      { name: 'edit', label: 'Edit item' },
      { name: 'delete', label: 'Delete' },
    ]);
  });

  it.each([
    ['a quantity with no count', CILANTRO],
    ['no quantity', { ...MILK, quantity: null }],
    ['a checked item', { ...MILK, isChecked: true }],
  ])('C-ITEM-06 offers "Edit quantity", "Edit item" and "Delete" for %s', async (_, item) => {
    await render(ui(item));

    expect(row().props.accessibilityActions).toEqual([
      { name: 'editQuantity', label: 'Edit quantity' },
      { name: 'edit', label: 'Edit item' },
      { name: 'delete', label: 'Delete' },
    ]);
  });

  it('C-ITEM-06 deletes with the "Delete" action', async () => {
    await render(ui(MILK));

    await accessibilityAction('delete');

    expect(onDelete).toHaveBeenCalledWith({ id: 'milk' });
  });

  it('C-ITEM-06 opens the editor with the "Edit quantity" action, and lets VoiceOver reach it', async () => {
    await render(ui(CILANTRO));
    expect(row()).toHaveProp('accessible', true);

    await accessibilityAction('editQuantity');

    expect(editor()).toHaveProp('accessibilityLabel', 'Quantity');
    // A single accessibility element would hide the field inside it.
    expect(row()).toHaveProp('accessible', false);
  });

  it("ignores an action it doesn't offer", async () => {
    await render(ui(MILK));

    await accessibilityAction('magicTap');

    for (const callback of [onSetChecked, onSetQuantity, onDelete, onEdit]) {
      expect(callback).not.toHaveBeenCalled();
    }
  });
});
