import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';
import { Alert, type AlertButton } from 'react-native';

import { onSessionEnd } from '@/features/auth/auth-provider';
import { ApiError } from '@/lib/errors';
import type { AppVariant } from '@/lib/env-guard';
import { queryClient } from '@/lib/query-client';
import {
  emitAuth,
  MEMBERSHIP,
  mockAuth,
  mockHouseholdApi,
  mockRealtime,
  resetBackend,
  SESSION,
} from '@/test/mock-backend';
import { makeAuthError } from '@/test/factories';
import { nativeHeaders } from '@/test/native-header';
import { type ColourToken, type Theme, themes } from '@/ui/theme';

// Route tests from specs/mvp/4-test-plan.md §4.2. Tests live outside src/app, where Expo Router
// would treat them as routes. They render the real root layout and providers, with Supabase Auth
// and the membership query replaced by the mock backend.

// The routes read only the variant. Mocking env.ts also skips its EXPO_PUBLIC_* validation.
let mockVariant: AppVariant = 'development';
jest.mock('@/lib/env', () => ({
  get env() {
    return { variant: mockVariant, sentryDsn: null };
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock(
  '@/features/household/api',
  () => jest.requireActual('@/test/mock-backend').mockHouseholdApi,
);
// Groceries loads an empty list, so the screen settles on its empty state.
jest.mock('@/features/groceries/api', () => ({
  fetchList: jest.fn(async () => ({ listId: 'list-1', rows: [] })),
}));
// Meals loads an empty week.
jest.mock('@/features/meals/api', () => ({
  fetchWeek: jest.fn(async () => []),
  saveEntry: jest.fn(),
  clearEntry: jest.fn(),
}));
// The Meal Library loads an empty library.
jest.mock('@/features/meal-library/api', () => ({
  fetchLibrary: jest.fn(async () => ({ meals: [], tags: [] })),
  runSavePlan: jest.fn(),
  deleteMeal: jest.fn(),
}));
// The root layout's auto-refresh hook would create the real Supabase client.
jest.mock('@/lib/auto-refresh', () => ({ useForegroundAutoRefresh: () => {} }));
// Debug builds log every report; nothing here asserts on them.
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  reportCrash: jest.fn(),
  reportTestError: jest.fn(),
  setReportingUser: jest.fn(),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hide: jest.fn(),
}));

const GROCERIES = 'No items yet';
const OFFLINE_BANNER = "Offline — changes will send when you're back online";

beforeEach(() => {
  mockVariant = 'development';
  resetBackend();
  jest.mocked(SplashScreen.hide).mockClear();
});

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

const { light } = themes;

function tab(name: 'Groceries' | 'Meals' | 'Settings') {
  return screen.getByRole('button', { name: new RegExp(`^${name}, tab`) });
}

const signInButton = () => screen.findByRole('button', { name: 'Sign in' });

/** Presses Sign out, then the given button of its confirmation (R3.5). */
async function signOutAndChoose(choice: 'Sign out' | 'Cancel') {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(alert).toHaveBeenCalledTimes(1);
  const buttons: AlertButton[] = alert.mock.calls[0][2] ?? [];
  alert.mockRestore();
  await act(async () => buttons.find((button) => button.text === choice)?.onPress?.());
}

/** Renders the app and waits for it to leave the splash and show `text`. */
async function renderApp(initialUrl?: string, text: string | RegExp = GROCERIES) {
  const app = await renderRouter('./src/app', initialUrl ? { initialUrl } : undefined);
  await screen.findByText(text);
  return app;
}

/** Renders the app on Settings, whose content task 3.8 owns, so it waits for the tab bar. */
async function renderSettings() {
  const app = await renderRouter('./src/app', { initialUrl: '/settings' });
  await screen.findByRole('button', { name: /^Settings, tab/ });
  return app;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('guards (§2.4)', () => {
  it('C-RTE-01 renders no screen and keeps the splash while the session restores', async () => {
    resetBackend({ session: 'pending' });
    await renderRouter('./src/app');
    await act(async () => {});

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeOnTheScreen();
    expect(screen.queryByText(GROCERIES)).not.toBeOnTheScreen();
    expect(SplashScreen.hide).not.toHaveBeenCalled();

    await act(() => emitAuth('INITIAL_SESSION', null));

    expect(await signInButton()).toBeOnTheScreen();
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
  });

  it('R1.1 keeps the splash while the membership loads at launch', async () => {
    const memberships = deferred<(typeof MEMBERSHIP)[]>();
    mockHouseholdApi.fetchMemberships.mockReturnValue(memberships.promise);
    await renderRouter('./src/app');
    await act(async () => {});

    expect(mockHouseholdApi.fetchMemberships).toHaveBeenCalledWith('user-a');
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeOnTheScreen();
    expect(SplashScreen.hide).not.toHaveBeenCalled();

    await act(async () => memberships.resolve([MEMBERSHIP]));

    expect(await screen.findByText(GROCERIES)).toBeOnTheScreen();
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
  });

  it('C-RTE-02 shows sign-in without a session, and asks for no membership', async () => {
    resetBackend({ session: null });
    const app = await renderApp(undefined, 'Kitchin');

    expect(app.getPathname()).toBe('/sign-in');
    expect(await signInButton()).toBeOnTheScreen();
    expect(mockHouseholdApi.fetchMemberships).not.toHaveBeenCalled();
  });

  it('C-RTE-03 shows "No household access" without a membership, and queries nothing else', async () => {
    resetBackend({ memberships: [] });
    const app = await renderApp(undefined, 'No household access');

    expect(app.getPathname()).toBe('/no-household');
    expect(
      screen.getByText("This account isn't linked to a household yet. Ask the owner to set it up."),
    ).toBeOnTheScreen();
    // Only membership queries exist: the signed-in one, and the disabled one from before sign-in.
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toContainEqual(['membership', 'user-a']);
    expect(keys.every(([scope]) => scope === 'membership')).toBe(true);
  });

  it('C-RTE-04 opens on Groceries with a membership (R1.4)', async () => {
    const app = await renderApp();

    expect(app.getPathname()).toBe('/groceries');
  });

  it("C-RTE-05 shows Can't reach Kitchin when the membership fails to load, and Retry recovers", async () => {
    mockHouseholdApi.fetchMemberships.mockRejectedValue(new ApiError('server', { status: 500 }));
    const app = await renderApp(undefined, "Can't reach Kitchin");

    expect(app.getPathname()).toBe('/unreachable');

    mockHouseholdApi.fetchMemberships.mockResolvedValue([MEMBERSHIP]);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(GROCERIES)).toBeOnTheScreen();
  });

  it('C-RTE-05 is unreachable while offline at launch, with the banner, until back online', async () => {
    onlineManager.setOnline(false);
    await renderApp(undefined, "Can't reach Kitchin");

    expect(screen.getByText(OFFLINE_BANNER)).toBeOnTheScreen();
    expect(mockHouseholdApi.fetchMemberships).not.toHaveBeenCalled();

    await act(() => onlineManager.setOnline(true));

    expect(await screen.findByText(GROCERIES)).toBeOnTheScreen();
  });

  it('R2.7 routes to Groceries after sign-in, keeping sign-in up while the membership loads', async () => {
    resetBackend({ session: null });
    const memberships = deferred<(typeof MEMBERSHIP)[]>();
    mockHouseholdApi.fetchMemberships.mockReturnValue(memberships.promise);
    const app = await renderApp(undefined, 'Kitchin');

    await fireEvent.changeText(screen.getByLabelText('Email'), 'member@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await fireEvent.press(await signInButton());

    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'secret',
    });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeBusy();

    await act(async () => memberships.resolve([MEMBERSHIP]));

    expect(await screen.findByText(GROCERIES)).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/groceries');
  });

  it('C-RTE-08 signing out shows sign-in without a message, after the session-end callbacks', async () => {
    resetBackend({ memberships: [] });
    const ended = jest.fn();
    const unregister = onSessionEnd(ended);
    try {
      await renderApp(undefined, 'No household access');

      await signOutAndChoose('Sign out');

      expect(mockAuth.admin.signOut).toHaveBeenCalledWith(SESSION.access_token, 'local');
      expect(await signInButton()).toBeOnTheScreen();
      expect(screen.queryByText('Please sign in again')).not.toBeOnTheScreen();
      // renderRouter turns on fake timers, which waitFor advances past the deferred clean-up.
      await waitFor(() => expect(ended).toHaveBeenCalledTimes(1));
    } finally {
      unregister();
    }
  });

  it('R3.5 keeps the member signed in when they cancel the confirmation', async () => {
    resetBackend({ memberships: [] });
    const app = await renderApp(undefined, 'No household access');

    await signOutAndChoose('Cancel');

    expect(mockAuth.admin.signOut).not.toHaveBeenCalled();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/no-household');
  });

  it('R3.9 stays put and says so when signing out needs a connection', async () => {
    mockHouseholdApi.fetchMemberships.mockRejectedValue(new ApiError('server', {}));
    mockAuth.admin.signOut.mockResolvedValue({
      data: null,
      error: makeAuthError('retryable_fetch'),
    });
    const app = await renderApp(undefined, "Can't reach Kitchin");

    await signOutAndChoose('Sign out');

    expect(await screen.findByText('Signing out needs a connection')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/unreachable');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it('C-RTE-09 shows "Please sign in again" when the session expires', async () => {
    const app = await renderApp();

    await act(() => emitAuth('SIGNED_OUT', null));

    expect(await screen.findByText('Please sign in again')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/sign-in');
    expect(screen.queryByText(GROCERIES)).not.toBeOnTheScreen();
  });

  it("doesn't let a signed-out member open a household screen", async () => {
    resetBackend({ session: null });
    const app = await renderApp('/settings', 'Kitchin');

    expect(app.getPathname()).toBe('/sign-in');

    await act(() => router.push('/groceries'));

    expect(app.getPathname()).toBe('/sign-in');
  });
});

describe('main tabs', () => {
  it('has exactly three tabs, Groceries, Meals and Settings (C-RTE-06, R1.5 amended)', async () => {
    const app = await renderApp();

    // On iOS, React Navigation gives tab buttons the button role and labels them "…, tab, n of m".
    const tabs = screen.getAllByRole('button', { name: /, tab, \d+ of \d+$/ });
    expect(tabs.map((element) => element.props.accessibilityLabel)).toEqual([
      'Groceries, tab, 1 of 3',
      'Meals, tab, 2 of 3',
      'Settings, tab, 3 of 3',
    ]);
    // Still opens on Groceries (C-RTE-04, K16).
    expect(app.getPathname()).toBe('/groceries');
    expect(tab('Groceries')).toBeSelected();
  });

  it('labels the tabs in bold, cactus when active and inkMuted when not (N13)', async () => {
    await renderApp();

    expect(within(tab('Groceries')).getByText('Groceries')).toHaveStyle({
      color: light.cactus,
      fontWeight: '700',
    });
    for (const name of ['Meals', 'Settings'] as const) {
      expect(within(tab(name)).getByText(name)).toHaveStyle({
        color: light.inkMuted,
        fontWeight: '700',
      });
    }
  });

  it('C-RTE-10 turns the active Meals tab terracotta, in bold (R36.1, DD36)', async () => {
    const app = await renderApp();

    await fireEvent.press(tab('Meals'));

    expect(app.getPathname()).toBe('/meals');
    expect(tab('Meals')).toBeSelected();
    expect(within(tab('Meals')).getByText('Meals')).toHaveStyle({
      color: light.accent,
      fontWeight: '700',
    });
    expect(within(tab('Groceries')).getByText('Groceries')).toHaveStyle({
      color: light.inkMuted,
    });

    await fireEvent.press(tab('Groceries'));

    expect(within(tab('Groceries')).getByText('Groceries')).toHaveStyle({ color: light.cactus });
    expect(within(tab('Meals')).getByText('Meals')).toHaveStyle({ color: light.inkMuted });
  });

  it('switches to Settings', async () => {
    const app = await renderApp();

    await fireEvent.press(tab('Settings'));

    expect(app.getPathname()).toBe('/settings');
    expect(tab('Settings')).toBeSelected();
  });
});

describe('theme preview (C-RTE-07)', () => {
  it('opens from Settings in the development variant (R15.3)', async () => {
    const app = await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Theme preview' }));

    expect(app.getPathname()).toBe('/theme');
  });

  it('shows every colour token and category pair as a labelled swatch (R15.3)', async () => {
    await renderApp('/theme', 'cactus');

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
    const app = await renderApp('/theme');

    expect(app.getPathname()).toBe('/groceries');

    await act(() => router.push('/theme'));

    expect(app.getPathname()).toBe('/groceries');
  });

  it('has no link in Settings in the production variant (R15.4)', async () => {
    mockVariant = 'production';
    const app = await renderSettings();

    expect(app.getPathname()).toBe('/settings');
    expect(screen.queryByRole('button', { name: 'Theme preview' })).not.toBeOnTheScreen();
  });
});

describe('DEV badge (C-RTE-07, R24.2)', () => {
  it.each([
    ['/groceries', GROCERIES],
    ['/theme', 'cactus'],
  ])('shows on %s in the development variant', async (initialUrl, text) => {
    await renderApp(initialUrl, text);

    expect(screen.getByLabelText('Development build')).toBeOnTheScreen();
  });

  it('shows on /settings in the development variant', async () => {
    await renderSettings();

    expect(screen.getByLabelText('Development build')).toBeOnTheScreen();
  });

  it('shows on sign-in in the development variant', async () => {
    resetBackend({ session: null });
    await renderApp('/sign-in', 'Kitchin');

    expect(screen.getByLabelText('Development build')).toBeOnTheScreen();
  });

  it("doesn't show on /groceries in the production variant", async () => {
    mockVariant = 'production';
    await renderApp('/groceries');

    expect(screen.queryByLabelText('Development build')).not.toBeOnTheScreen();
  });

  it("doesn't show on /settings in the production variant", async () => {
    mockVariant = 'production';
    await renderSettings();

    expect(screen.queryByLabelText('Development build')).not.toBeOnTheScreen();
  });

  it("doesn't show on sign-in in the production variant", async () => {
    mockVariant = 'production';
    resetBackend({ session: null });
    await renderApp('/sign-in', 'Kitchin');

    expect(screen.queryByLabelText('Development build')).not.toBeOnTheScreen();
  });
});

describe('live updates', () => {
  it('joins the household channel on the household screens and removes it on sign-out (§3.6)', async () => {
    await renderApp();
    await waitFor(() =>
      expect(mockRealtime.channel).toHaveBeenCalledWith(`household:${MEMBERSHIP.household.id}`, {
        config: { private: true },
      }),
    );
    const channel = mockRealtime.latest();

    await act(() => emitAuth('SIGNED_OUT', null));

    await waitFor(() => expect(mockRealtime.removeChannel).toHaveBeenCalledWith(channel));
    expect(mockRealtime.channels).toHaveLength(1);
  });

  it('opens no channel without a household', async () => {
    resetBackend({ memberships: [] });
    await renderApp(undefined, 'No household access');

    expect(mockRealtime.realtime.setAuth).not.toHaveBeenCalled();
    expect(mockRealtime.channel).not.toHaveBeenCalled();
  });
});

describe('add-item sheet (§3.4, DD10)', () => {
  it('opens from the "＋" on Groceries as /add-item, and Done closes it', async () => {
    const app = await renderApp();

    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByRole('header', { name: 'Add item' })).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/add-item');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(app.getPathname()).toBe('/groceries'));
  });
});

describe('meal library routes (C-RTE-11)', () => {
  it('opens /meal-library under (app), titled "Meal Library" with Back to Meals (§3.8)', async () => {
    const app = await renderApp('/meal-library', 'No saved meals yet');

    expect(app.getPathname()).toBe('/meal-library');
    expect(nativeHeaders()).toContainEqual(
      expect.objectContaining({ title: 'Meal Library', backTitle: 'Meals' }),
    );
  });

  it("isn't reachable while signed out (R1.2)", async () => {
    resetBackend({ session: null });
    const app = await renderApp('/settings', 'Kitchin');

    await act(() => router.push('/meal-library'));

    expect(app.getPathname()).toBe('/sign-in');
    expect(screen.queryByText('No saved meals yet')).not.toBeOnTheScreen();
  });
});
