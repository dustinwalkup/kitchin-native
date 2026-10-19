import { toApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export interface Membership {
  household: { id: string; name: string; timeZone: string };
  displayName: string;
}

/**
 * The member's two oldest memberships, oldest first. Two are enough to tell whether there's more
 * than one (R1.6).
 */
export async function fetchMemberships(userId: string): Promise<Membership[]> {
  const { data, error, status } = await supabase
    .from('household_members')
    .select('household_id, display_name, created_at, household:households(id, name, time_zone)')
    // RLS lets a member see every membership of their household, not just their own (§3.3).
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(2);

  // postgrest-js puts the HTTP status on the response, so it's copied onto the error (§3.8).
  if (error) {
    throw toApiError({ ...error, status }, { table: 'household_members', operation: 'select' });
  }

  return data.map((row) => ({
    household: { id: row.household.id, name: row.household.name, timeZone: row.household.time_zone },
    displayName: row.display_name,
  }));
}
