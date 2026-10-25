import type { QueryClient } from '@tanstack/react-query';

import { MEMBERSHIP_KEY, WEEK_START_MUTATION } from './keys';
import type { TableHandlers } from './use-household-realtime';

// What the app does when the other phone changes the household row, such as its start of the week
// (specs/meals/2-design.md §11.3, DD63).

/** Refetches the household, unless one of this phone's start-of-the-week changes is still saving. */
export function onHouseholdTableChange(qc: QueryClient): void {
  // A refetch now could undo the change on screen. The last change to settle refetches instead,
  // which picks up this one too (R11.5).
  if (qc.isMutating({ mutationKey: [WEEK_START_MUTATION] }) > 0) return;
  void qc.invalidateQueries({ queryKey: MEMBERSHIP_KEY });
}

export const householdTableHandlers: TableHandlers = { households: onHouseholdTableChange };
