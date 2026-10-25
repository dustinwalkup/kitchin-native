// Library reads and writes (design §3.3). Every failure leaves as an ApiError from toApiError, so a
// raw PostgREST error, whose text can contain meal and tag names, never reaches the hooks (MVP §3.8,
// R26.4). Each write is safe to repeat, so Retry runs a whole save plan again (DD46, R46.4).
// Attribution and timestamps are never sent, and nor is `name_key`: the database sets them (R19.7,
// DD44).
import type { PostgrestResponse } from '@supabase/supabase-js';

import { ApiError, toApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { IMAGE_BUCKET, IMAGE_URL_SECONDS } from './constants';
import { type MealRow, type SavePlan, type TagRow, tagKey } from './domain';

const MEALS = 'library_meals';
const TAGS = 'library_tags';
const LINKS = 'library_meal_tags';

// The columns of MealRow, with each meal's links embedded through the composite foreign key, and
// of TagRow.
const MEAL_COLUMNS =
  'id, name, description, ingredients, meal_type, image_path, updated_at, library_meal_tags(tag_id)';
const TAG_COLUMNS = 'id, name, name_key';

// The API's max_rows. A longer result is cut to it without an error (finding 5).
const PAGE = 1000;

type MealUpsert = Extract<SavePlan['meal'], { kind: 'upsert' }>['row'];
type MealChanges = Extract<SavePlan['meal'], { kind: 'update' }>['changes'];

// The domain's field names, as the table's columns. Only the fields present are sent (R46.5).
function toColumns(fields: MealChanges) {
  return {
    ...('name' in fields && { name: fields.name }),
    ...('description' in fields && { description: fields.description }),
    ...('ingredients' in fields && { ingredients: fields.ingredients }),
    ...('mealType' in fields && { meal_type: fields.mealType }),
    ...('imagePath' in fields && { image_path: fields.imagePath }),
  };
}

// postgrest-js puts the HTTP status on the response, so it's copied onto the error (MVP §3.8).
function fail(
  error: object,
  status: number,
  ctx: { table: string; operation: string; recordId?: string },
): ApiError {
  return toApiError({ ...error, status }, ctx);
}

// Requests pages of PAGE rows until one comes back short. The query orders by id, so no row moves
// between pages.
async function allPages<Row>(
  table: string,
  page: (from: number, to: number) => PromiseLike<PostgrestResponse<Row>>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error, status } = await page(from, from + PAGE - 1);
    if (error) throw fail(error, status, { table, operation: 'select' });
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Every meal, with its tag IDs, and every tag, fetched in parallel (R40.3, DD59). */
export async function fetchLibrary(
  householdId: string,
): Promise<{ meals: MealRow[]; tags: TagRow[] }> {
  const [meals, tags] = await Promise.all([
    allPages<MealRow>(MEALS, (from, to) =>
      supabase
        .from(MEALS)
        .select(MEAL_COLUMNS)
        .eq('household_id', householdId)
        .order('id')
        .range(from, to),
    ),
    allPages<TagRow>(TAGS, (from, to) =>
      supabase
        .from(TAGS)
        .select(TAG_COLUMNS)
        .eq('household_id', householdId)
        .order('id')
        .range(from, to),
    ),
  ]);
  return { meals, tags };
}

/**
 * Creates the tags that don't exist and returns every one, as stored. A name whose key is taken
 * comes back as the existing tag, with its ID and first spelling (DD45, R46.8).
 */
export async function upsertTags(householdId: string, names: string[]): Promise<TagRow[]> {
  const { data, error, status } = await supabase
    .from(TAGS)
    .upsert(
      names.map((name) => ({ household_id: householdId, name })),
      { onConflict: 'household_id,name_key' },
    )
    .select(TAG_COLUMNS);
  if (error) throw fail(error, status, { table: TAGS, operation: 'upsert' });
  return data;
}

/** Writes a new meal with every field, under its phone-generated ID, or repeats that save (DD46). */
export async function upsertMeal(householdId: string, row: MealUpsert): Promise<void> {
  const { error, status } = await supabase.from(MEALS).upsert(
    {
      id: row.id,
      household_id: householdId,
      name: row.name,
      description: row.description,
      ingredients: row.ingredients,
      meal_type: row.mealType,
      image_path: row.imagePath,
    },
    { onConflict: 'id' },
  );
  if (error) throw fail(error, status, { table: MEALS, operation: 'upsert', recordId: row.id });
}

/**
 * Changes only the given fields (R46.5). 'missing' when no row came back: the meal was deleted on
 * another device, or was never visible (R46.7).
 */
export async function updateMeal(id: string, changes: MealChanges): Promise<'updated' | 'missing'> {
  const { data, error, status } = await supabase
    .from(MEALS)
    .update(toColumns(changes))
    .eq('id', id)
    .select('id');
  if (error) throw fail(error, status, { table: MEALS, operation: 'update', recordId: id });
  return data.length === 0 ? 'missing' : 'updated';
}

/** Whether the meal is still there, for a save that changes only its tags (R46.7). */
export async function mealExists(id: string): Promise<boolean> {
  const { data, error, status } = await supabase.from(MEALS).select('id').eq('id', id);
  if (error) throw fail(error, status, { table: MEALS, operation: 'select', recordId: id });
  return data.length > 0;
}

/** Links the tags to the meal. A link that already exists is left as it is (R47.5). */
export async function addTagLinks(
  householdId: string,
  mealId: string,
  tagIds: string[],
): Promise<void> {
  const { error, status } = await supabase.from(LINKS).upsert(
    tagIds.map((tagId) => ({ household_id: householdId, meal_id: mealId, tag_id: tagId })),
    { onConflict: 'meal_id,tag_id', ignoreDuplicates: true },
  );
  if (error) throw fail(error, status, { table: LINKS, operation: 'upsert', recordId: mealId });
}

/** Unlinks the tags from the meal. Removing a link that's already gone still succeeds. */
export async function removeTagLinks(mealId: string, tagIds: string[]): Promise<void> {
  const { error, status } = await supabase
    .from(LINKS)
    .delete()
    .eq('meal_id', mealId)
    .in('tag_id', tagIds);
  if (error) throw fail(error, status, { table: LINKS, operation: 'delete', recordId: mealId });
}

/** Deleting a meal that's already gone still succeeds (R44.5). Its links go with it (R47.6). */
export async function deleteMeal(id: string): Promise<void> {
  const { error, status } = await supabase.from(MEALS).delete().eq('id', id);
  if (error) throw fail(error, status, { table: MEALS, operation: 'delete', recordId: id });
}

/** What a save stored, for the hooks to put in the cached library (design §3.4). */
export interface SaveResult {
  /** The plan's new tags as stored, which may be tags that already existed (DD45). */
  tags: TagRow[];
  /** Every tag this save linked to the meal, new tags included. */
  addedTagIds: string[];
}

/**
 * Runs a save plan's writes in order: new tags, the meal, added links, then removed links, so a
 * link never points at a meal or tag that isn't there yet (design §3.3). The first failure stops
 * the run, and Retry runs the same plan again from the start (R46.4).
 */
export async function runSavePlan(householdId: string, plan: SavePlan): Promise<SaveResult> {
  const tags = plan.newTags.length > 0 ? await upsertTags(householdId, plan.newTags) : [];
  const idByKey = new Map(tags.map((tag) => [tag.name_key, tag.id]));
  // Only possible if JavaScript and Postgres lower-case a character differently (DD44).
  if (plan.newTags.some((name) => !idByKey.has(tagKey(name)))) {
    throw new ApiError('server', { table: TAGS, operation: 'tag_key_mismatch' });
  }

  const { meal } = plan;
  const mealId = meal.kind === 'upsert' ? meal.row.id : meal.id;
  if (meal.kind === 'upsert') {
    await upsertMeal(householdId, meal.row);
  } else if (meal.kind === 'update' && Object.keys(meal.changes).length > 0) {
    if ((await updateMeal(mealId, meal.changes)) === 'missing') {
      throw new ApiError('not_found', { table: MEALS, operation: 'update', recordId: mealId });
    }
  } else if (!(await mealExists(mealId))) {
    throw new ApiError('not_found', { table: MEALS, operation: 'select', recordId: mealId });
  }

  const addedTagIds = [
    ...new Set(
      plan.addTags.map((choice) =>
        choice.kind === 'existing' ? choice.id : idByKey.get(tagKey(choice.name))!,
      ),
    ),
  ];
  if (addedTagIds.length > 0) await addTagLinks(householdId, mealId, addedTagIds);
  if (plan.removeTagIds.length > 0) await removeTagLinks(mealId, plan.removeTagIds);

  return { tags, addedTagIds };
}

// Photos (specs/redesign/design.md §6.4). Objects live under the household's folder, which the
// bucket's policies check, and are never overwritten: a new photo gets a new key.

// storage-js puts the HTTP status on `status`, or as text on `statusCode` in older versions.
function storageStatus(error: object): number | undefined {
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = typeof status === 'number' ? status : Number(statusCode);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

// Only the message's shape is classified (a network failure); its text never leaves (R26.4).
function storageError(error: { message: string }, ctx: { table: string; operation: string }) {
  return toApiError({ message: error.message, status: storageStatus(error) }, ctx);
}

/**
 * Uploads a photo the phone has prepared to `path`. A retry finds its earlier upload already there,
 * which counts as success, so Retry never makes a second object (DD46).
 */
export async function uploadImage(path: string, uri: string): Promise<void> {
  const ctx = { table: IMAGE_BUCKET, operation: 'upload' };
  let body: ArrayBuffer;
  try {
    body = await (await fetch(uri)).arrayBuffer();
  } catch {
    throw new ApiError('server', { ...ctx, operation: 'read_local_image' });
  }
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error === null) return;
  // Storage answers a key that exists with 409, or 400 and "Duplicate" from older versions.
  if (storageStatus(error) === 409 || /duplicate|already exists/i.test(error.message)) return;
  throw storageError(error, ctx);
}

/** Removes photos no meal uses any more. Removing one that's already gone succeeds. */
export async function removeImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove(paths);
  if (error) throw storageError(error, { table: IMAGE_BUCKET, operation: 'remove' });
}

/** Short-lived URLs for the photos, by key. A key Storage can't sign is left out. */
export async function signImageUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrls(paths, IMAGE_URL_SECONDS);
  if (error) throw storageError(error, { table: IMAGE_BUCKET, operation: 'sign' });
  const urls: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
  }
  return urls;
}
