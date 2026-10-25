// Meal reads and writes (design §3.3.3). Every failure leaves as an ApiError from toApiError, so a
// raw PostgREST error, whose text can contain meal text, never reaches the hooks (MVP §3.8, R26.4).
// A slot is its key: saving is an upsert on it and clearing is a delete by it, so a retry or a race
// between the phones can't create a second entry (R38.5, DD24). `id`, attribution and timestamps are
// never sent: the conflict update would set `id`, which the audit trigger rejects (finding 1), and
// the database sets the rest (R19.7).
import type { IsoDate } from '@/lib/calendar';
import { type ApiError, toApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import type { MealType } from './constants';
import type { MealEntryRow } from './domain';

const ENTRIES = 'meal_entries';

// The columns of MealEntryRow.
const ENTRY_COLUMNS = 'id, meal_date, meal_type, body, library_meal_id, updated_at';

// The `meal_entries_one_per_slot` columns.
const SLOT_KEY = 'household_id,meal_date,meal_type';

// postgrest-js puts the HTTP status on the response, so it's copied onto the error (MVP §3.8). No
// record id is attached: the app never sends one.
function fail(error: object, status: number, operation: string): ApiError {
  return toApiError({ ...error, status }, { table: ENTRIES, operation });
}

/** The household's entries for one week, `from` and `to` inclusive (R30.1). */
export async function fetchWeek(
  householdId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<MealEntryRow[]> {
  const { data, error, status } = await supabase
    .from(ENTRIES)
    .select(ENTRY_COLUMNS)
    .eq('household_id', householdId)
    .gte('meal_date', from)
    .lte('meal_date', to);
  if (error) throw fail(error, status, 'select');
  return data;
}

/**
 * Creates the slot's entry or replaces its text, in one statement (R32.3, R38.5). The link always
 * goes with the text: the library meal it was chosen from, or null for typed text, so an edit never
 * leaves a link to a meal the text no longer names (specs/redesign DD-R10).
 */
export async function saveEntry(v: {
  householdId: string;
  date: IsoDate;
  mealType: MealType;
  body: string;
  libraryMealId: string | null;
}): Promise<void> {
  const { error, status } = await supabase.from(ENTRIES).upsert(
    {
      household_id: v.householdId,
      meal_date: v.date,
      meal_type: v.mealType,
      body: v.body,
      library_meal_id: v.libraryMealId,
    },
    { onConflict: SLOT_KEY },
  );
  if (error) throw fail(error, status, 'upsert');
}

/** Removes the slot's entry. Deleting nothing still counts as success (R33.1, R33.3). */
export async function clearEntry(v: {
  householdId: string;
  date: IsoDate;
  mealType: MealType;
}): Promise<void> {
  const { error, status } = await supabase
    .from(ENTRIES)
    .delete()
    .eq('household_id', v.householdId)
    .eq('meal_date', v.date)
    .eq('meal_type', v.mealType);
  if (error) throw fail(error, status, 'delete');
}

/** How many recent links to read, enough for eight different meals in most households. */
const RECENT_LINKS = 40;

/**
 * The library meals the household planned most recently, newest change first, for the picker's
 * Recently used (specs/redesign DD-R10). IDs may repeat; the library hook keeps the first of each.
 */
export async function fetchRecentLibraryMealIds(householdId: string): Promise<string[]> {
  const { data, error, status } = await supabase
    .from(ENTRIES)
    .select('library_meal_id')
    .eq('household_id', householdId)
    .not('library_meal_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(RECENT_LINKS);
  if (error) throw fail(error, status, 'select');
  return data.flatMap((row) => (row.library_meal_id === null ? [] : [row.library_meal_id]));
}
