// Grocery reads and writes (design §3.5.2). Every failure leaves as an ApiError from toApiError, so a
// raw PostgREST error, whose text can contain item names, never reaches the hooks (§3.8, R26.4).
// Each write sends only the columns it changes (R12.4). Attribution and timestamps are never sent:
// the database sets them (R19.7, R21.4).
import { ApiError, toApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import type { CategoryKey } from './constants';
import type { GroceryItemRow } from './domain';

const ITEMS = 'grocery_items';

// The columns of GroceryItemRow.
const ITEM_COLUMNS = 'id, list_id, name, category, quantity, is_checked, checked_at, created_at';

// postgrest-js puts the HTTP status on the response, so it's copied onto the error (§3.8).
function fail(
  error: object,
  status: number,
  ctx: { table: string; operation: string; recordId?: string },
): ApiError {
  return toApiError({ ...error, status }, ctx);
}

/** The household's list with its items, in one round trip through the composite foreign key (R4.1). */
export async function fetchList(
  householdId: string,
): Promise<{ listId: string; rows: GroceryItemRow[] }> {
  const { data, error, status } = await supabase
    .from('grocery_lists')
    .select(`id, grocery_items(${ITEM_COLUMNS})` as const)
    .eq('household_id', householdId)
    .order('created_at')
    .limit(1)
    .single();
  if (error) throw fail(error, status, { table: 'grocery_lists', operation: 'select' });
  return { listId: data.id, rows: data.grocery_items };
}

/** Adds an item with a client-generated id, so a retry repeats the same insert (R12.3). */
export async function insertItem(v: {
  id: string;
  householdId: string;
  listId: string;
  name: string;
  category: CategoryKey;
  quantity: string | null;
}): Promise<void> {
  const { error, status } = await supabase.from(ITEMS).insert({
    id: v.id,
    household_id: v.householdId,
    list_id: v.listId,
    name: v.name,
    category: v.category,
    quantity: v.quantity,
  });
  if (error) throw fail(error, status, { table: ITEMS, operation: 'insert', recordId: v.id });
}

// An update that matches no row means another device deleted the item (R12.5).
async function updateItem(
  id: string,
  change:
    | { is_checked: boolean }
    | { quantity: string | null }
    | { name?: string; category?: CategoryKey; quantity?: string | null },
): Promise<void> {
  const ctx = { table: ITEMS, operation: 'update', recordId: id };
  const { data, error, status } = await supabase
    .from(ITEMS)
    .update(change)
    .eq('id', id)
    .select('id');
  if (error) throw fail(error, status, ctx);
  if (data.length === 0) throw new ApiError('not_found', ctx);
}

/** Sends the intended state, not a toggle, so repeating it changes nothing (R7.3). */
export function setItemChecked(id: string, isChecked: boolean): Promise<void> {
  return updateItem(id, { is_checked: isChecked });
}

/** Sets or clears the quantity; `null` clears it (R8.2, R8.3). */
export function setItemQuantity(id: string, quantity: string | null): Promise<void> {
  return updateItem(id, { quantity });
}

/**
 * Changes an item's name, category or quantity from the edit sheet, sending only what changed
 * (R12.4, specs/redesign/design.md §4.3).
 */
export function updateItemDetails(
  id: string,
  changes: { name?: string; category?: CategoryKey; quantity?: string | null },
): Promise<void> {
  return updateItem(id, changes);
}

/** Deleting an item that's already gone counts as success (R9.3). */
export async function deleteItem(id: string): Promise<void> {
  const { error, status } = await supabase.from(ITEMS).delete().eq('id', id);
  if (error) throw fail(error, status, { table: ITEMS, operation: 'delete', recordId: id });
}

/** Deletes every checked item on the list in one statement, and returns their ids (R10.3, R10.4). */
export async function clearCheckedItems(listId: string): Promise<string[]> {
  const { data, error, status } = await supabase
    .from(ITEMS)
    .delete()
    .eq('list_id', listId)
    .eq('is_checked', true)
    .select('id');
  if (error) throw fail(error, status, { table: ITEMS, operation: 'delete', recordId: listId });
  return data.map((row) => row.id);
}

/**
 * Unchecks every checked item on the list except `keepIds` in one statement, and returns their ids
 * (R10.9). Sending the few to keep, not the many to uncheck, keeps the URL short.
 */
export async function uncheckAllItems(listId: string, keepIds: string[]): Promise<string[]> {
  let query = supabase
    .from(ITEMS)
    .update({ is_checked: false })
    .eq('list_id', listId)
    .eq('is_checked', true);
  if (keepIds.length > 0) query = query.not('id', 'in', `(${keepIds.join(',')})`);
  const { data, error, status } = await query.select('id');
  if (error) throw fail(error, status, { table: ITEMS, operation: 'update', recordId: listId });
  return data.map((row) => row.id);
}
