import { fireEvent, render, screen } from '@testing-library/react-native';

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

  it('renders a selected chip as bold onBrand text on cactus', async () => {
    await render(<Chip label="Produce" selected onPress={() => {}} />);

    const chip = screen.getByRole('button', { name: 'Produce' });
    expect(chip).toBeSelected();
    expect(chip).toHaveStyle({ backgroundColor: light.cactus });
    expect(screen.getByText('Produce')).toHaveStyle({ color: light.onBrand, fontWeight: '700' });
  });
});
