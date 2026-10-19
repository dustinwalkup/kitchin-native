import { render, screen, within } from '@testing-library/react-native';

import { Banner } from './banner';
import { Card } from './card';
import { CategoryBadge } from './category-badge';
import { DevBadge } from './dev-badge';
import { Pill } from './pill';
import { Screen } from './screen';
import { Text } from './text';
import { themes } from './theme';

// The display-only primitives: Banner, Pill, Card, CategoryBadge, DevBadge and Screen.

const { light } = themes;

describe('Banner', () => {
  it('shows its message as onBrand text on ink', async () => {
    await render(<Banner message="Offline — changes will send when you're back online" />);

    expect(screen.getByText("Offline — changes will send when you're back online")).toHaveStyle({
      color: light.onBrand,
    });
  });
});

describe('Pill', () => {
  it('shows its label in inkMuted', async () => {
    await render(<Pill label="Reconnecting…" />);

    expect(screen.getByText('Reconnecting…')).toHaveStyle({ color: light.inkMuted });
  });
});

describe('Card', () => {
  it('is white with a sage border and the card radius (R16.2)', async () => {
    await render(
      <Card>
        <Text>Inside</Text>
      </Card>,
    );

    expect(screen.getByText('Inside').parent).toHaveStyle({
      backgroundColor: light.background,
      borderColor: light.tertiary,
      borderRadius: light.radius.card,
    });
  });
});

describe('CategoryBadge', () => {
  it.each(
    Object.entries(light.category) as [keyof typeof light.category, { bg: string; fg: string }][],
  )('uses the %s badge pair (R16.4)', async (category, { bg, fg }) => {
    await render(<CategoryBadge category={category} label="2 left" />);

    expect(screen.getByText('2 left')).toHaveStyle({ color: fg });
    expect(screen.getByText('2 left').parent).toHaveStyle({ backgroundColor: bg });
  });
});

describe('DevBadge', () => {
  it('is labelled for VoiceOver and never takes touches', async () => {
    await render(<DevBadge />);

    const badge = screen.getByLabelText('Development build');
    expect(badge).toHaveProp('pointerEvents', 'none');
    expect(screen.getByText('DEV')).toHaveStyle({ color: light.onBrand, fontWeight: '700' });
  });
});

describe('Screen', () => {
  it('renders the banner slot above its content on the screen background', async () => {
    await render(
      <Screen banner={<Banner message="Offline" />}>
        <Text>Groceries</Text>
      </Screen>,
    );

    const [bannerSlot, content] = screen.root!.children.filter(
      (child) => typeof child !== 'string',
    );

    expect(screen.root).toHaveStyle({ backgroundColor: light.screen });
    expect(within(bannerSlot).getByText('Offline')).toBeOnTheScreen();
    expect(within(content).getByText('Groceries')).toBeOnTheScreen();
  });

  it('renders without a banner', async () => {
    await render(
      <Screen edges={['top']}>
        <Text>Settings</Text>
      </Screen>,
    );

    expect(screen.getByText('Settings')).toBeOnTheScreen();
  });
});
