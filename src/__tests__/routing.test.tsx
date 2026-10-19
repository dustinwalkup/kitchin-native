import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import type { AppVariant } from '@/lib/env-guard';
import { type ColourToken, type Theme, themes } from '@/ui/theme';

// Route tests from specs/mvp/4-test-plan.md §4.2. Tests live outside src/app, where Expo Router
// would treat them as routes.

// The routes read only the variant. Mocking env.ts also skips its EXPO_PUBLIC_* validation.
let mockVariant: AppVariant = 'development';
jest.mock('@/lib/env', () => ({
  get env() {
    return { variant: mockVariant };
  },
}));

// The root layout's auto-refresh hook would create the real Supabase client.
jest.mock('@/lib/auto-refresh', () => ({ useForegroundAutoRefresh: () => {} }));

beforeEach(() => {
  mockVariant = 'development';
});

const { light } = themes;

function tab(name: 'Groceries' | 'Settings') {
  return screen.getByRole('button', { name: new RegExp(`^${name}, tab`) });
}

describe('main tabs', () => {
  it('opens on Groceries (R1.4)', async () => {
    const app = await renderRouter('./src/app');

    expect(app.getPathname()).toBe('/groceries');
    expect(screen.getByText('Your grocery list will appear here.')).toBeOnTheScreen();
  });

  it('has exactly two tabs, Groceries and Settings (C-RTE-06, R1.5)', async () => {
    await renderRouter('./src/app');

    // On iOS, React Navigation gives tab buttons the button role and labels them "…, tab, n of m".
    const tabs = screen.getAllByRole('button', { name: /, tab, \d+ of \d+$/ });
    expect(tabs.map((element) => element.props.accessibilityLabel)).toEqual([
      'Groceries, tab, 1 of 2',
      'Settings, tab, 2 of 2',
    ]);
  });

  it('labels the tabs in bold, cactus when active and inkMuted when not (N13)', async () => {
    await renderRouter('./src/app');

    expect(within(tab('Groceries')).getByText('Groceries')).toHaveStyle({
      color: light.cactus,
      fontWeight: '700',
    });
    expect(within(tab('Settings')).getByText('Settings')).toHaveStyle({
      color: light.inkMuted,
      fontWeight: '700',
    });
  });

  it('switches to Settings', async () => {
    const app = await renderRouter('./src/app');

    await fireEvent.press(tab('Settings'));

    expect(app.getPathname()).toBe('/settings');
    expect(tab('Settings')).toBeSelected();
  });
});

describe('theme preview (C-RTE-07)', () => {
  it('opens from Settings in the development variant (R15.3)', async () => {
    const app = await renderRouter('./src/app', { initialUrl: '/settings' });

    await fireEvent.press(screen.getByRole('button', { name: 'Theme preview' }));

    expect(app.getPathname()).toBe('/theme');
  });

  it('shows every colour token and category pair as a labelled swatch (R15.3)', async () => {
    await renderRouter('./src/app', { initialUrl: '/theme' });

    const colours = (Object.keys(light) as (keyof Theme)[]).filter(
      (key): key is ColourToken => typeof light[key] === 'string',
    );
    expect(colours).toContain('cactus');
    for (const token of colours) expect(screen.getByText(token)).toBeOnTheScreen();
    for (const category of Object.keys(light.category)) {
      expect(screen.getByText(category)).toBeOnTheScreen();
    }
  });

  it("isn't reachable in the production variant (R15.4)", async () => {
    mockVariant = 'production';
    const app = await renderRouter('./src/app', { initialUrl: '/theme' });

    expect(app.getPathname()).toBe('/groceries');

    await act(() => router.push('/theme'));

    expect(app.getPathname()).toBe('/groceries');
  });

  it('has no link in Settings in the production variant (R15.4)', async () => {
    mockVariant = 'production';
    await renderRouter('./src/app', { initialUrl: '/settings' });

    expect(screen.getByText('Environment: production')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Theme preview' })).not.toBeOnTheScreen();
  });
});

describe('DEV badge (C-RTE-07, R24.2)', () => {
  it.each(['/groceries', '/settings', '/theme', '/sign-in'])(
    'shows on %s in the development variant',
    async (initialUrl) => {
      await renderRouter('./src/app', { initialUrl });

      expect(screen.getByLabelText('Development build')).toBeOnTheScreen();
    },
  );

  it.each(['/groceries', '/settings', '/sign-in'])(
    "doesn't show on %s in the production variant",
    async (initialUrl) => {
      mockVariant = 'production';
      await renderRouter('./src/app', { initialUrl });

      expect(screen.queryByLabelText('Development build')).not.toBeOnTheScreen();
    },
  );
});
