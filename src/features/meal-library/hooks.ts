// The library query and the save and delete mutations (design §3.4). Saves and deletes aren't
// optimistic: the form waits for the outcome and shows it (K24, DD49), so these hooks show no
// toasts. Screens use these hooks and never touch api.ts or Supabase themselves.
import {
  onlineManager,
  queryOptions,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo } from 'react';

import { useHousehold } from '@/features/household/household-provider';
import { ApiError, classifyError } from '@/lib/errors';
import { report, reportOnce } from '@/lib/reporting';

import {
  deleteMeal,
  fetchLibrary,
  removeImages,
  runSavePlan,
  type SaveResult,
  signImageUrls,
  uploadImage,
} from './api';
import { IMAGE_URL_REFRESH_MS } from './constants';
import {
  buildLibrary,
  type CleanMeal,
  constraintField,
  type FormField,
  type Library,
  type Meal,
  type MealRow,
  planSave,
  type SavePlan,
} from './domain';

export const libraryKeys = {
  all: (hid: string) => ['household', hid, 'library'] as const,
  // Outside `all`, so a live library change doesn't re-sign every photo.
  images: (hid: string, paths: string) => ['household', hid, 'meal-images', paths] as const,
};
// The realtime handler defers to pending library mutations by this key's first element (§3.5).
const mutationKey = (hid: string) => ['library-mutation', hid] as const;
// One scope per household, so saves and deletes run one at a time, in the order they were made
// (DD49).
const scope = (hid: string) => ({ id: `library:${hid}` });

// The cache holds the rows as fetched; `select` builds the library from them for each render.
type Rows = Awaited<ReturnType<typeof fetchLibrary>>;

function libraryQuery(householdId: string | null) {
  return queryOptions({
    // The key for a missing household is never fetched, because of skipToken.
    queryKey: libraryKeys.all(householdId ?? ''),
    queryFn: householdId === null ? skipToken : () => fetchLibrary(householdId),
    // The library stays cached while the app runs, so the picker shows it at once (DD59, R45.11).
    // Sign-out clears it with the rest of the cache.
    gcTime: Infinity,
  });
}

function useHouseholdId(): string | null {
  const household = useHousehold();
  return household.status === 'ready' ? household.household.id : null;
}

// Rows that don't parse are left out and reported once each (R46.9, R14.8). reportOnce does the
// deduplicating.
const selectLibrary = (rows: Rows) => buildLibrary(rows.meals, rows.tags);

const EMPTY_LIBRARY: Library = { meals: [], tags: [], tagsById: new Map() };

export interface LibraryView {
  /** Every meal and tag, sorted (R40.4). Empty until the library has loaded. */
  library: Library;
  status: 'loading' | 'ready' | 'error' | 'waiting';
  /** Reloads the library. Resolves once the fetch has finished, which pull to refresh waits for (R40.11). */
  refetch(): Promise<void>;
  /**
   * When the latest fetch failed while the loaded library stays on screen (R40.10), so the screen
   * can tell each failure apart. Null otherwise, including when nothing has loaded (`status: 'error'`).
   */
  refreshFailedAt: number | null;
}

export function useLibrary(): LibraryView {
  const householdId = useHouseholdId();
  const { data, error, errorUpdatedAt, fetchStatus, refetch } = useQuery({
    ...libraryQuery(householdId),
    select: selectLibrary,
  });

  // The facade drops what isn't reportable, such as network errors (R26.2).
  useEffect(() => {
    if (error) report(error);
  }, [error]);

  const reportKeys = data?.reportKeys;
  useEffect(() => {
    reportKeys?.forEach((key) => reportOnce(key));
  }, [reportKeys]);

  // A loaded library stays on screen while a later refetch is offline or fails (R40.10).
  let status: LibraryView['status'] = 'loading';
  if (data) status = 'ready';
  else if (fetchStatus === 'paused')
    status = 'waiting'; // R13.1
  else if (error) status = 'error';

  return {
    library: data?.library ?? EMPTY_LIBRARY,
    status,
    refetch: async () => {
      await refetch();
    },
    refreshFailedAt: data && error ? errorUpdatedAt : null,
  };
}

// The mutations

/**
 * The options and phases the save and delete share (design §3.4). `send` makes the request, and
 * `patch` puts its result in the cached rows before the returned promise resolves (R42.9, R44.3).
 */
function useLibraryMutation<Variables, Result>(
  send: (hid: string, v: Variables) => Promise<Result>,
  patch: (rows: Rows, result: Result, v: Variables) => Rows,
) {
  const queryClient = useQueryClient();
  const householdId = useHouseholdId();
  const hid = householdId ?? '';
  const key = mutationKey(hid);

  const { mutateAsync } = useMutation({
    mutationKey: key,
    scope: scope(hid),
    // Never paused or retried. An offline write fails at once with nothing sent, and the form
    // offers Retry (DD49, R46.3).
    networkMode: 'always',
    retry: false,
    mutationFn: async (v: Variables) => {
      if (!onlineManager.isOnline()) throw new ApiError('network', { operation: 'offline' });
      return send(hid, v);
    },

    onSuccess: async (result, v) => {
      const libraryKey = libraryKeys.all(hid);
      // A refetch already on its way would overwrite the change with the library from before it.
      await queryClient.cancelQueries({ queryKey: libraryKey });
      queryClient.setQueryData<Rows>(libraryKey, (rows) => rows && patch(rows, result, v));
    },

    // Nothing to undo, because nothing was shown early (R46.2). The facade drops what isn't
    // reportable, such as network errors (R26.2).
    onError: (e) => report(classifyError(e)),

    // Only the last pending library mutation refetches, which reconciles with the server (R12.6)
    // and picks up remote changes that the realtime handler deferred meanwhile (R11.5).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: key }) === 1) {
        void queryClient.invalidateQueries({ queryKey: libraryKeys.all(hid) });
      }
    },
  });

  return { householdId, mutateAsync };
}

// The save

export interface SaveMealVariables {
  /** The meal as it was when the form opened, or null for a new meal or Save as new meal. */
  base: Meal | null;
  meal: CleanMeal;
  /** The meal's ID: a new meal's is generated when the form opens, so Retry reuses it (R46.4). */
  mealId: string;
  /** A photo picked in the form, uploaded to `meal.imagePath` before the meal is written. */
  upload?: { uri: string; path: string } | null;
}

export type SaveOutcome =
  | { ok: true; mealId: string }
  | { ok: false; reason: 'offline' | 'deleted' | 'forbidden' | 'failed' }
  | { ok: false; reason: 'invalid'; field: FormField | null };

interface Saved {
  plan: SavePlan;
  result: SaveResult;
}

// Null when an edit changes nothing (R42.11). A picked photo goes up first, so the meal never names
// a photo that isn't there. Once the meal no longer uses its old photo, that's removed; a failure
// there leaves an unused object, never a broken meal (design §6.4).
async function sendSave(hid: string, v: SaveMealVariables): Promise<Saved | null> {
  const plan = planSave(v.base, v.meal, v.mealId);
  if (plan === null) return null;
  if (v.upload) await uploadImage(v.upload.path, v.upload.uri);
  const result = await runSavePlan(hid, plan);
  const replaced = v.base?.imagePath;
  if (replaced && replaced !== v.meal.imagePath) {
    await removeImages([replaced]).catch((e: unknown) => report(classifyError(e)));
  }
  return { plan, result };
}

// The meal row as the save left it: the cached row, or a new one, with the plan's fields and links.
// Starting from the cached row keeps a change the other member made since the form opened (R46.5).
// An edit of a meal the cache doesn't hold is left to the refetch.
function savedRow(cached: MealRow | undefined, { plan, result }: Saved): MealRow | null {
  const { meal } = plan;
  let fields: Pick<
    MealRow,
    'id' | 'name' | 'description' | 'ingredients' | 'meal_type' | 'image_path'
  >;
  if (meal.kind === 'upsert') {
    const { mealType, imagePath, ...rest } = meal.row;
    fields = { ...rest, meal_type: mealType, image_path: imagePath };
  } else if (cached === undefined) return null;
  else if (meal.kind === 'update') {
    const { mealType, imagePath, ...rest } = meal.changes;
    fields = {
      ...cached,
      ...rest,
      ...(mealType !== undefined && { meal_type: mealType }),
      ...(imagePath !== undefined && { image_path: imagePath }),
    };
  } else fields = cached;

  const removed = new Set(plan.removeTagIds);
  const tagIds = new Set([
    ...(cached?.library_meal_tags.map((link) => link.tag_id) ?? []),
    ...result.addedTagIds,
  ]);
  return {
    id: fields.id,
    name: fields.name,
    description: fields.description,
    ingredients: fields.ingredients,
    meal_type: fields.meal_type,
    image_path: fields.image_path,
    // The database's time arrives with the refetch.
    updated_at: new Date().toISOString(),
    library_meal_tags: [...tagIds].filter((id) => !removed.has(id)).map((tag_id) => ({ tag_id })),
  };
}

// The rows with the saved meal and its new tags in place. `select` sorts them (R40.4).
function putSaved(rows: Rows, saved: Saved | null): Rows {
  if (saved === null) return rows;
  const savedTagIds = new Set(saved.result.tags.map((tag) => tag.id));
  const tags = [...rows.tags.filter((tag) => !savedTagIds.has(tag.id)), ...saved.result.tags];
  const { meal } = saved.plan;
  const id = meal.kind === 'upsert' ? meal.row.id : meal.id;
  const row = savedRow(
    rows.meals.find((r) => r.id === id),
    saved,
  );
  const meals = row === null ? rows.meals : [...rows.meals.filter((r) => r.id !== id), row];
  return { meals, tags };
}

function saveOutcome(error: ApiError): SaveOutcome {
  switch (error.category) {
    case 'network': // offline, or the connection dropped mid-save (R46.3)
      return { ok: false, reason: 'offline' };
    case 'not_found': // deleted on another device (R46.7)
      return { ok: false, reason: 'deleted' };
    case 'forbidden':
      return { ok: false, reason: 'forbidden' };
    case 'validation': // the field whose CHECK rejected it (R42.10, DD58)
      return { ok: false, reason: 'invalid', field: constraintField(error.meta.constraint) };
    default:
      return { ok: false, reason: 'failed' };
  }
}

/**
 * Saves a meal from the form (DD46). Resolves once the save has finished, with the library already
 * showing it, or once it has failed with nothing changed (R42.9, R42.10). An unchanged edit sends
 * nothing and succeeds.
 */
export function useSaveMeal(): (v: SaveMealVariables) => Promise<SaveOutcome> {
  const { householdId, mutateAsync } = useLibraryMutation(sendSave, putSaved);

  return useCallback(
    async (v: SaveMealVariables) => {
      // The form can't open before the library has loaded, so this doesn't happen in practice.
      if (householdId === null) return { ok: false, reason: 'failed' };
      try {
        await mutateAsync(v);
        return { ok: true, mealId: v.mealId };
      } catch (e) {
        return saveOutcome(classifyError(e));
      }
    },
    [householdId, mutateAsync],
  );
}

// The delete

export type DeleteOutcome =
  { ok: true } | { ok: false; reason: 'offline' | 'forbidden' | 'failed' };

interface DeleteVariables {
  id: string;
  imagePath: string | null;
}

// The photo goes after the meal, and a failure there leaves only an unused object (design §6.4).
async function sendDelete(_: string, { id, imagePath }: DeleteVariables): Promise<void> {
  await deleteMeal(id);
  if (imagePath) await removeImages([imagePath]).catch((e: unknown) => report(classifyError(e)));
}

// Its links are embedded in the meal's row, so they go with it (R47.6).
const removeMeal = (rows: Rows, _: void, { id }: DeleteVariables): Rows => ({
  ...rows,
  meals: rows.meals.filter((r) => r.id !== id),
});

function deleteOutcome(error: ApiError): DeleteOutcome {
  if (error.category === 'network') return { ok: false, reason: 'offline' }; // R46.3
  if (error.category === 'forbidden') return { ok: false, reason: 'forbidden' };
  return { ok: false, reason: 'failed' }; // R44.4
}

/**
 * Deletes a meal (R44). A meal that's already gone counts as deleted (R44.5), so there's no
 * `deleted` outcome. Resolves with the library no longer showing it, or with it still listed.
 */
export function useDeleteMeal(): (id: string, imagePath?: string | null) => Promise<DeleteOutcome> {
  const { householdId, mutateAsync } = useLibraryMutation(sendDelete, removeMeal);

  return useCallback(
    async (id: string, imagePath: string | null = null) => {
      if (householdId === null) return { ok: false, reason: 'failed' };
      try {
        await mutateAsync({ id, imagePath });
        return { ok: true };
      } catch (e) {
        return deleteOutcome(classifyError(e));
      }
    },
    [householdId, mutateAsync],
  );
}

// Photos

/** A fresh Storage key in the household's folder, for a photo just picked (design §6.4). */
export function useNewImagePath(): () => string | null {
  const householdId = useHouseholdId();
  return useCallback(
    () => (householdId === null ? null : `${householdId}/${randomUUID()}.jpg`),
    [householdId],
  );
}

const NO_URLS: Readonly<Record<string, string>> = {};

/**
 * Signed URLs for the given photos, by key (design §6.4). One request signs them all; the URLs last
 * an hour, and are signed afresh after 45 minutes on screen. A key that can't be signed is missing,
 * and its meal shows the placeholder. Failures aren't toasted: the photos are a nicety.
 */
export function useMealImageUrls(paths: (string | null)[]): Readonly<Record<string, string>> {
  const householdId = useHouseholdId();
  const key = useMemo(
    () => [...new Set(paths.filter((p): p is string => p !== null))].sort().join('|'),
    [paths],
  );
  const { data, error } = useQuery({
    queryKey: libraryKeys.images(householdId ?? '', key),
    queryFn: householdId === null || key === '' ? skipToken : () => signImageUrls(key.split('|')),
    staleTime: IMAGE_URL_REFRESH_MS,
    refetchInterval: IMAGE_URL_REFRESH_MS,
    // Keep the URLs shown while a new set is signed, so photos don't blink as meals change.
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (error) report(classifyError(error));
  }, [error]);

  return data ?? NO_URLS;
}
