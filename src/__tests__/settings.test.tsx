import * as Sentry from '@sentry/react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';

import type { SignOutResult } from '@/features/auth/auth-provider';
import type { AppVariant } from '@/lib/env-guard';
import { queryClient } from '@/lib/query-client';
import { MEMBERSHIP, resetBackend } from '@/test/mock-backend';

// Settings tests C-SET-01–05 (4-test-plan §4.7), and C-SET-06–07 for the start of the week (meals
// 4-test-plan §14.3), on the real routes. The auth provider's sign-out
// rules have their own tests (auth-provider.test.tsx), so here `useAuth` returns a signed-in
// member whose signOut each test controls. Sentry is the global mock from jest-setup.ts.

let mockVariant: AppVariant = 'development';
jest.mock('@/lib/env', () => ({
  get env() {
    return { variant: mockVariant, sentryDsn: null };
  },
}));
// The root layout's auto-refresh hook would create the real Supabase client.
jest.mock('@/lib/auto-refresh', () => ({ useForegroundAutoRefresh: () => {} }));
jest.mock('@/lib/supabase', () => ({
  supabase:
    jest.requireActual<typeof import('@/test/mock-backend')>('@/test/mock-backend').mockSupabase,
}));
jest.mock(
  '@/features/household/api',
  () =>
    jest.requireActual<typeof import('@/test/mock-backend')>('@/test/mock-backend')
      .mockHouseholdApi,
);
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.2.0',
  nativeBuildVersion: '7',
}));

const EMAIL = 'member@example.test';
const mockSignOut = jest.fn<Promise<SignOutResult>, []>();
jest.mock('@/features/auth/auth-provider', () => {
  const { SESSION } =
    jest.requireActual<typeof import('@/test/mock-backend')>('@/test/mock-backend');
  const session = { ...SESSION, user: { ...SESSION.user, email: 'member@example.test' } };
  return {
    ...jest.requireActual('@/features/auth/auth-provider'),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => ({
      state: { status: 'signedIn', session },
      signIn: jest.fn(),
      signOut: mockSignOut,
    }),
  };
});

let alert: jest.SpyInstance;

beforeEach(() => {
  mockVariant = 'development';
  jest.clearAllMocks();
  resetBackend();
  mockSignOut.mockResolvedValue({ ok: true });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  queryClient.clear();
});

async function renderSettings() {
  const app = await renderRouter('./src/app', { initialUrl: '/settings' });
  // The root guards (3.7) open Settings once the membership has loaded.
  await screen.findByText(EMAIL);
  return app;
}

/** Opens the sign-out confirmation and returns its buttons. */
async function openSignOut(): Promise<AlertButton[]> {
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(alert).toHaveBeenCalledTimes(1);
  return alert.mock.calls[0][2];
}

const press = (buttons: AlertButton[], text: string) =>
  act(async () => buttons.find((button) => button.text === text)?.onPress?.());

describe('Settings', () => {
  it('C-SET-01 shows the email, the version with its build, and the environment', async () => {
    await renderSettings();

    expect(screen.getByText(EMAIL)).toBeOnTheScreen();
    expect(screen.getByText('1.2.0 (7)')).toBeOnTheScreen();
    expect(screen.getByText('Development')).toBeOnTheScreen();
  });

  it('C-SET-02 asks before signing out, and Cancel keeps the member signed in', async () => {
    await renderSettings();

    const buttons = await openSignOut();
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Sign out']);
    await press(buttons, 'Cancel');

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('C-SET-02 signs out when confirmed', async () => {
    await renderSettings();

    await press(await openSignOut(), 'Sign out');

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    // The root guards (3.7) leave Settings once the session ends; no message is shown.
    expect(screen.queryByText(/connection|try again/i)).not.toBeOnTheScreen();
  });

  it('C-SET-03 says signing out needs a connection, and stays on Settings', async () => {
    mockSignOut.mockResolvedValue({ ok: false, reason: 'offline' });
    const app = await renderSettings();

    await press(await openSignOut(), 'Sign out');

    expect(screen.getByText('Signing out needs a connection')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/settings');
  });

  it('says to try again when the server fails', async () => {
    mockSignOut.mockResolvedValue({ ok: false, reason: 'server' });
    await renderSettings();

    await press(await openSignOut(), 'Sign out');

    expect(screen.getByText("Couldn't sign out. Try again.")).toBeOnTheScreen();
  });

  it('blocks a second sign-out while one is in progress', async () => {
    let finish!: (result: SignOutResult) => void;
    mockSignOut.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderSettings();

    await press(await openSignOut(), 'Sign out');

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
    await act(async () => finish({ ok: false, reason: 'offline' }));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('C-SET-04 offers the theme preview and the test error in development', async () => {
    await renderSettings();

    expect(screen.getByRole('button', { name: 'Theme preview' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send test error' })).toBeOnTheScreen();
  });

  it('C-SET-04 offers neither in production', async () => {
    mockVariant = 'production';
    await renderSettings();

    expect(screen.getByText('Production')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Theme preview' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Send test error' })).not.toBeOnTheScreen();
  });

  it('C-SET-05 sends a fixed test error through the reporting facade', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Send test error' }));

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Kitchin test error' }),
      { tags: { category: 'test' } },
    );
  });
});

describe('Settings: the start of the week', () => {
  it('C-SET-06 shows the household’s start of the week, and says it’s for the whole household', async () => {
    resetBackend({
      memberships: [{ ...MEMBERSHIP, household: { ...MEMBERSHIP.household, weekStart: 6 } }],
    });
    await renderSettings();

    const row = screen.getByTestId('settings-week-start');
    expect(row).toHaveProp('accessibilityRole', 'button');
    expect(row).toHaveProp('accessibilityLabel', 'Week starts on, Sunday');
    expect(row).toHaveProp('accessibilityHint', 'Changes the first day of the week');
    expect(screen.getByText('Sunday')).toBeOnTheScreen();
    expect(
      screen.getByText('Meals shows weeks from this day, for everyone in the household.'),
    ).toBeOnTheScreen();
  });

  it('C-SET-06 shows Monday for a household that hasn’t changed it', async () => {
    await renderSettings();

    expect(screen.getByTestId('settings-week-start')).toHaveProp(
      'accessibilityLabel',
      'Week starts on, Monday',
    );
  });

  it('C-SET-07 opens the list of days', async () => {
    const app = await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Week starts on, Monday' }));

    expect(app.getPathname()).toBe('/week-start');
    expect(screen.getByTestId('week-start-sun')).toBeOnTheScreen();
  });
});
