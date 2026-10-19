import { render, screen } from '@testing-library/react-native';

import { Text } from './text';
import { themes } from './theme';

const { light } = themes;

describe('Text', () => {
  it('C-UI-05 keeps font scaling on and caps it at 2×', async () => {
    await render(<Text>Milk</Text>);

    expect(screen.getByText('Milk')).toHaveProp('allowFontScaling', true);
    expect(screen.getByText('Milk')).toHaveProp('maxFontSizeMultiplier', 2);
  });

  it('applies the variant and a colour token', async () => {
    await render(
      <Text variant="headline" color="inkMuted">
        Produce
      </Text>,
    );

    expect(screen.getByText('Produce')).toHaveStyle({
      fontSize: 17,
      fontWeight: '600',
      color: light.inkMuted,
    });
  });

  it('defaults to body text in ink', async () => {
    await render(<Text>Bananas</Text>);

    expect(screen.getByText('Bananas')).toHaveStyle({
      fontSize: 17,
      fontWeight: '400',
      color: light.ink,
    });
  });

  it('always makes onBrand text bold (DD19)', async () => {
    await render(<Text color="onBrand">Kitchin</Text>);

    expect(screen.getByText('Kitchin')).toHaveStyle({ color: light.onBrand, fontWeight: '700' });
  });
});
