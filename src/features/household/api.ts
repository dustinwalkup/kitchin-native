import type { Weekday } from '@/lib/calendar';
import { ApiError, toApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { parseWeekStart, weekStartValue } from './week-start';

export interface Membership {
  /** `weekStart` is null for a value this build doesn't know (meals R48.11). */
  household: { id: string; name: string; timeZone: string; weekStart: Weekday | null };
  displayName: string;
}

/**
 * The member's two oldest memberships, oldest first. Two are enough to tell whether there's more
 * than one (R1.6).
 */
export async function fetchMemberships(userId: string): Promise<Membership[]> {
  const { data, error, status } = await supabase
    .from('household_members')
    .select(
      'household_id, display_name, created_at, household:households(id, name, time_zone, week_start)',
    )
    // RLS lets a member see every membership of their household, not just their own (§3.3).
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(2);

  // postgrest-js puts the HTTP status on the response, so it's copied onto the error (§3.8).
  if (error) {
    throw toApiError({ ...error, status }, { table: 'household_members', operation: 'select' });
  }

  return data.map((row) => ({
    household: {
      id: row.household.id,
      name: row.household.name,
      timeZone: row.household.time_zone,
      weekStart: parseWeekStart(row.household.week_start),
    },
    displayName: row.display_name,
  }));
}

/** Sets the household's start of the week (meals R48.4, design §11.3). */
export async function updateWeekStart(householdId: string, day: Weekday): Promise<void> {
  const meta = { table: 'households', operation: 'update' };
  const { data, error, status } = await supabase
    .from('households')
    .update({ week_start: weekStartValue(day) })
    .eq('id', householdId)
    .select('id');

  if (error) throw toApiError({ ...error, status }, meta);
  // RLS hides another household's row, so the update matches nothing rather than failing.
  if (data.length === 0) throw new ApiError('forbidden', meta);
}
