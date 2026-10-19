import type { QueryClient } from '@tanstack/react-query';

import type { TableHandlers } from '@/features/household/use-household-realtime';

import { groceryKeys } from './hooks';

// What the groceries feature does when the other phone changes the list (specs/mvp/2-design.md
// §3.5.4). The household channel coalesces the events first, so a burst of 20 deletes refetches
// once (R11.4).

export const groceryTables = ['grocery_items', 'grocery_lists'] as const;

/** Refetches the household's grocery queries, unless one of this phone's changes is still saving. */
export function onGroceryTableChange(qc: QueryClient, hid: string): void {
  // A refetch now could undo an optimistic change on screen. The last mutation to settle refetches
  // instead, which picks up this change too (R11.5). The prefix of every key in hooks.ts.
  if (qc.isMutating({ mutationKey: ['grocery-mutation'] }) > 0) return;
  void qc.invalidateQueries({ queryKey: groceryKeys.all(hid) });
}

/** Both tables share one handler, so a burst that touches both still refetches once. */
export const groceryTableHandlers: TableHandlers = Object.fromEntries(
  groceryTables.map((table) => [table, onGroceryTableChange]),
);
