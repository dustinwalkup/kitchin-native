import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';

import { SheetHeader } from './sheet-header';
import { themes } from './theme';

const { light } = themes;

// A sheet's own header (specs/redesign/design.md §3.4): a quiet action on the left, the title, and
// the sheet's terracotta action on the right.

describe('SheetHeader', () => {
  it('reads its title as a header', async () => {
    await render(<SheetHeader title="Add item" />);

    expect(screen.getByRole('header', { name: 'Add item' })).toHaveStyle({ fontWeight: '600' });
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('draws the left action as muted text that calls onPress', async () => {
    const onPress = jest.fn();
    await render(
      <SheetHeader title="Add item" left={{ label: 'Done', onPress, testID: 'add-done' }} />,
    );

    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBe(screen.getByTestId('add-done'));
    expect(screen.getByText('Done')).toHaveStyle({ color: light.inkMuted });
    await fireEvent.press(done);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('N11 gives the left action a 44 × 44 pt target', async () => {
    await render(<SheetHeader title="Edit item" left={{ label: 'Cancel', onPress: () => {} }} />);

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'Cancel' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('dims a disabled left action and ignores presses', async () => {
    const onPress = jest.fn();
    await render(
      <SheetHeader title="Edit item" left={{ label: 'Cancel', onPress, disabled: true }} />,
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await fireEvent.press(cancel);

    expect(cancel).toBeDisabled();
    expect(cancel).toHaveStyle({ opacity: 0.45 });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('draws the right action as a terracotta pill with bold white text', async () => {
    const onPress = jest.fn();
    await render(
      <SheetHeader title="Add item" right={{ label: 'Add', onPress, testID: 'add-submit' }} />,
    );

    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBe(screen.getByTestId('add-submit'));
    expect(add).toHaveStyle({ backgroundColor: light.accent, borderRadius: light.radius.pill });
    expect(screen.getByText('Add')).toHaveStyle({ color: light.onBrand, fontWeight: '700' });
    await fireEvent.press(add);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('N11 gives the right action a 44 pt tall target, counting its hitSlop', async () => {
    await render(<SheetHeader title="Add item" right={{ label: 'Add', onPress: () => {} }} />);

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'Add' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('dims a disabled right action and ignores presses', async () => {
    const onPress = jest.fn();
    await render(
      <SheetHeader title="Add item" right={{ label: 'Add', onPress, disabled: true }} />,
    );

    const add = screen.getByRole('button', { name: 'Add' });
    await fireEvent.press(add);

    expect(add).toBeDisabled();
    expect(add).not.toBeBusy();
    expect(add).toHaveStyle({ opacity: 0.45 });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('R42.8 shows a spinner while busy, keeps the label’s space and blocks presses', async () => {
    const onPress = jest.fn();
    await render(
      <SheetHeader
        title="New meal"
        right={{ label: 'Save', onPress, busy: true, testID: 'meal-form-save' }}
      />,
    );

    const save = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(save);

    expect(save).toBeBusy();
    expect(save).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByText('Save')).toHaveStyle({ opacity: 0 });
    expect(screen.getByTestId('meal-form-save-spinner')).toHaveProp('color', light.onBrand);
  });

  it('draws a busy action without a test ID', async () => {
    await render(
      <SheetHeader title="New meal" right={{ label: 'Save', onPress: () => {}, busy: true }} />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeBusy();
    expect(screen.queryByTestId(/-spinner$/)).not.toBeOnTheScreen();
  });

  it('shows no spinner while idle', async () => {
    await render(
      <SheetHeader
        title="New meal"
        right={{ label: 'Save', onPress: () => {}, testID: 'meal-form-save' }}
      />,
    );

    expect(screen.queryByTestId('meal-form-save-spinner')).not.toBeOnTheScreen();
    expect(screen.getByText('Save')).not.toHaveStyle({ opacity: 0 });
  });

  it('keeps the title between the two actions', async () => {
    await render(
      <SheetHeader
        title="Sun, Oct 25 · Dinner"
        left={{ label: 'Cancel', onPress: () => {} }}
        right={{ label: 'Save', onPress: () => {} }}
      />,
    );

    expect(
      screen
        .getAllByRole(/header|button/)
        .map((element) => element.props.accessibilityLabel ?? 'title'),
    ).toEqual(['Cancel', 'title', 'Save']);
  });
});
