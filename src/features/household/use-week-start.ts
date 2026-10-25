import {
  onlineManager,
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import type { Weekday } from '@/lib/calendar';
import { ApiError, classifyError } from '@/lib/errors';
import { report, reportOnce } from '@/lib/reporting';

import { type Membership, updateWeekStart } from './api';
import { useHousehold } from './household-provider';
import { MEMBERSHIP_KEY, WEEK_START_MUTATION } from './keys';
import { DEFAULT_WEEK_START } from './week-start';

// The household's start of the week, and changing it (specs/meals/2-design.md §11.3). Screens use
// these hooks and never touch api.ts or Supabase themselves.

const mutationKey = (hid: string) => [WEEK_START_MUTATION, hid] as const;
// One scope per household, so quick changes reach the database in the order they were made (DD65).
const scope = (hid: string) => ({ id: `week-start:${hid}` });

/** The household's start day. Monday until the household is ready (R48.3). */
export function useWeekStart(): Weekday {
  const household = useHousehold();
  const weekStart =
    household.status === 'ready' ? household.household.weekStart : DEFAULT_WEEK_START;
  const unknown = weekStart === null;

  // A value from a newer build. The report carries no value (R48.11, R26.3).
  useEffect(() => {
    if (unknown) reportOnce('household_week_start_invalid');
  }, [unknown]);

  return weekStart ?? DEFAULT_WEEK_START;
}

type Memberships = Membership[];

/** The day the cached household shows, or undefined when it isn't cached. */
function shownWeekStart(queryClient: QueryClient, hid: string): Weekday | null | undefined {
  for (const [, memberships] of queryClient.getQueriesData<Memberships>({
    queryKey: MEMBERSHIP_KEY,
  })) {
    const membership = memberships?.find((m) => m.household.id === hid);
    if (membership) return membership.household.weekStart;
  }
  return undefined;
}

function showWeekStart(queryClient: QueryClient, hid: string, day: Weekday | null) {
  queryClient.setQueriesData<Memberships>({ queryKey: MEMBERSHIP_KEY }, (memberships) =>
    memberships?.map((m) =>
      m.household.id === hid ? { ...m, household: { ...m.household, weekStart: day } } : m,
    ),
  );
}

export interface SetWeekStart {
  setWeekStart(day: Weekday): void;
  /** The latest change failed, and the earlier day is back (R48.10). The next change clears it. */
  failed: boolean;
}

/**
 * Changes the household's start of the week (DD65). It shows at once (R48.4), and a failure puts the
 * earlier day back only while the household still shows this one (DD14). It's never held offline or
 * retried (R48.10). Calls made before the household has loaded are ignored.
 */
export function useSetWeekStart(): SetWeekStart {
  const queryClient = useQueryClient();
  const household = useHousehold();
  const householdId = household.status === 'ready' ? household.household.id : null;
  const hid = householdId ?? '';
  const key = mutationKey(hid);

  const { mutate, isError } = useMutation({
    mutationKey: key,
    scope: scope(hid),
    // Never paused or retried. An offline change fails at once with nothing sent (R48.10).
    networkMode: 'always',
    retry: false,
    mutationFn: async (day: Weekday) => {
      if (!onlineManager.isOnline()) {
        throw new ApiError('network', { table: 'households', operation: 'offline' });
      }
      return updateWeekStart(hid, day);
    },

    onMutate: async (day) => {
      // A refetch already on its way would overwrite the change.
      await queryClient.cancelQueries({ queryKey: MEMBERSHIP_KEY });
      const before = shownWeekStart(queryClient, hid);
      showWeekStart(queryClient, hid, day);
      return { before };
    },

    onError: (e, day, applied) => {
      // Undo only while the household still shows this change, so a later one is never reverted.
      if (applied && applied.before !== undefined && shownWeekStart(queryClient, hid) === day) {
        showWeekStart(queryClient, hid, applied.before);
      }
      // The facade drops what isn't reportable, such as network errors (R26.2).
      report(classifyError(e));
    },

    // Only the last pending change refetches, which also picks up the other phone's changes that the
    // realtime handler deferred meanwhile (R11.5).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: key }) === 1) {
        void queryClient.invalidateQueries({ queryKey: MEMBERSHIP_KEY });
      }
    },
  });

  const setWeekStart = useCallback(
    (day: Weekday) => {
      if (householdId !== null) mutate(day);
    },
    [householdId, mutate],
  );

  return { setWeekStart, failed: isError };
}
