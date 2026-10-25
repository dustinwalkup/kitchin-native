import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { touchTarget } from '@/test/a11y';

import { Button } from './button';
import { themes } from './theme';

const { light } = themes;

// Button's variants from specs/redesign/design.md §3: a terracotta primary pill, a quiet secondary
// surface with a soft edge, and a text button.

describe('Button', () => {
  it('is a labelled button that calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('C-UI-02 has a touch target of at least 44 × 44 pt', async () => {
    await render(<Button label="OK" onPress={() => {}} />);

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'OK' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it.each(['secondary', 'text'] as const)(
    'C-UI-02 keeps a small %s button’s touch target at 44 pt, counting its hitSlop',
    async (variant) => {
      await render(<Button label="Clear" variant={variant} size="small" onPress={() => {}} />);

      const button = screen.getByRole('button', { name: 'Clear' });
      const { width, height } = touchTarget(button);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    },
  );

  it('draws a small button 34 pt tall, with subhead text', async () => {
    await render(<Button label="Show 2 checked items" size="small" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Show 2 checked items' })).toHaveStyle({
      minHeight: 34,
    });
    expect(screen.getByText('Show 2 checked items')).toHaveStyle({ fontSize: 15 });
  });

  it('C-UI-04 renders a primary button as bold onBrand text on a terracotta pill', async () => {
    await render(<Button label="Add" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Add' })).toHaveStyle({
      backgroundColor: light.accent,
      borderRadius: light.radius.pill,
    });
    expect(screen.getByText('Add')).toHaveStyle({ color: light.onBrand, fontWeight: '700' });
  });

  it('keeps a destructive primary button terracotta, with white text', async () => {
    await render(<Button label="Delete" destructive onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveStyle({
      backgroundColor: light.accent,
    });
    expect(screen.getByText('Delete')).toHaveStyle({ color: light.onBrand });
  });

  it('renders a secondary button as semibold ink text on white with a soft edge (DD-R4)', async () => {
    await render(<Button label="Retry" variant="secondary" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Retry' })).toHaveStyle({
      backgroundColor: light.background,
      borderColor: light.border,
      borderWidth: 1,
    });
    expect(screen.getByText('Retry')).toHaveStyle({ color: light.ink, fontWeight: '600' });
  });

  it('renders a destructive secondary button with red text', async () => {
    await render(<Button label="Delete meal" variant="secondary" destructive onPress={() => {}} />);

    expect(screen.getByText('Delete meal')).toHaveStyle({
      color: light.destructive,
      fontWeight: '600',
    });
  });

  it('renders a text button as semibold accentInk text with no surface', async () => {
    await render(<Button label="Back to this week" variant="text" onPress={() => {}} />);

    const button = screen.getByRole('button', { name: 'Back to this week' });
    expect(button).not.toHaveStyle({ backgroundColor: expect.anything() });
    expect(button).not.toHaveStyle({ borderWidth: expect.anything() });
    expect(screen.getByText('Back to this week')).toHaveStyle({
      color: light.accentInk,
      fontWeight: '600',
    });
  });

  it('renders a destructive text button with red text', async () => {
    await render(<Button label="Delete item" variant="text" destructive onPress={() => {}} />);

    expect(screen.getByText('Delete item')).toHaveStyle({ color: light.destructive });
  });

  it('shows a leading icon before the label', async () => {
    await render(<Button label="Create a new meal" icon={<Text>＋</Text>} onPress={() => {}} />);

    const button = screen.getByRole('button', { name: 'Create a new meal' });
    expect(button).toHaveTextContent('＋Create a new meal');
  });

  it('stretches to its container when `block` is set, and not otherwise', async () => {
    await render(
      <>
        <Button label="Sign in" block onPress={() => {}} />
        <Button label="Retry" onPress={() => {}} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveStyle({ alignSelf: 'stretch' });
    expect(screen.getByRole('button', { name: 'Retry' })).not.toHaveStyle({
      alignSelf: 'stretch',
    });
  });

  it('carries its test ID', async () => {
    await render(<Button testID="clear-checked" label="Clear checked items" onPress={() => {}} />);

    expect(screen.getByTestId('clear-checked')).toHaveAccessibleName('Clear checked items');
  });

  it('ignores presses while disabled, and dims', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" disabled onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveStyle({ opacity: 0.45 });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps its label for VoiceOver and blocks presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" loading onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.queryByText('Sign in')).not.toBeOnTheScreen();
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each([
    ['primary', light.onBrand],
    ['secondary', light.ink],
    ['text', light.accentInk],
  ] as const)('draws a %s button’s spinner in its label colour', async (variant, colour) => {
    await render(<Button label="Save" variant={variant} loading onPress={() => {}} />);

    const [spinner] = screen.getByRole('button', { name: 'Save' }).children;
    expect(spinner).toHaveProp('color', colour);
  });
});
