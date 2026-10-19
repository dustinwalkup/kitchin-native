import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';

import { Button } from './button';
import { themes } from './theme';

const { light } = themes;

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

  it('C-UI-04 renders a primary button as bold onBrand text on cactus', async () => {
    await render(<Button label="Add" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Add' })).toHaveStyle({
      backgroundColor: light.cactus,
    });
    expect(screen.getByText('Add')).toHaveStyle({ color: light.onBrand, fontWeight: '700' });
  });

  it('renders a secondary button as ink text inside a control border', async () => {
    await render(<Button label="Sign out" variant="secondary" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveStyle({
      backgroundColor: light.background,
      borderColor: light.controlBorder,
    });
    expect(screen.getByText('Sign out')).toHaveStyle({ color: light.ink });
  });

  it('ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" disabled onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps its label for VoiceOver and blocks presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" loading onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeBusy();
    expect(screen.queryByText('Sign in')).not.toBeOnTheScreen();
    expect(onPress).not.toHaveBeenCalled();
  });
});
