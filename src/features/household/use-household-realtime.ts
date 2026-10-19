import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { onSessionEnd } from '@/features/auth/auth-provider';
import { createCoalescer } from '@/lib/realtime/coalescer';
import { type RealtimeStatus, startHouseholdChannel } from '@/lib/realtime/household-channel';
import { supabase } from '@/lib/supabase';

import { useHousehold } from './household-provider';

// Live updates for the signed-in member's household (specs/mvp/2-design.md §3.6). The (app) layout
// mounts this once. It runs the household channel while the household is ready, and stops it when
// the session ends, before the query cache is cleared (R3.5).

/** Updates the cache after changes to a table. Each feature has its own (§3.5.4). */
export type TableChangeHandler = (queryClient: QueryClient, householdId: string) => void;
/** The handler for each table. A handler listed for several tables runs once per flush. */
export type TableHandlers = Readonly<Partial<Record<string, TableChangeHandler>>>;

/**
 * Pass `handlers` as a module constant: a new object on each render would restart the channel.
 */
export function useHouseholdRealtime(handlers: TableHandlers): void {
  const household = useHousehold();
  const householdId = household.status === 'ready' ? household.household.id : null;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (householdId === null) return;

    // A burst of events, such as clearing 20 checked items, becomes one update per table (R11.4).
    const coalescer = createCoalescer((tables) => {
      const due = new Set(tables.flatMap((table) => handlers[table] ?? []));
      for (const handler of due) handler(queryClient, householdId);
    });
    const channel = startHouseholdChannel({
      supabase,
      householdId,
      onTableChange: (table) => coalescer.add(table),
      // Events sent while the channel was down are lost, so everything reloads (R11.3).
      onResubscribed: () =>
        void queryClient.invalidateQueries({ queryKey: ['household', householdId] }),
      onStatus: setStatus,
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void channel.ensureJoined();
    });

    const stop = () => {
      coalescer.stop();
      appState.remove();
      setStatus('connecting', Date.now());
      return channel.stop();
    };
    // The auth provider calls this before it clears the cache, so nothing refetches for the next
    // account. The (app) layout also unmounts when the session ends, and stopping twice is fine.
    const unregister = onSessionEnd(stop);
    return () => {
      unregister();
      void stop();
    };
  }, [householdId, queryClient, handlers]);
}

export interface RealtimeStatusSnapshot {
  status: RealtimeStatus;
  /** When the status began, in milliseconds since the epoch. */
  since: number;
}

let snapshot: RealtimeStatusSnapshot = { status: 'connecting', since: Date.now() };
const listeners = new Set<() => void>();

function setStatus(status: RealtimeStatus, since: number) {
  snapshot = { status, since };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;

/** The household channel's status, for the reconnecting pill and the degraded report (§3.6). */
export function useRealtimeStatus(): RealtimeStatusSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}
