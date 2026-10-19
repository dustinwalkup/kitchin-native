import { renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useForegroundAutoRefresh } from './auto-refresh';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({
  supabase: { auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() } },
}));

// A mocked AppState emitter (4-test-plan §8.4).
let listeners: ((state: AppStateStatus) => void)[] = [];
const emit = (state: AppStateStatus) => listeners.forEach((listener) => listener(state));

beforeEach(() => {
  listeners = [];
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener);
    return { remove: () => (listeners = listeners.filter((other) => other !== listener)) };
  });
});

afterEach(() => jest.restoreAllMocks());

describe('useForegroundAutoRefresh', () => {
  it('U-SBC-01 refreshes in the foreground and stops in the background or inactive', async () => {
    await renderHook(() => useForegroundAutoRefresh());

    await emit('active');
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(supabase.auth.stopAutoRefresh).not.toHaveBeenCalled();

    await emit('background');
    await emit('inactive');
    expect(supabase.auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('registers one listener however often the layout re-renders', async () => {
    const { rerender } = await renderHook(() => useForegroundAutoRefresh());

    await rerender({});
    await rerender({});

    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('stops listening on unmount', async () => {
    const { unmount } = await renderHook(() => useForegroundAutoRefresh());

    await unmount();
    await emit('active');

    expect(listeners).toHaveLength(0);
    expect(supabase.auth.startAutoRefresh).not.toHaveBeenCalled();
  });
});
