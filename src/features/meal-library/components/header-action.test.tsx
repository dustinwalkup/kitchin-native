import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';
import { themes } from '@/ui/theme';

import { HeaderAction } from './header-action';

// The library's Add meal, a text action in the native header (R40.6, R40.12, N11, N26).

const theme = themes.light;
const onPress = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('HeaderAction', () => {
  it('R40.12 is a semibold terracotta label, read as a button', async () => {
    await render(<HeaderAction testID="library-add-meal" label="Add meal" onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Add meal' });
    expect(button).toHaveProp('testID', 'library-add-meal');
    expect(screen.getByText('Add meal')).toHaveStyle({
      color: theme.accentInk,
      fontWeight: '600',
    });

    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('N11 has a touch target of at least 44 × 44 pt', async () => {
    await render(<HeaderAction testID="action" label="Add" onPress={onPress} />);

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'Add' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('reads a longer label when it has one', async () => {
    await render(
      <HeaderAction testID="action" label="Add" accessibilityLabel="Add meal" onPress={onPress} />,
    );

    expect(screen.getByRole('button', { name: 'Add meal' })).toBeOnTheScreen();
  });

  it('draws a plain action muted, in the regular weight', async () => {
    await render(<HeaderAction testID="action" label="Cancel" plain onPress={onPress} />);

    expect(screen.getByText('Cancel')).toHaveStyle({ color: theme.inkMuted, fontWeight: '400' });
  });

  it('is dimmed and ignores presses while disabled', async () => {
    await render(<HeaderAction testID="action" label="Save" disabled onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ opacity: 0.6 });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('R42.8 shows a spinner in place of the label, busy and disabled, while busy', async () => {
    await render(<HeaderAction testID="action" label="Save" busy onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByTestId('action-spinner')).toBeOnTheScreen();
    // The label keeps its space, so the header doesn't shift.
    expect(screen.getByText('Save')).toHaveStyle({ opacity: 0 });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
