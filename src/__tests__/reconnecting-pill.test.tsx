import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import { RECONNECTING_AFTER_MS } from '@/features/household/use-connection-state';
import { queryClient } from '@/lib/query-client';
import { mockRealtime, resetBackend } from '@/test/mock-backend';

// C-NET-02 (4-test-plan §4.8): the real routes, with the household channel on the fake socket.

jest.mock('@/lib/env', () => ({ env: { variant: 'production', sentryDsn: null } }));
jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock(
  '@/features/household/api',
  () => jest.requireActual('@/test/mock-backend').mockHouseholdApi,
);
jest.mock('@/features/groceries/api', () => ({
  fetchList: jest.fn(async () => ({ listId: 'list-1', rows: [] })),
}));
jest.mock('@/lib/auto-refresh', () => ({ useForegroundAutoRefresh: () => {} }));
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  reportCrash: jest.fn(),
  setReportingUser: jest.fn(),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hide: jest.fn(),
}));

const RECONNECTING = 'Reconnecting…';

// The preset's AppState mock has a function for `currentState`, which jest.replaceProperty refuses.
const presetCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;

beforeEach(() => {
  resetBackend();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});

afterEach(() => {
  Object.defineProperty(AppState, 'currentState', presetCurrentState);
  queryClient.clear();
  jest.useRealTimers();
});

/** Opens Groceries, then joins the channel. Timers are fake from here on. */
async function renderGroceries() {
  await renderRouter('./src/app', { initialUrl: '/groceries' });
  await screen.findByRole('button', { name: /^Groceries, tab/ });
  jest.useFakeTimers();
  await act(() => mockRealtime.latest().emitStatus('SUBSCRIBED'));
}

describe('the reconnecting pill', () => {
  it('C-NET-02 shows "Reconnecting…" in the Groceries header after 3 s down (R13.4)', async () => {
    await renderGroceries();
    expect(screen.queryByText(RECONNECTING)).toBeNull();

    await act(() => mockRealtime.latest().emitStatus('CHANNEL_ERROR'));
    await act(() => jest.advanceTimersByTimeAsync(RECONNECTING_AFTER_MS - 1));
    expect(screen.queryByText(RECONNECTING)).toBeNull();
    await act(() => jest.advanceTimersByTimeAsync(1));
    expect(screen.getByText(RECONNECTING)).toBeOnTheScreen();

    await act(() => mockRealtime.latest().emitStatus('SUBSCRIBED'));
    expect(screen.queryByText(RECONNECTING)).toBeNull();
  });

  it("isn't in the Settings header", async () => {
    await renderGroceries();
    await act(() => mockRealtime.latest().emitStatus('CHANNEL_ERROR'));
    await act(() => jest.advanceTimersByTimeAsync(RECONNECTING_AFTER_MS));
    expect(screen.getByText(RECONNECTING)).toBeOnTheScreen();

    await act(() => router.push('/settings'));

    expect(screen.queryByText(RECONNECTING)).not.toBeVisible();
  });
});
