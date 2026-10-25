import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';

import { IconButton } from './icon-button';
import { themes } from './theme';

const { light } = themes;

const glyph = () => screen.getByRole('button').children[0];

describe('IconButton', () => {
  it('N10 is a button VoiceOver names by its label, since the glyph has none', async () => {
    const onPress = jest.fn();
    await render(
      <IconButton
        testID="groceries-menu"
        symbol="ellipsis.circle"
        label="List options"
        onPress={onPress}
      />,
    );

    const button = screen.getByRole('button', { name: 'List options' });
    expect(button).toBe(screen.getByTestId('groceries-menu'));
    await fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('N11 is a 44 × 44 pt target', async () => {
    await render(<IconButton symbol="chevron.left" label="Previous week" onPress={() => {}} />);

    expect(touchTarget(screen.getByRole('button'))).toEqual({ width: 44, height: 44 });
  });

  it('draws its symbol in ink at 20 pt by default', async () => {
    await render(<IconButton symbol="ellipsis.circle" label="List options" onPress={() => {}} />);

    expect(glyph()).toHaveProp('name', 'ellipsis.circle');
    expect(glyph()).toHaveProp('tintColor', light.ink);
    expect(glyph()).toHaveProp('size', 20);
  });

  it('takes a tint token and a size', async () => {
    await render(
      <IconButton
        symbol="cart.badge.plus"
        label="Add to groceries"
        tint="accent"
        size={22}
        onPress={() => {}}
      />,
    );

    expect(glyph()).toHaveProp('tintColor', light.accent);
    expect(glyph()).toHaveProp('size', 22);
  });

  it('dims while disabled and ignores presses', async () => {
    const onPress = jest.fn();
    await render(
      <IconButton symbol="chevron.right" label="Next week" disabled onPress={onPress} />,
    );

    const button = screen.getByRole('button', { name: 'Next week' });
    await fireEvent.press(button);

    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ opacity: 0.45 });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is at full strength while enabled', async () => {
    await render(<IconButton symbol="chevron.right" label="Next week" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next week' })).not.toHaveStyle({ opacity: 0.45 });
  });
});
