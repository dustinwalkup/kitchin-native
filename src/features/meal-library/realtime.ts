import type { QueryClient } from '@tanstack/react-query';

import type { TableHandlers } from '@/features/household/use-household-realtime';

import { libraryKeys } from './hooks';

// What the library does when the other phone changes a meal, a tag or a link (design §3.5). The
// household channel coalesces the events first, and runs this handler once per flush however many
// of the three tables changed, so a save that touches all three refetches once (R11.4).

/** Refetches the household's library, unless one of this phone's library changes is still saving. */
export function onLibraryTableChange(qc: QueryClient, hid: string): void {
  // A refetch now could show this phone's save half done. The last library mutation to settle
  // refetches instead, which picks up this change too (R11.5). The prefix of every key in hooks.ts.
  if (qc.isMutating({ mutationKey: ['library-mutation'] }) > 0) return;
  void qc.invalidateQueries({ queryKey: libraryKeys.all(hid) });
}

export const libraryTableHandlers: TableHandlers = {
  library_meals: onLibraryTableChange,
  library_tags: onLibraryTableChange,
  library_meal_tags: onLibraryTableChange,
};
