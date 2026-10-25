import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { type AuthApi, type AuthState, useAuth } from '@/features/auth/auth-provider';
import type { Weekday } from '@/lib/calendar';
import { ApiError } from '@/lib/errors';
import { report, reportOnce } from '@/lib/reporting';
import { makeSession } from '@/test/factories';

import { fetchMemberships, type Membership, updateWeekStart } from './api';
import { HouseholdProvider, useHousehold } from './household-provider';
import { MEMBERSHIP_KEY } from './keys';
import { useSetWeekStart, useWeekStart } from './use-week-start';

// U-WKS-03 to U-WKS-09 (specs/meals/4-test-plan.md §14.2). The real provider runs against a mocked
// api.ts, so a change reaches useWeekStart the way it does in the app: through the membership cache.

jest.mock('./api', () => ({ fetchMemberships: jest.fn(), updateWeekStart: jest.fn() }));
jest.mock('@/features/auth/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  setReportingUser: jest.fn(),
}));

const HID = 'household-1';
const MONDAY: Weekday = 0;
const SATURDAY: Weekday = 5;
const SUNDAY: Weekday = 6;

// What the database holds. The mocked fetch returns it, so the refetch after a change reconciles.
let server: Weekday | null;

const membership = (weekStart: Weekday | null): Membership => ({
  household: { id: HID, name: 'Household One', timeZone: 'America/Denver', weekStart },
  displayName: 'Member A',
});

function setAuth(state: AuthState) {
  jest.mocked(useAuth).mockReturnValue({ state } as AuthApi);
}

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fail = () => new ApiError('server', { table: 'households', operation: 'update' });

let queryClient: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  setAuth({ status: 'signedIn', session: makeSession('user-a') });
  server = MONDAY;
  jest.mocked(fetchMemberships).mockImplementation(async () => [membership(server)]);
  jest.mocked(updateWeekStart).mockImplementation(async (_, day) => {
    server = day;
  });
  // Settled mutations otherwise leave a 5-minute garbage-collection timer that keeps Jest running.
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } },
  });
});

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

function useBoth() {
  return {
    ready: useHousehold().status === 'ready',
    weekStart: useWeekStart(),
    ...useSetWeekStart(),
  };
}

async function renderWeekStart() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <HouseholdProvider>{children}</HouseholdProvider>
    </QueryClientProvider>
  );
  const hook = await renderHook(useBoth, { wrapper });
  // Changes made before the household is ready are ignored, as in the app.
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

describe('useWeekStart', () => {
  it('U-WKS-03 returns the household’s start of the week', async () => {
    server = SUNDAY;
    const { result } = await renderWeekStart();

    expect(result.current.weekStart).toBe(SUNDAY);
  });

  it('U-WKS-03 is Monday before the household is ready (R48.3)', async () => {
    setAuth({ status: 'signedOut', reason: 'none' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <HouseholdProvider>{children}</HouseholdProvider>
      </QueryClientProvider>
    );
    const { result } = await renderHook(useWeekStart, { wrapper });

    expect(result.current).toBe(MONDAY);
  });

  it('U-WKS-04 uses Monday for a value it doesn’t know, and reports it once with no value', async () => {
    server = null;
    const { result, rerender } = await renderWeekStart();
    await rerender({});

    expect(result.current.weekStart).toBe(MONDAY);
    expect(reportOnce).toHaveBeenCalledTimes(1);
    expect(reportOnce).toHaveBeenCalledWith('household_week_start_invalid');
  });
});

describe('useSetWeekStart', () => {
  it('U-WKS-05 shows the new day at once, then saves it (R48.4)', async () => {
    const save = deferred();
    jest.mocked(updateWeekStart).mockReturnValue(save.promise);
    const { result } = await renderWeekStart();

    await act(async () => result.current.setWeekStart(SUNDAY));

    // Before the save has finished.
    await waitFor(() => expect(result.current.weekStart).toBe(SUNDAY));
    expect(updateWeekStart).toHaveBeenCalledWith(HID, SUNDAY);

    server = SUNDAY;
    await act(async () => save.resolve());
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(result.current.weekStart).toBe(SUNDAY);
    expect(result.current.failed).toBe(false);
  });

  it('U-WKS-06 puts the earlier day back when the change fails, and says so (R48.10)', async () => {
    jest.mocked(updateWeekStart).mockRejectedValue(fail());
    const { result } = await renderWeekStart();

    await act(async () => result.current.setWeekStart(SUNDAY));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.weekStart).toBe(MONDAY);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ category: 'server' }));
  });

  it('U-WKS-06 leaves a later change in place when an earlier one fails (DD14)', async () => {
    const first = deferred();
    jest.mocked(updateWeekStart).mockReturnValueOnce(first.promise);
    const { result } = await renderWeekStart();

    await act(async () => result.current.setWeekStart(SUNDAY));
    await act(async () => result.current.setWeekStart(SATURDAY));
    await waitFor(() => expect(result.current.weekStart).toBe(SATURDAY));

    await act(async () => first.reject(fail()));

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(server).toBe(SATURDAY);
    expect(result.current.weekStart).toBe(SATURDAY);
  });

  it('U-WKS-07 fails at once while offline, sends nothing, and never retries', async () => {
    const { result } = await renderWeekStart();
    onlineManager.setOnline(false);

    await act(async () => result.current.setWeekStart(SUNDAY));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.weekStart).toBe(MONDAY);
    expect(updateWeekStart).not.toHaveBeenCalled();

    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(updateWeekStart).not.toHaveBeenCalled();
    expect(result.current.weekStart).toBe(MONDAY);
  });

  it('U-WKS-08 runs quick changes one at a time, in order, and ends on the last', async () => {
    const first = deferred();
    jest.mocked(updateWeekStart).mockReturnValueOnce(first.promise);
    const { result } = await renderWeekStart();

    await act(async () => result.current.setWeekStart(SUNDAY));
    await act(async () => result.current.setWeekStart(SATURDAY));

    // The second waits in the household's scope until the first settles.
    await waitFor(() => expect(result.current.weekStart).toBe(SATURDAY));
    expect(jest.mocked(updateWeekStart).mock.calls).toEqual([[HID, SUNDAY]]);

    server = SUNDAY;
    await act(async () => first.resolve());

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(jest.mocked(updateWeekStart).mock.calls).toEqual([
      [HID, SUNDAY],
      [HID, SATURDAY],
    ]);
    expect(result.current.weekStart).toBe(SATURDAY);
  });

  it('U-WKS-09 refetches only when the last change settles', async () => {
    const first = deferred();
    jest.mocked(updateWeekStart).mockReturnValueOnce(first.promise);
    const { result } = await renderWeekStart();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => result.current.setWeekStart(SUNDAY));
    await act(async () => result.current.setWeekStart(SATURDAY));
    server = SUNDAY;
    await act(async () => first.resolve());

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(invalidate.mock.calls).toEqual([[{ queryKey: MEMBERSHIP_KEY }]]);
  });

  it('U-WKS-09 clears the failure on the next change', async () => {
    jest.mocked(updateWeekStart).mockRejectedValueOnce(fail());
    const { result } = await renderWeekStart();

    await act(async () => result.current.setWeekStart(SUNDAY));
    await waitFor(() => expect(result.current.failed).toBe(true));

    await act(async () => result.current.setWeekStart(SUNDAY));

    await waitFor(() => expect(result.current.failed).toBe(false));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await waitFor(() => expect(result.current.weekStart).toBe(SUNDAY));
  });
});
