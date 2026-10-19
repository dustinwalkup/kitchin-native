import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { reportOnce } from '@/lib/reporting';
import { mockRealtime, resetBackend } from '@/test/mock-backend';

import type { HouseholdState } from './household-provider';
import {
  DEGRADED_AFTER_MS,
  RECONNECTING_AFTER_MS,
  useReconnectingIndicator,
  useRealtimeDegradedReport,
} from './use-connection-state';
import { type TableHandlers, useHouseholdRealtime } from './use-household-realtime';

// U-RT-03 to U-RT-05 (4-test-plan §3.12). The real household channel runs against the fake
// socket, so the status, and when it began, come from the channel itself.

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  setReportingUser: jest.fn(),
}));

const READY: HouseholdState = {
  status: 'ready',
  household: { id: 'household-1', name: 'Household One', timeZone: 'America/Denver' },
  member: { userId: 'user-a', displayName: 'Member A' },
};
jest.mock('./household-provider', () => ({ useHousehold: () => READY }));

const NO_HANDLERS: TableHandlers = {};

// A mocked AppState emitter (4-test-plan §8.4). The channel and the foreground clock both listen.
let appStateListeners: ((state: AppStateStatus) => void)[] = [];
const emitAppState = (state: AppStateStatus) =>
  act(async () => appStateListeners.forEach((l) => l(state)));

const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

// The preset's AppState mock has a function for `currentState`, which jest.replaceProperty refuses.
const presetCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-19T10:00:00Z') });
  jest.clearAllMocks();
  resetBackend();
  appStateListeners = [];
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return {
      remove: () => (appStateListeners = appStateListeners.filter((other) => other !== listener)),
    };
  });
});

afterEach(() => {
  Object.defineProperty(AppState, 'currentState', presetCurrentState);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

/** Mounts what the (app) layout and the Groceries header do, and joins the channel. */
async function renderConnectionState() {
  const rendered = await renderHook(
    () => {
      useHouseholdRealtime(NO_HANDLERS);
      useRealtimeDegradedReport();
      return useReconnectingIndicator();
    },
    { wrapper },
  );
  await act(() => jest.runOnlyPendingTimersAsync());
  await act(() => mockRealtime.latest().emitStatus('SUBSCRIBED'));
  return rendered;
}

const disconnect = () => act(() => mockRealtime.latest().emitStatus('CHANNEL_ERROR'));
const reconnect = () => act(() => mockRealtime.latest().emitStatus('SUBSCRIBED'));

describe('useReconnectingIndicator', () => {
  it('U-RT-03 shows after 3 s down and hides on reconnect (R13.4)', async () => {
    const { result } = await renderConnectionState();
    expect(result.current).toBe(false);

    await disconnect();
    await advance(RECONNECTING_AFTER_MS - 1);
    expect(result.current).toBe(false);
    await advance(1);
    expect(result.current).toBe(true);

    await reconnect();
    expect(result.current).toBe(false);
  });

  it('times the whole outage while supabase-js retries', async () => {
    const { result } = await renderConnectionState();

    await disconnect();
    await advance(2_000);
    await act(() => mockRealtime.latest().emitStatus('TIMED_OUT'));
    await advance(RECONNECTING_AFTER_MS - 2_000);

    expect(result.current).toBe(true);
  });

  it('starts a fresh 3 s for the next outage', async () => {
    const { result } = await renderConnectionState();
    await disconnect();
    await advance(RECONNECTING_AFTER_MS);
    await reconnect();

    await disconnect();
    expect(result.current).toBe(false);
    await advance(RECONNECTING_AFTER_MS);
    expect(result.current).toBe(true);
  });

  it('U-RT-04 stays hidden in the background (R13.4)', async () => {
    const { result } = await renderConnectionState();

    await emitAppState('background');
    await disconnect();
    await advance(60_000);
    expect(result.current).toBe(false);

    // 'inactive', such as the app switcher, counts as away too.
    await emitAppState('inactive');
    await advance(60_000);
    expect(result.current).toBe(false);
  });

  it('gives the channel 3 s to rejoin after the app returns', async () => {
    const { result } = await renderConnectionState();
    await disconnect();
    await emitAppState('background');
    await advance(60_000);

    // Coming back re-creates the channel. The outage is old, but the clock starts now.
    await emitAppState('active');
    expect(mockRealtime.channels).toHaveLength(2);
    expect(result.current).toBe(false);
    await advance(RECONNECTING_AFTER_MS - 1);
    expect(result.current).toBe(false);
    await advance(1);
    expect(result.current).toBe(true);

    await reconnect();
    expect(result.current).toBe(false);
  });

  it('hides when the channel stops', async () => {
    const { result, unmount } = await renderConnectionState();
    await disconnect();
    await advance(RECONNECTING_AFTER_MS);
    expect(result.current).toBe(true);

    await unmount();

    // A later screen starts from 'connecting', as the next session's channel does.
    const next = await renderHook(useReconnectingIndicator, { wrapper });
    await advance(RECONNECTING_AFTER_MS);
    expect(next.result.current).toBe(false);
  });
});

describe('useRealtimeDegradedReport', () => {
  it('U-RT-05 reports realtime_degraded after 120 s down in the foreground (R26.1)', async () => {
    await renderConnectionState();

    await disconnect();
    await advance(DEGRADED_AFTER_MS - 1);
    expect(reportOnce).not.toHaveBeenCalled();
    await advance(1);

    expect(reportOnce).toHaveBeenCalledTimes(1);
    expect(reportOnce).toHaveBeenCalledWith('realtime_degraded', {
      channelStatus: 'disconnected',
    });
    // The outage goes on, and nothing more is sent.
    await advance(10 * 60_000);
    expect(reportOnce).toHaveBeenCalledTimes(1);
  });

  it('U-RT-05 reports once per session, however many outages there are (R26.1)', async () => {
    jest.mocked(reportOnce).mockImplementation(jest.requireActual('@/lib/reporting').reportOnce);
    jest.spyOn(console, 'warn').mockImplementation(() => {}); // the debug build's log of the report
    await renderConnectionState();

    for (let outage = 0; outage < 2; outage++) {
      await disconnect();
      await advance(DEGRADED_AFTER_MS);
      await reconnect();
    }

    expect(reportOnce).toHaveBeenCalledTimes(2);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith('realtime_degraded', {
      level: 'warning',
      extra: { channelStatus: 'disconnected' },
    });
  });

  it('U-RT-05 never reports while the app is in the background (R26.1)', async () => {
    await renderConnectionState();

    await disconnect();
    await advance(DEGRADED_AFTER_MS - 10_000);
    await emitAppState('background');
    await advance(30 * 60_000);
    expect(reportOnce).not.toHaveBeenCalled();

    // Back in the foreground, still down: the 2 minutes count from the return.
    await emitAppState('active');
    await advance(DEGRADED_AFTER_MS - 1);
    expect(reportOnce).not.toHaveBeenCalled();
    await advance(1);
    expect(reportOnce).toHaveBeenCalledTimes(1);
  });

  it('doesn’t report an outage that ends within 2 minutes', async () => {
    await renderConnectionState();

    await disconnect();
    await advance(DEGRADED_AFTER_MS - 1);
    await reconnect();
    await advance(DEGRADED_AFTER_MS);

    expect(reportOnce).not.toHaveBeenCalled();
  });
});
