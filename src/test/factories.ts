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
