import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { touchTarget } from '@/test/a11y';

import { Chip } from './chip';
import { themes } from './theme';

const { light } = themes;

describe('Chip', () => {
  it('is a labelled button that calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Bananas" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Bananas' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('C-UI-02 has a touch target of at least 44 × 44 pt, counting its hitSlop', async () => {
    await render(<Chip label="Eggs" onPress={() => {}} />);

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'Eggs' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('C-UI-03 marks a disabled chip disabled, shows ✓ and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Milk" disabled onPress={onPress} />);

    const chip = screen.getByRole('button', { name: 'Milk, already added' });
    await fireEvent.press(chip);

    expect(chip).toBeDisabled();
    expect(screen.getByText('✓ Milk')).toHaveStyle({ color: light.inkMuted });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('can show a shorter label than the one VoiceOver reads', async () => {
    await render(<Chip label="🥫" accessibilityLabel="Pantry" disabled onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Pantry, already added' })).toBeOnTheScreen();
    expect(screen.getByText('✓ 🥫')).toBeOnTheScreen();
  });

  it('DD-R3 renders a selected chip with a blush fill, a terracotta edge and a semibold accentInk label', async () => {
    await render(<Chip label="Produce" selected onPress={() => {}} />);

    const chip = screen.getByRole('button', { name: 'Produce' });
    expect(chip).toBeSelected();
    expect(chip).toHaveStyle({
      backgroundColor: light.accentSoft,
      borderColor: light.accent,
      borderRadius: light.radius.pill,
    });
    expect(screen.getByText('Produce')).toHaveStyle({
      color: light.accentInk,
      fontWeight: '600',
    });
  });

  it('renders an unselected chip as regular ink text on white with a soft edge (DD-R4)', async () => {
    await render(<Chip label="Dinner" onPress={() => {}} />);

    const chip = screen.getByRole('button', { name: 'Dinner' });
    expect(chip).not.toBeSelected();
    expect(chip).toHaveStyle({ backgroundColor: light.background, borderColor: light.border });
    expect(screen.getByText('Dinner')).toHaveStyle({ color: light.ink, fontWeight: '400' });
  });

  it('shows a leading glyph before the label', async () => {
    await render(<Chip label="Family Favorite" leading={<Text>♥</Text>} onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Family Favorite' })).toHaveTextContent(
      '♥Family Favorite',
    );
  });

  it('carries its test ID', async () => {
    await render(<Chip testID="filter-all" label="All" onPress={() => {}} />);

    expect(screen.getByTestId('filter-all')).toHaveAccessibleName('All');
  });
});
