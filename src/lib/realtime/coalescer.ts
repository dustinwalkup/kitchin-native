// Turns a burst of live-update events into one update per table (R11.4). Clearing 20 checked items
// on one phone sends 20 delete events, and the other phone refetches once. A trailing debounce with
// a limit, so a steady stream still flushes. No React or Supabase, so it's tested with fake timers.
// See specs/mvp/2-design.md §3.6.

/** How long the events must stop before a flush. */
export const QUIET_MS = 150;
/** The longest a burst waits from its first event, even if events keep arriving (N1). */
export const MAX_WAIT_MS = 500;

export interface Coalescer {
  /** Records a change to `table`. The flush lists it once, however many events it gets. */
  add(table: string): void;
  /** Drops anything waiting and ignores later events, as when the session ends (R3.5). */
  stop(): void;
}

/**
 * `flush` receives each changed table once, in the order they first arrived. The pending set is
 * reset before `flush` runs, so a handler that throws doesn't lose or repeat later events.
 */
export function createCoalescer(flush: (tables: readonly string[]) => void): Coalescer {
  let pending = new Set<string>();
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function clearTimers() {
    clearTimeout(quietTimer);
    clearTimeout(limitTimer);
    quietTimer = limitTimer = undefined;
  }

  function flushPending() {
    const tables = [...pending];
    pending = new Set();
    clearTimers();
    flush(tables);
  }

  return {
    add(table) {
      if (stopped) return;
      pending.add(table);
      clearTimeout(quietTimer);
      quietTimer = setTimeout(flushPending, QUIET_MS);
      limitTimer ??= setTimeout(flushPending, MAX_WAIT_MS);
    },
    stop() {
      stopped = true;
      pending = new Set();
      clearTimers();
    },
  };
}
