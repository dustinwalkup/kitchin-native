import * as Sentry from '@sentry/react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { queryClient } from '@/lib/query-client';
import { resetBackend } from '@/test/mock-backend';

// Route tests C-ERR-01–03 (4-test-plan §4.8): the real app, with one screen swapped for one that
// throws while `mockThrowing` is set. Sentry is the global mock from jest-setup.ts.

jest.mock('@/lib/env', () => ({ env: { variant: 'development', sentryDsn: null } }));
// The root layout's auto-refresh hook would create the real Supabase client.
jest.mock('@/lib/auto-refresh', () => ({ useForegroundAutoRefresh: () => {} }));
// A signed-in member with a household, so the guards open the (app) screens.
jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock(
  '@/features/household/api',
  () => jest.requireActual('@/test/mock-backend').mockHouseholdApi,
);

const MESSAGE = 'Could not render Milk';
let mockThrowing = true;

function Flaky() {
  if (mockThrowing) throw new Error(MESSAGE);
  return <Text>Rendered again</Text>;
}

beforeEach(() => {
  mockThrowing = true;
  jest.clearAllMocks();
  resetBackend();
  // React logs every error a boundary catches.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  queryClient.clear();
});

async function renderWithFlaky(route: string, initialUrl: string) {
  await renderRouter({ appDir: './src/app', overrides: { [route]: Flaky } }, { initialUrl });
  // The guards open a screen once the session and membership have loaded.
  await screen.findByText(/Something went wrong|Rendered again/);
}

describe('the (app) error boundary', () => {
  it('C-ERR-01 shows the crash screen in place of a tab while the root stays mounted', async () => {
    await renderWithFlaky('(app)/(tabs)/groceries', '/groceries');

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    // The root layout draws the DEV badge outside the (app) group.
    expect(screen.getByText('DEV')).toBeOnTheScreen();
  });

  it('C-ERR-02 renders the screen again on Try again', async () => {
    await renderWithFlaky('(app)/(tabs)/groceries', '/groceries');

    mockThrowing = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Rendered again')).toBeOnTheScreen();
    expect(screen.queryByText('Something went wrong')).not.toBeOnTheScreen();
  });

  it('C-ERR-03 shows no error details, and reports the error as a crash', async () => {
    await renderWithFlaky('(app)/(tabs)/groceries', '/groceries');

    expect(screen.queryByText(MESSAGE, { exact: false })).not.toBeOnTheScreen();
    expect(screen.queryByText(/Error|at |\.tsx/)).not.toBeOnTheScreen();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: MESSAGE }),
      { tags: { category: 'crash' } },
    );
  });
});

describe('the root error boundary', () => {
  it('catches a screen outside the (app) group', async () => {
    resetBackend({ session: null });
    await renderWithFlaky('sign-in', '/sign-in');

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(screen.queryByText('DEV')).not.toBeOnTheScreen();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
