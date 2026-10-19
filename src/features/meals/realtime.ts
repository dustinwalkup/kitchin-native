import type { QueryClient } from '@tanstack/react-query';

import type { TableHandlers } from '@/features/household/use-household-realtime';

import { mealKeys } from './hooks';

// What the meals feature does when the other phone changes a meal (design §3.3.5). The household
// channel coalesces the events first, so a burst refetches once (R11.4).

/** Refetches the household's meal weeks, unless one of this phone's meal changes is still saving. */
export function onMealTableChange(qc: QueryClient, hid: string): void {
  // A refetch now could undo an optimistic change on screen. The last meal mutation to settle
  // refetches instead, which picks up this change too (R11.5). The prefix of every key in hooks.ts.
  if (qc.isMutating({ mutationKey: ['meal-mutation'] }) > 0) return;
  // The week on screen refetches. Cached weeks are marked stale, and refresh when shown (R35.6).
  void qc.invalidateQueries({ queryKey: mealKeys.all(hid) });
}

export const mealTableHandlers: TableHandlers = { meal_entries: onMealTableChange };
