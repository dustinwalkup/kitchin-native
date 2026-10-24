// Fixture builders shared by unit tests (specs/mvp/4-test-plan.md §8.3).
import {
  AuthApiError,
  type AuthError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
  type Session,
} from '@supabase/supabase-js';

import type { GroceryItem, GroceryItemRow } from '@/features/groceries/domain';
import {
  foldForSearch,
  tagKey,
  type Meal,
  type MealRow,
  type Tag,
  type TagRow,
} from '@/features/meal-library/domain';
import type { MealEntry, MealEntryRow } from '@/features/meals/domain';
import type { IsoDate } from '@/lib/calendar';

import { makeJwt } from './jwt';

/** Household text that error fixtures embed, so tests can prove it never survives classification. */
export const HOUSEHOLD_TEXT = 'Milk';

/**
 * A PostgREST error as `api.ts` passes it to `toApiError`: the response's `error` object, with the
 * response's HTTP `status` copied on. Postgres puts row values in `details` (and sometimes in
 * `message` and `hint`), so every fixture carries household text there (U-ERR-11).
 */
export function makePostgrestError(
  code: string,
  { constraint, status }: { constraint?: string; status?: number } = {},
) {
  return {
    code,
    message:
      constraint === undefined
        ? `Request failed for "${HOUSEHOLD_TEXT}"`
        : `duplicate key value violates unique constraint "${constraint}"`,
    details: `Failing row contains (${HOUSEHOLD_TEXT}, 2 cartons).`,
    hint: `Check the row for "${HOUSEHOLD_TEXT}".`,
    ...(status === undefined ? {} : { status }),
  };
}

/** What postgrest-js returns as `error` when `fetch` itself rejects (no response, status 0). */
export function makePostgrestFetchError(fetchError: Error) {
  return {
    code: '',
    message: `${fetchError.name}: ${fetchError.message}`,
    details: fetchError.stack ?? '',
    hint: '',
    status: 0,
  };
}

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'refresh_failed'
  | 'unauthorized'
  | 'session_not_found'
  | 'session_missing'
  | 'rate_limited'
  | 'server'
  | 'retryable_fetch'
  | 'retryable_gateway'
  | 'unknown';

/** The errors supabase-js's auth client returns, built from its own classes. */
export function makeAuthError(kind: AuthErrorKind): AuthError {
  switch (kind) {
    case 'invalid_credentials':
      return new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
    case 'refresh_failed':
      return new AuthApiError(
        'Invalid Refresh Token: Refresh Token Not Found',
        400,
        'refresh_token_not_found',
      );
    case 'unauthorized':
      return new AuthApiError('JWT expired', 401, 'bad_jwt');
    case 'session_not_found':
      return new AuthApiError('Session not found', 403, 'session_not_found');
    case 'session_missing':
      return new AuthSessionMissingError();
    case 'rate_limited':
      return new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit');
    case 'server':
      return new AuthApiError('Unexpected failure', 500, 'unexpected_failure');
    case 'retryable_fetch':
      // auth-js wraps a rejected fetch with status 0 and the original message.
      return new AuthRetryableFetchError('Network request failed', 0);
    case 'retryable_gateway':
      return new AuthRetryableFetchError('Service Unavailable', 503);
    case 'unknown':
      return new AuthUnknownError('Unexpected token < in JSON', new SyntaxError());
  }
}

/** A signed-in session whose access token expires in an hour. */
export function makeSession(userId = 'user-a'): Session {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: makeJwt({ sub: userId, role: 'authenticated', exp: expiresAt }),
    refresh_token: `refresh-${userId}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: {
      id: userId,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

/** An open grocery item. A checked one gets a `checkedAt` unless the overrides set it. */
export function makeItem(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: 'item-1',
    listId: 'list-1',
    name: 'Bread',
    category: 'bakery',
    quantity: null,
    isChecked: false,
    checkedAt: overrides.isChecked ? '2026-10-18T12:30:00+00:00' : null,
    createdAt: '2026-10-18T12:00:00+00:00',
    ...overrides,
  };
}

/** The `grocery_items` row that `makeItem()` comes from, as `api.ts` selects it. */
export function makeRow(overrides: Partial<GroceryItemRow> = {}): GroceryItemRow {
  return {
    id: 'item-1',
    list_id: 'list-1',
    name: 'Bread',
    category: 'bakery',
    quantity: null,
    is_checked: false,
    checked_at: null,
    created_at: '2026-10-18T12:00:00+00:00',
    ...overrides,
  };
}

/** A planned dinner. `date` takes a plain 'YYYY-MM-DD' string, so tests needn't cast to `IsoDate`. */
export function makeMealEntry(
  overrides: Partial<Omit<MealEntry, 'date'>> & { date?: string } = {},
): MealEntry {
  const { date = '2026-10-19', ...rest } = overrides;
  return {
    id: 'entry-1',
    date: date as IsoDate,
    mealType: 'dinner',
    body: 'Tacos',
    updatedAt: '2026-10-19T12:00:00+00:00',
    ...rest,
  };
}

/** The `meal_entries` row that `makeMealEntry()` comes from, as `api.ts` selects it. */
export function makeEntryRow(overrides: Partial<MealEntryRow> = {}): MealEntryRow {
  return {
    id: 'entry-1',
    meal_date: '2026-10-19',
    meal_type: 'dinner',
    body: 'Tacos',
    updated_at: '2026-10-19T12:00:00+00:00',
    ...overrides,
  };
}

/** A saved meal with no tags. Its `searchKey` follows its name unless the overrides set it. */
export function makeLibraryMeal(overrides: Partial<Meal> = {}): Meal {
  const name = overrides.name ?? 'Tacos';
  return {
    id: 'meal-1',
    name,
    description: null,
    ingredients: null,
    tagIds: [],
    searchKey: foldForSearch(name),
    updatedAt: '2026-10-19T12:00:00+00:00',
    ...overrides,
  };
}

/** A household tag. Its `key` follows its name unless the overrides set it. */
export function makeLibraryTag(overrides: Partial<Tag> = {}): Tag {
  const name = overrides.name ?? 'Dinner';
  return { id: 'tag-1', name, key: tagKey(name), ...overrides };
}

/**
 * The `library_meals` row, with its links, that `makeLibraryMeal()` comes from, as `api.ts`
 * selects it.
 */
export function makeMealRow(overrides: Partial<MealRow> = {}): MealRow {
  return {
    id: 'meal-1',
    name: 'Tacos',
    description: null,
    ingredients: null,
    updated_at: '2026-10-19T12:00:00+00:00',
    library_meal_tags: [],
    ...overrides,
  };
}

/**
 * The `library_tags` row that `makeLibraryTag()` comes from. Its `name_key` follows its name, as
 * the generated column does.
 */
export function makeTagRow(overrides: Partial<TagRow> = {}): TagRow {
  const name = overrides.name ?? 'Dinner';
  return { id: 'tag-1', name, name_key: tagKey(name), ...overrides };
}
