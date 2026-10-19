import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { makePostgrestError } from '@/test/factories';
import { Text } from '@/ui/text';

import { ApiError } from './errors';
import { queryClient, useIsOnline } from './query-client';

// React Native's AppState and NetInfo's Jest mocks record their listeners as mock calls. Emitting
// to every recorded listener is safe: TanStack ignores a state that hasn't changed.
function emitAppState(state: AppStateStatus) {
  for (const [type, listener] of jest.mocked(AppState.addEventListener).mock.calls) {
    if (type === 'change') listener(state);
  }
}

function emitNetInfo(state: Partial<NetInfoState>) {
  for (const [listener] of jest.mocked(NetInfo.addEventListener).mock.calls) {
    listener(state as NetInfoState);
  }
}

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

describe('connectivity', () => {
  it.each([
    [{ isConnected: false, isInternetReachable: false }, false],
    [{ isConnected: true, isInternetReachable: false }, false],
    [{ isConnected: null, isInternetReachable: null }, false],
    // NetInfo hasn't finished its reachability check yet.
    [{ isConnected: true, isInternetReachable: null }, true],
    [{ isConnected: true, isInternetReachable: true }, true],
  ])('NetInfo %j sets online to %s', (state, online) => {
    emitNetInfo(state);
    expect(onlineManager.isOnline()).toBe(online);
  });

  it('useIsOnline follows the online manager', async () => {
    const { result } = await renderHook(() => useIsOnline());
    expect(result.current).toBe(true);

    await act(() => onlineManager.setOnline(false));
    expect(result.current).toBe(false);

    await act(() => onlineManager.setOnline(true));
    expect(result.current).toBe(true);
  });
});

describe('focus', () => {
  function Probe({ queryFn }: { queryFn: () => Promise<string> }) {
    const { data } = useQuery({ queryKey: ['probe'], queryFn });
    return <Text>{data ?? 'loading'}</Text>;
  }

  it('R11.3 refetches a stale query when the app returns to the foreground', async () => {
    const queryFn = jest.fn().mockResolvedValue('loaded');
    await render(
      <QueryClientProvider client={queryClient}>
        <Probe queryFn={queryFn} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('loaded')).toBeOnTheScreen();

    await act(() => emitAppState('background'));
    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(() => emitAppState('active'));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
  });
});

describe('retry', () => {
  const retry = queryClient.getDefaultOptions().queries!.retry as (
    failureCount: number,
    error: unknown,
  ) => boolean;

  it('R14.1 retries a network failure twice', () => {
    const offline = new TypeError('Network request failed');
    expect([0, 1, 2].map((n) => retry(n, offline))).toEqual([true, true, false]);
  });

  it.each([
    ['a server error', makePostgrestError('XX000', { status: 500 })],
    ['a denial', new ApiError('forbidden', { code: '42501' })],
  ])('does not retry %s', (_, error) => {
    expect(retry(0, error)).toBe(false);
  });
});
