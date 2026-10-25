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

  it('keeps onBrand text bold whatever weight is asked for', async () => {
    await render(
      <Text color="onBrand" weight="regular">
        Add
      </Text>,
    );

    expect(screen.getByText('Add')).toHaveStyle({ fontWeight: '700' });
  });

  it.each([
    ['regular', '400'],
    ['medium', '500'],
    ['semibold', '600'],
    ['bold', '700'],
  ] as const)('sets the %s weight over the variant’s own', async (weight, fontWeight) => {
    await render(
      <Text variant="headline" weight={weight}>
        Tacos
      </Text>,
    );

    expect(screen.getByText('Tacos')).toHaveStyle({ fontSize: 17, fontWeight });
  });

  it('makes `bold` win over `weight`', async () => {
    await render(
      <Text bold weight="regular">
        No characters left
      </Text>,
    );

    expect(screen.getByText('No characters left')).toHaveStyle({ fontWeight: '700' });
  });

  it.each([
    ['largeTitle', 34, '700'],
    ['title', 22, '700'],
    ['title2', 20, '700'],
    ['headline', 17, '600'],
    ['body', 17, '400'],
    ['callout', 16, '400'],
    ['subhead', 15, '400'],
    ['footnote', 13, '400'],
    ['caption', 12, '500'],
    ['eyebrow', 12, '600'],
  ] as const)('sizes the %s variant at %i pt, weight %s', async (variant, fontSize, fontWeight) => {
    await render(<Text variant={variant}>Sample</Text>);

    expect(screen.getByText('Sample')).toHaveStyle({ fontSize, fontWeight });
  });

  it('sets eyebrow headings in spaced capitals', async () => {
    await render(<Text variant="eyebrow">Account</Text>);

    expect(screen.getByText('Account')).toHaveStyle({
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    });
  });

  it('lets a style override the variant, after the colour', async () => {
    await render(<Text style={{ textAlign: 'center' }}>Centred</Text>);

    expect(screen.getByText('Centred')).toHaveStyle({ textAlign: 'center', color: light.ink });
  });
});
