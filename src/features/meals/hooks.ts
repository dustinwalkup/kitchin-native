// The meal week query and the save mutation (design §3.3.4). They follow the grocery hooks' lifecycle
// but are written separately, so no grocery code changes (N24). Screens use these hooks and never
// touch api.ts or Supabase themselves.
import {
  queryOptions,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { useHousehold } from '@/features/household/household-provider';
import { addDays, type IsoDate, weekStartOf } from '@/lib/calendar';
import { classifyError, isRetryable } from '@/lib/errors';
import { report, reportOnce } from '@/lib/reporting';
import { useToast } from '@/lib/toast';

import { clearEntry, fetchWeek, saveEntry } from './api';
import { COPY, type MealType } from './constants';
import { buildWeek, type Day, type MealEntry, type MealEntryRow, parseEntryRow } from './domain';

export const mealKeys = {
  all: (hid: string) => ['household', hid, 'meals'] as const,
  week: (hid: string, weekStart: IsoDate) =>
    ['household', hid, 'meals', 'week', weekStart] as const,
};
// The realtime handler defers to pending meal mutations by this key's first element (§3.3.5).
const mutationKey = (hid: string) => ['meal-mutation', hid] as const;
// One scope per household, so saves and clears run one at a time, in the order they were made (DD34).
const scope = (hid: string) => ({ id: `meals:${hid}` });

// The cache holds the rows as fetched; `select` parses them for each render.
type Rows = MealEntryRow[];

function weekQuery(householdId: string | null, weekStart: IsoDate) {
  return queryOptions({
    // The key for a missing household is never fetched, because of skipToken.
    queryKey: mealKeys.week(householdId ?? '', weekStart),
    queryFn:
      householdId === null
        ? skipToken
        : () => fetchWeek(householdId, weekStart, addDays(weekStart, 6)),
    // Weeks stay cached while the app runs, so going back to one shows it at once (DD29, R31.5).
    // Sign-out clears them with the rest of the cache.
    gcTime: Infinity,
  });
}

function useHouseholdId(): string | null {
  const household = useHousehold();
  return household.status === 'ready' ? household.household.id : null;
}

// Rows that don't parse, such as a meal type from a newer build, are left out and reported once
// each (R35.7, R14.8). reportOnce does the deduplicating.
function selectWeek(rows: Rows, weekStart: IsoDate) {
  const entries: MealEntry[] = [];
  const reportKeys: string[] = [];
  for (const row of rows) {
    const parsed = parseEntryRow(row);
    if (parsed.ok) entries.push(parsed.entry);
    else reportKeys.push(`invalid_row:${parsed.id}:${parsed.field}`);
  }
  return { days: buildWeek(weekStart, entries), reportKeys };
}

const NO_DAYS: Day[] = [];

export interface MealWeek {
  /** The week's seven days (R30.1). Empty until the week has loaded. */
  days: Day[];
  status: 'loading' | 'ready' | 'error' | 'waiting';
  /** Reloads the week. Resolves once the fetch has finished, which pull to refresh waits for (R30.11). */
  refetch(): Promise<void>;
  /**
   * When the latest fetch failed while the loaded week stays on screen (R30.10), so the screen can
   * tell each failure apart. Null otherwise, including when nothing has loaded (`status: 'error'`).
   */
  refreshFailedAt: number | null;
}

export function useMealWeek(weekStart: IsoDate): MealWeek {
  const queryClient = useQueryClient();
  const householdId = useHouseholdId();
  const select = useCallback((rows: Rows) => selectWeek(rows, weekStart), [weekStart]);
  const { data, error, errorUpdatedAt, fetchStatus, refetch } = useQuery({
    ...weekQuery(householdId, weekStart),
    select,
  });

  // The facade drops what isn't reportable, such as network errors (R26.2).
  useEffect(() => {
    if (error) report(error);
  }, [error]);

  const reportKeys = data?.reportKeys;
  useEffect(() => {
    reportKeys?.forEach((key) => reportOnce(key));
  }, [reportKeys]);

  // Once the week has loaded, the weeks either side load in the background, so Previous and Next
  // show at once (R31.5, DD29). It runs once per week shown, not on every refetch.
  const loaded = data !== undefined;
  useEffect(() => {
    if (!loaded || householdId === null) return;
    for (const start of [addDays(weekStart, -7), addDays(weekStart, 7)]) {
      void queryClient.prefetchQuery({ ...weekQuery(householdId, start), staleTime: 60_000 });
    }
  }, [loaded, householdId, weekStart, queryClient]);

  // A loaded week stays on screen while a later refetch is offline or fails (R30.10).
  let status: MealWeek['status'] = 'loading';
  if (data) status = 'ready';
  else if (fetchStatus === 'paused')
    status = 'waiting'; // R13.1
  else if (error) status = 'error';

  return {
    days: data?.days ?? NO_DAYS,
    status,
    refetch: async () => {
      await refetch();
    },
    refreshFailedAt: data && error ? errorUpdatedAt : null,
  };
}

// The save mutation

/** A save, or a clear when `body` is null (R33.1). */
export interface SetMealVariables {
  date: IsoDate;
  mealType: MealType;
  body: string | null;
}

interface Applied {
  weekKey: ReturnType<typeof mealKeys.week>;
  /** The slot's row before this change, or null when it was empty. */
  before: MealEntryRow | null;
}

const inSlot = (date: IsoDate, mealType: MealType) => (r: MealEntryRow) =>
  r.meal_date === date && r.meal_type === mealType;

/** The rows with the slot's row replaced by `row`, or removed when `row` is null. */
function putSlot(rows: Rows, v: SetMealVariables, row: MealEntryRow | null): Rows {
  const others = rows.filter((r) => !inSlot(v.date, v.mealType)(r));
  return row ? [...others, row] : others;
}

/**
 * Saves or clears a slot (design §3.3.4). The slot shows the change at once (R32.6), and a failure
 * undoes it only while the slot still shows it (DD14). Calls made before the household has loaded
 * are ignored; the screen offers no slots until then.
 */
export function useSetMeal(): (v: SetMealVariables) => void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const householdId = useHouseholdId();
  const hid = householdId ?? '';
  const key = mutationKey(hid);

  const { mutate } = useMutation({
    mutationKey: key,
    scope: scope(hid),
    networkMode: 'online', // pauses while offline (R13.2)
    // Up to 3 retries, with back-off, and only for network failures (R14.1).
    retry: (failureCount, error) => isRetryable(classifyError(error)) && failureCount < 3,
    mutationFn: ({ date, mealType, body }: SetMealVariables) =>
      body === null
        ? clearEntry({ householdId: hid, date, mealType })
        : saveEntry({ householdId: hid, date, mealType, body }),

    onMutate: async (v): Promise<Applied | undefined> => {
      const weekKey = mealKeys.week(hid, weekStartOf(v.date));
      // A refetch already on its way would overwrite the change.
      await queryClient.cancelQueries({ queryKey: weekKey });
      const rows = queryClient.getQueryData<Rows>(weekKey);
      // A week that isn't cached isn't on screen, so there's nothing to show the change in.
      if (!rows) return undefined;
      const before = rows.find(inSlot(v.date, v.mealType)) ?? null;
      let row: MealEntryRow | null = null;
      if (v.body !== null) {
        // An empty slot gets a placeholder row, which the refetch replaces with the real one.
        row = before
          ? { ...before, body: v.body }
          : {
              id: `pending:${v.date}:${v.mealType}`,
              meal_date: v.date,
              meal_type: v.mealType,
              body: v.body,
              updated_at: new Date().toISOString(),
            };
      }
      queryClient.setQueryData<Rows>(weekKey, putSlot(rows, v, row));
      return { weekKey, before };
    },

    onError: (e, v, applied) => {
      const error = classifyError(e);
      // Undo only while the slot still shows this change, so a later save is never reverted (DD14).
      if (applied) {
        queryClient.setQueryData<Rows>(applied.weekKey, (rows) => {
          if (!rows) return rows;
          const shown = rows.find(inSlot(v.date, v.mealType))?.body ?? null;
          return shown === v.body ? putSlot(rows, v, applied.before) : rows;
        });
      }
      // Repeating a forbidden or invalid save fails the same way, so neither gets Retry (R14.3,
      // design §6). An invalid one means the app and the database disagree about the rules (OI-18).
      if (error.category === 'forbidden') {
        toast.show({ message: "You don't have access to that" });
      } else if (error.category === 'validation') {
        toast.show({ message: COPY.saveError });
      } else {
        // Retry resends the member's text (R35.5).
        toast.show({
          message: COPY.saveError,
          action: { label: 'Retry', onPress: () => mutate(v) },
        });
      }
      report(error);
    },

    // Only the last pending meal mutation refetches, which reconciles with the server (R12.6) and
    // picks up remote changes that the realtime handler deferred meanwhile (R11.5).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: key }) === 1) {
        void queryClient.invalidateQueries({ queryKey: mealKeys.all(hid) });
      }
    },
  });

  return useCallback(
    (v: SetMealVariables) => {
      if (householdId !== null) mutate(v);
    },
    [householdId, mutate],
  );
}
