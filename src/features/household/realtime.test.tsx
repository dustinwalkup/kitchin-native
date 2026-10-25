import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { MAX_WAIT_MS, QUIET_MS } from '@/lib/realtime/coalescer';
import { mockRealtime, resetBackend } from '@/test/mock-backend';

import { updateWeekStart } from './api';
import { householdTableHandlers, onHouseholdTableChange } from './realtime';
import { useHouseholdRealtime } from './use-household-realtime';
import { MEMBERSHIP_KEY } from './keys';
import { useSetWeekStart } from './use-week-start';

// U-WKS-10 and U-WKS-11 (specs/meals/4-test-plan.md §14.2). The household channel runs against the
// fake socket with the household's handlers, as the (app) layout passes them.

jest.mock('@/lib/supabase', () => ({
  supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
}));
jest.mock('./api', () => ({ fetchMemberships: jest.fn(), updateWeekStart: jest.fn() }));
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  setReportingUser: jest.fn(),
}));
jest.mock('./household-provider', () => ({
  useHousehold: () => ({ status: 'ready', household: { id: 'household-1' } }),
}));

const HOUSEHOLD_ID = 'household-1';
const MEMBERSHIP = [...MEMBERSHIP_KEY, 'user-a'];
const OTHER_KEYS = [
  ['household', HOUSEHOLD_ID, 'meals', 'week', '2026-10-19'],
  ['household', HOUSEHOLD_ID, 'grocery', 'list'],
  ['household', HOUSEHOLD_ID, 'library'],
];

const event = (table: string) => ({
  type: 'broadcast' as const,
  event: 'UPDATE',
  payload: { table },
});

let queryClient: QueryClient;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetBackend();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } },
  });
  queryClient.setQueryData(MEMBERSHIP, []);
  for (const key of OTHER_KEYS) queryClient.setQueryData(key, []);
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

function useHouseholdWithRealtime() {
  useHouseholdRealtime(householdTableHandlers);
  return useSetWeekStart();
}

async function renderHousehold() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(useHouseholdWithRealtime, { wrapper });
  await waitFor(() => expect(mockRealtime.channels).toHaveLength(1));
  return hook;
}

describe('householdTableHandlers', () => {
  it('sends households to onHouseholdTableChange', () => {
    expect(householdTableHandlers).toEqual({ households: onHouseholdTableChange });
  });
});

describe('onHouseholdTableChange', () => {
  it('U-WKS-10 refetches the household, and leaves the meal, grocery and library queries alone', async () => {
    await renderHousehold();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    // The other phone changes the start of the week.
    mockRealtime.latest().emitBroadcast(event('households'));
    await act(() => jest.advanceTimersByTimeAsync(QUIET_MS));

    expect(invalidate.mock.calls).toEqual([[{ queryKey: MEMBERSHIP_KEY }]]);
    expect(queryClient.getQueryState(MEMBERSHIP)?.isInvalidated).toBe(true);
    for (const key of OTHER_KEYS) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    }
  });

  it('U-WKS-11 leaves an event during a change to the change’s own refetch (R11.5)', async () => {
    let resolveSave!: () => void;
    jest.mocked(updateWeekStart).mockReturnValue(new Promise((done) => (resolveSave = done)));
    const { result } = await renderHousehold();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => result.current.setWeekStart(6));
    await waitFor(() => expect(updateWeekStart).toHaveBeenCalled());

    mockRealtime.latest().emitBroadcast(event('households'));
    await act(() => jest.advanceTimersByTimeAsync(MAX_WAIT_MS));

    expect(invalidate).not.toHaveBeenCalled();

    // The change lands, and its own refetch picks up the other phone's change too.
    await act(async () => resolveSave());
    await waitFor(() => expect(invalidate.mock.calls).toEqual([[{ queryKey: MEMBERSHIP_KEY }]]));
  });
});
