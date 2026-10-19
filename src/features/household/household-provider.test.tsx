import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { type AuthApi, type AuthState, useAuth } from '@/features/auth/auth-provider';
import { ApiError } from '@/lib/errors';
import { queryClient as appQueryClient } from '@/lib/query-client';
import { report, reportOnce } from '@/lib/reporting';
import { makeSession } from '@/test/factories';

import { fetchMemberships, type Membership } from './api';
import { HouseholdProvider, useHousehold } from './household-provider';

jest.mock('./api', () => ({ fetchMemberships: jest.fn() }));
jest.mock('@/features/auth/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  setReportingUser: jest.fn(),
}));

const SIGNED_IN: AuthState = { status: 'signedIn', session: makeSession('user-a') };

const OLDEST: Membership = {
  household: { id: 'household-1', name: 'Household One', timeZone: 'America/Denver' },
  displayName: 'Member A',
};
const NEWER: Membership = {
  household: { id: 'household-2', name: 'Household Two', timeZone: 'UTC' },
  displayName: 'Member A (2)',
};

const fetchMock = jest.mocked(fetchMemberships);

function setAuth(state: AuthState) {
  jest.mocked(useAuth).mockReturnValue({ state } as AuthApi);
}

let queryClient: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  setAuth(SIGNED_IN);
  // The app's defaults, so retries and offline pausing behave as they do in the app, but without
  // the back-off delay between retries.
  const defaults = appQueryClient.getDefaultOptions();
  queryClient = new QueryClient({
    defaultOptions: { ...defaults, queries: { ...defaults.queries, retryDelay: 0 } },
  });
});

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

async function renderHousehold() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <HouseholdProvider>{children}</HouseholdProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useHousehold(), { wrapper });
}

const network = () => new ApiError('network', { table: 'household_members', operation: 'select' });

describe('HouseholdProvider', () => {
  it.each<AuthState>([{ status: 'restoring' }, { status: 'signedOut', reason: 'none' }])(
    'U-HH-01 is idle and runs no query while %j',
    async (auth) => {
      setAuth(auth);
      const { result } = await renderHousehold();

      expect(result.current).toEqual({ status: 'idle' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('loads once the member signs in', async () => {
    setAuth({ status: 'signedOut', reason: 'none' });
    fetchMock.mockResolvedValue([OLDEST]);
    const { result, rerender } = await renderHousehold();

    setAuth(SIGNED_IN);
    await rerender({});

    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledWith('user-a');
    expect(queryClient.getQueryData(['membership', 'user-a'])).toEqual([OLDEST]);
  });

  it('U-HH-02 has no household with no membership', async () => {
    fetchMock.mockResolvedValue([]);
    const { result } = await renderHousehold();

    await waitFor(() => expect(result.current).toEqual({ status: 'none' }));
  });

  it('U-HH-03 is ready with one membership', async () => {
    fetchMock.mockResolvedValue([OLDEST]);
    const { result } = await renderHousehold();

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'ready',
        household: OLDEST.household,
        member: { userId: 'user-a', displayName: 'Member A' },
      }),
    );
    expect(reportOnce).not.toHaveBeenCalled();
  });

  it('U-HH-04 uses the oldest of two memberships and warns once', async () => {
    fetchMock.mockResolvedValue([OLDEST, NEWER]);
    const { result } = await renderHousehold();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ household: OLDEST.household });
    expect(reportOnce).toHaveBeenCalledTimes(1);
    expect(reportOnce).toHaveBeenCalledWith('membership_multiple');
  });

  it('U-HH-05 is unreachable while offline at launch, and loads once back online', async () => {
    onlineManager.setOnline(false);
    fetchMock.mockResolvedValue([OLDEST]);
    const { result } = await renderHousehold();

    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(report).not.toHaveBeenCalled();
  });

  it('U-HH-05 is unreachable after a network error, and recovers back online', async () => {
    fetchMock.mockRejectedValue(network());
    const { result } = await renderHousehold();

    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    // The first attempt and two retries (R14.1).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Handed to the facade, which doesn't report network errors (R26.2).
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ category: 'network' }));

    fetchMock.mockResolvedValue([OLDEST]);
    await act(() => onlineManager.setOnline(false));
    await act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it.each([
    ['forbidden', new ApiError('forbidden', { code: '42501', status: 403 })],
    ['server', new ApiError('server', { status: 500 })],
  ])('U-HH-06 is unreachable after a %s error, which it reports', async (_, error) => {
    fetchMock.mockRejectedValue(error);
    const { result } = await renderHousehold();

    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error);
  });

  it('retry() loads the membership again', async () => {
    fetchMock.mockRejectedValue(new ApiError('server', {}));
    const { result } = await renderHousehold();
    await waitFor(() => expect(result.current.status).toBe('unreachable'));

    fetchMock.mockResolvedValue([OLDEST]);
    await act(async () => {
      if (result.current.status === 'unreachable') result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('stays ready when a later refetch pauses offline or fails', async () => {
    fetchMock.mockResolvedValue([OLDEST]);
    const { result } = await renderHousehold();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(() => onlineManager.setOnline(false));
    await act(() => queryClient.refetchQueries({ queryKey: ['membership'] }));
    expect(result.current.status).toBe('ready');

    await act(() => onlineManager.setOnline(true));
    fetchMock.mockRejectedValue(new ApiError('server', {}));
    await act(() => queryClient.refetchQueries({ queryKey: ['membership'] }));

    // TanStack notifies observers on a zero-delay timer, after act has returned.
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('ready');
  });

  it('useHousehold needs the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useHousehold())).rejects.toThrow('inside <HouseholdProvider>');
    jest.mocked(console.error).mockRestore();
  });
});
