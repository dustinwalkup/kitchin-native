import { useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';

// When the app came to the foreground. Timers that should count foreground time only, such as the
// reconnecting pill and the degraded report (specs/mvp/2-design.md §3.6), start from it. AppState
// is watched only while something is listening.

let foregroundSince: number | null = null;
let subscription: NativeEventSubscription | null = null;
const listeners = new Set<() => void>();

function update(next: number | null) {
  if (next === foregroundSince) return;
  foregroundSince = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    foregroundSince = AppState.currentState === 'active' ? Date.now() : null;
    // 'inactive' counts as away, as it does for the query client's focus (§3.7).
    subscription = AppState.addEventListener('change', (state) =>
      update(state === 'active' ? (foregroundSince ?? Date.now()) : null),
    );
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    subscription?.remove();
    subscription = null;
  };
}

const getSnapshot = () => foregroundSince;

/**
 * When the app last came to the foreground, in milliseconds since the epoch, or null while it's in
 * the background.
 */
export function useForegroundSince(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
