import { onlineManager } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react-native';

import { Banner } from './banner';
import { Card } from './card';
import { DevBadge } from './dev-badge';
import { Pill } from './pill';
import { Screen } from './screen';
import { Text } from './text';
import { themes } from './theme';

// The display-only primitives: Banner, Pill, Card, DevBadge and Screen. CountBadge, which replaced
// CategoryBadge, has its own tests.

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
  it('shows its label in inkMuted on the sunken tone, after a terracotta dot', async () => {
    await render(<Pill label="Reconnecting…" />);

    const label = screen.getByText('Reconnecting…');
    const pill = label.parent!;
    const [dot, text] = pill.children.filter((child) => typeof child !== 'string');
    expect(text).toBe(label);
    expect(label).toHaveStyle({ color: light.inkMuted });
    expect(pill).toHaveStyle({ backgroundColor: light.sunken, borderRadius: 999 });
    expect(dot).toHaveStyle({ backgroundColor: light.accent });
  });
});

describe('Card', () => {
  it('DD-R2 is a white surface with the card radius and no border or shadow', async () => {
    await render(
      <Card>
        <Text>Inside</Text>
      </Card>,
    );

    const card = screen.getByText('Inside').parent!;
    expect(card).toHaveStyle({
      backgroundColor: light.background,
      borderRadius: light.radius.card,
    });
    expect(card).not.toHaveStyle({ borderWidth: expect.anything() });
    expect(card).not.toHaveStyle({ shadowOpacity: expect.anything() });
  });

  it('takes a style after its own', async () => {
    await render(
      <Card style={{ padding: 0 }}>
        <Text>Inside</Text>
      </Card>,
    );

    expect(screen.getByText('Inside').parent).toHaveStyle({ padding: 0 });
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
  const OFFLINE = "Offline — changes will send when you're back online";

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('renders its content on the screen background, with no banner while online', async () => {
    await render(
      <Screen edges={['top']}>
        <Text>Settings</Text>
      </Screen>,
    );

    expect(screen.root).toHaveStyle({ backgroundColor: light.screen });
    expect(screen.getByText('Settings')).toBeOnTheScreen();
    expect(screen.queryByText(OFFLINE)).not.toBeOnTheScreen();
  });

  it('R13.1 shows the offline banner above its content while offline', async () => {
    await render(
      <Screen>
        <Text>Groceries</Text>
      </Screen>,
    );

    await act(() => onlineManager.setOnline(false));

    const [banner, content] = screen.root!.children.filter((child) => typeof child !== 'string');
    expect(within(banner).getByText(OFFLINE)).toBeOnTheScreen();
    expect(within(content).getByText('Groceries')).toBeOnTheScreen();

    await act(() => onlineManager.setOnline(true));
    expect(screen.queryByText(OFFLINE)).not.toBeOnTheScreen();
  });
});
