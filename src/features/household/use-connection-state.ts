import { useEffect, useState } from 'react';

import { useForegroundSince } from '@/lib/app-foreground';
import { reportOnce } from '@/lib/reporting';

import { useRealtimeStatus } from './use-household-realtime';

// What the member sees, and the owner learns, while live updates are down (specs/mvp/2-design.md
// §3.6). Both clocks count foreground time only. They start at the disconnect, or at the return
// to the foreground if that's later, so the moment it takes to rejoin after the app comes back
// shows nothing, and time in the background never counts towards a report.

/** How long the channel must be down before "Reconnecting…" shows (R13.4). */
export const RECONNECTING_AFTER_MS = 3_000;
/** How long the channel must be down before it's reported (R26.1). */
export const DEGRADED_AFTER_MS = 120_000;

/** True once the clock reaches `at`, and false while `at` is null. */
function useTimeReached(at: number | null): boolean {
  const [reached, setReached] = useState<number | null>(null);
  useEffect(() => {
    if (at === null) return;
    const timer = setTimeout(() => setReached(at), at - Date.now());
    return () => clearTimeout(timer);
  }, [at]);
  return at !== null && reached === at;
}

/** Whether the channel has been down for `ms` while the app was in the foreground. */
function useDownFor(ms: number): boolean {
  const { status, since } = useRealtimeStatus();
  const foregroundSince = useForegroundSince();
  const down = status === 'disconnected' && foregroundSince !== null;
  return useTimeReached(down ? Math.max(since, foregroundSince) + ms : null);
}

/** Whether to show the "Reconnecting…" pill. It hides as soon as the channel rejoins (R13.4). */
export function useReconnectingIndicator(): boolean {
  return useDownFor(RECONNECTING_AFTER_MS);
}

/**
 * Reports live updates that have been down for 2 minutes in the foreground. `reportOnce` keeps it
 * to one report per app session (R26.1). The (app) layout mounts this alongside the channel.
 */
export function useRealtimeDegradedReport(): void {
  const degraded = useDownFor(DEGRADED_AFTER_MS);
  useEffect(() => {
    if (degraded) reportOnce('realtime_degraded', { channelStatus: 'disconnected' });
  }, [degraded]);
}
