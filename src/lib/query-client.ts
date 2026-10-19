import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { classifyError, isRetryable } from './errors';

// TanStack Query listens for browser events, which React Native doesn't have. NetInfo and AppState
// stand in for them here (specs/mvp/2-design.md §3.7). Importing this module registers both.

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Returning to the foreground or coming back online always refetches (R11.3).
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Two retries, and only when the failure was the network (R14.1).
      retry: (failureCount, error) => isRetryable(classifyError(error)) && failureCount < 2,
    },
    // A mutation pauses while offline and resumes when the device reconnects (R13.2).
    mutations: { networkMode: 'online' },
  },
});

// `isInternetReachable` is null until NetInfo has checked, so only a definite false counts.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) =>
    setOnline(state.isConnected === true && state.isInternetReachable !== false),
  ),
);

// The app counts as focused only while it's in the foreground.
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (state) =>
    setFocused(state === 'active'),
  );
  return () => subscription.remove();
});

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

/** Whether the device is online, as the query client sees it. Drives the offline banner (R13.1). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline);
}
