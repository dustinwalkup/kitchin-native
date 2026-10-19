// The household's private live-update channel (specs/mvp/2-design.md §3.6). It joins
// `household:<id>`, passes on the table each event is about, and reports the connection status.
// supabase-js rejoins with backoff after a drop (R13.5). This adds a fresh channel when the app
// returns to the foreground, and asks for a reload after a reconnect, since events sent while the
// channel was down are lost (R11.3).
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { classifyError } from '@/lib/errors';
import { type RealtimeStatus, report } from '@/lib/reporting';
import type { Database } from '@/types/database';

export type { RealtimeStatus };

export interface HouseholdChannelDeps {
  supabase: SupabaseClient<Database>;
  householdId: string;
  /** Called once per event with the changed table. The caller coalesces them (R11.4). */
  onTableChange(table: string): void;
  /** Joined again after a disconnect, so events may have been missed (R11.3). */
  onResubscribed(): void;
  /**
   * `since` is when the status began, in milliseconds since the epoch. A disconnect keeps its
   * first time while supabase-js retries, so the reconnecting pill times the whole outage (R13.4).
   */
  onStatus(status: RealtimeStatus, since: number): void;
}

export interface HouseholdChannel {
  /**
   * Re-creates the channel unless it's joined or joining. Called when the app becomes active. If a
   * join is already in progress, it waits for that one instead.
   */
  ensureJoined(): Promise<void>;
  /** Removes the channel. Nothing is called afterwards, not even for the removal's own CLOSED. */
  stop(): Promise<void>;
}

export function startHouseholdChannel(deps: HouseholdChannelDeps): HouseholdChannel {
  const { supabase, householdId, onTableChange, onResubscribed, onStatus } = deps;
  let channel: RealtimeChannel | null = null;
  let inProgress: Promise<void> | null = null;
  let stopped = false;
  let disconnectedSince: number | null = null;

  function markDisconnected() {
    if (disconnectedSince !== null) return;
    disconnectedSince = Date.now();
    onStatus('disconnected', disconnectedSince);
  }

  function handleStatus(from: RealtimeChannel, status: REALTIME_SUBSCRIBE_STATES) {
    // A channel that was replaced or removed still reports, at least its CLOSED.
    if (stopped || from !== channel) return;
    if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      markDisconnected();
      return;
    }
    const missedEvents = disconnectedSince !== null;
    disconnectedSince = null;
    onStatus('connected', Date.now());
    if (missedEvents) onResubscribed();
  }

  async function join() {
    try {
      // The member's current access token, which a private channel's join needs (R22.1).
      await supabase.realtime.setAuth();
      if (stopped) return;
      const created = supabase.channel(`household:${householdId}`, { config: { private: true } });
      channel = created;
      created
        .on('broadcast', { event: '*' }, ({ payload }) => {
          // Only the table name is read, never the row (§3.6). The shape is in __fixtures__ (OI-4).
          const table: unknown = payload?.table;
          if (!stopped && created === channel && typeof table === 'string') onTableChange(table);
        })
        .subscribe((status) => handleStatus(created, status));
    } catch (e) {
      // Live updates are optional. The app keeps working, and reloads when it returns (R11.6).
      report(classifyError(e));
      if (!stopped) markDisconnected();
    }
  }

  function run(task: () => Promise<void>): Promise<void> {
    inProgress = task().finally(() => {
      inProgress = null;
    });
    return inProgress;
  }

  onStatus('connecting', Date.now());
  void run(join);

  return {
    ensureJoined() {
      if (stopped) return Promise.resolve();
      if (inProgress) return inProgress;
      if (channel?.state === 'joined' || channel?.state === 'joining') return Promise.resolve();
      return run(async () => {
        const old = channel;
        channel = null;
        // supabase.channel() returns the channel already registered for a topic, so the old one
        // has to go first.
        if (old) await supabase.removeChannel(old);
        await join();
      });
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      const current = channel;
      channel = null;
      if (current) await supabase.removeChannel(current);
    },
  };
}
