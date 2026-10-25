import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { AuthProvider } from '@/features/auth/auth-provider';
import { QUIET_MS } from '@/lib/realtime/coalescer';
import { emitAuth, mockRealtime, resetBackend } from '@/test/mock-backend';

import type { HouseholdState } from './household-provider';
import {
  type TableChangeHandler,
  type TableHandlers,
  useHouseholdRealtime,
  useRealtimeStatus,
} from './use-household-realtime';

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock('@/lib/reporting', () => ({ report: jest.fn(), setReportingUser: jest.fn() }));

const HOUSEHOLD_ID = 'household-1';
const READY: HouseholdState = {
  status: 'ready',
  household: { id: HOUSEHOLD_ID, name: 'Household One', timeZone: 'America/Denver', weekStart: 0 },
  member: { userId: 'user-a', displayName: 'Member A' },
};

let mockHousehold: HouseholdState = READY;
jest.mock('./household-provider', () => ({ useHousehold: () => mockHousehold }));

const START = new Date('2026-10-19T10:00:00Z').getTime();

const groceries = jest.fn<void, Parameters<TableChangeHandler>>();
const other = jest.fn<void, Parameters<TableChangeHandler>>();
const HANDLERS: TableHandlers = {
  grocery_items: groceries,
  grocery_lists: groceries,
  other_table: other,
};

// A mocked AppState emitter (4-test-plan §8.4).
let appStateListeners: ((state: AppStateStatus) => void)[] = [];
const emitAppState = (state: AppStateStatus) => appStateListeners.forEach((l) => l(state));

let queryClient: QueryClient;

beforeEach(() => {
  jest.useFakeTimers({ now: START });
  jest.clearAllMocks();
  resetBackend();
  mockHousehold = READY;
  queryClient = new QueryClient();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return {
      remove: () => (appStateListeners = appStateListeners.filter((other) => other !== listener)),
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

/** Renders the hook and lets the session restore and the channel's join finish. */
async function renderRealtime() {
  const rendered = await renderHook(
    () => {
      useHouseholdRealtime(HANDLERS);
      return useRealtimeStatus();
    },
    { wrapper },
  );
  await act(() => jest.runOnlyPendingTimersAsync());
  return rendered;
}

const message = (table: string) => ({
  type: 'broadcast' as const,
  event: 'UPDATE',
  payload: { table },
});

describe('useHouseholdRealtime', () => {
  it('joins the household’s channel once the household is ready', async () => {
    mockHousehold = { status: 'loading' };
    const { rerender } = await renderRealtime();
    expect(mockRealtime.channel).not.toHaveBeenCalled();

    mockHousehold = READY;
    await rerender({});
    await act(() => jest.runOnlyPendingTimersAsync());

    expect(mockRealtime.channel).toHaveBeenCalledTimes(1);
    expect(mockRealtime.latest().topic).toBe(`household:${HOUSEHOLD_ID}`);
  });

  it('runs each table’s handler once per burst, after coalescing (R11.4)', async () => {
    await renderRealtime();
    const channel = mockRealtime.latest();

    for (let i = 0; i < 20; i++) channel.emitBroadcast(message('grocery_items'));
    channel.emitBroadcast(message('grocery_lists'));
    channel.emitBroadcast(message('unknown_table'));
    expect(groceries).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS));

    // Both grocery tables share a handler, so it runs once.
    expect(groceries).toHaveBeenCalledTimes(1);
    expect(groceries).toHaveBeenCalledWith(queryClient, HOUSEHOLD_ID);
    expect(other).not.toHaveBeenCalled();
  });

  it('reloads the household’s queries when the channel rejoins after a disconnect (R11.3)', async () => {
    await renderRealtime();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const channel = mockRealtime.latest();

    await act(() => channel.emitStatus('SUBSCRIBED'));
    expect(invalidate).not.toHaveBeenCalled();
    await act(() => channel.emitStatus('CHANNEL_ERROR'));
    await act(() => channel.emitStatus('SUBSCRIBED'));

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['household', HOUSEHOLD_ID] });
  });

  it('shares the channel’s status through useRealtimeStatus', async () => {
    const { result } = await renderRealtime();
    expect(result.current).toEqual({ status: 'connecting', since: START });

    await act(() => mockRealtime.latest().emitStatus('SUBSCRIBED'));
    expect(result.current).toEqual({ status: 'connected', since: START });

    await act(() => jest.advanceTimersByTimeAsync(4_000));
    await act(() => mockRealtime.latest().emitStatus('CHANNEL_ERROR'));
    expect(result.current).toEqual({ status: 'disconnected', since: START + 4_000 });
  });

  it('re-creates a dropped channel when the app becomes active, and not in the background', async () => {
    await renderRealtime();
    await act(() => mockRealtime.latest().emitStatus('CHANNEL_ERROR'));

    await act(async () => emitAppState('background'));
    await act(async () => emitAppState('inactive'));
    expect(mockRealtime.channels).toHaveLength(1);

    await act(async () => emitAppState('active'));
    expect(mockRealtime.removeChannel).toHaveBeenCalledTimes(1);
    expect(mockRealtime.channels).toHaveLength(2);
  });

  it('stops on unmount: the channel goes, and waiting events never apply', async () => {
    const { unmount } = await renderRealtime();
    const channel = mockRealtime.latest();
    channel.emitBroadcast(message('grocery_items'));

    await unmount();
    await act(() => jest.advanceTimersByTimeAsync(5_000));

    expect(mockRealtime.removeChannel).toHaveBeenCalledWith(channel);
    expect(groceries).not.toHaveBeenCalled();
    expect(appStateListeners).toHaveLength(0);
  });

  it('U-CH-07 removes the channel before the cache is cleared when the session ends', async () => {
    await renderRealtime();
    const channel = mockRealtime.latest();
    const clear = jest.spyOn(queryClient, 'clear');
    channel.emitBroadcast(message('grocery_items'));

    // The hook stays mounted here, so only the session-end callback can stop it.
    await act(() => emitAuth('SIGNED_OUT', null));
    await act(() => jest.runOnlyPendingTimersAsync());

    expect(mockRealtime.removeChannel).toHaveBeenCalledWith(channel);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(mockRealtime.removeChannel.mock.invocationCallOrder[0]).toBeLessThan(
      clear.mock.invocationCallOrder[0],
    );
    // The event that was waiting never refetches for the next account.
    await act(() => jest.advanceTimersByTimeAsync(5_000));
    expect(groceries).not.toHaveBeenCalled();
  });
});
