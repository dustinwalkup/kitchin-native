// Turns any failure into an ApiError with a category from specs/mvp/2-design.md §6. Server-provided
// text (`message`, `details`, `hint`) can contain row values, so only the error code, the HTTP status
// and a unique constraint's name survive classification (§3.8, R26.3, R26.4).

export type ErrorCategory =
  | 'network'
  | 'auth_expired'
  | 'forbidden'
  | 'conflict_duplicate'
  | 'not_found'
  | 'validation'
  | 'server'
  | 'realtime_degraded'
  | 'crash';

export interface ApiErrorMeta {
  code?: string;
  status?: number;
  constraint?: string;
  table?: string;
  operation?: string;
  recordId?: string;
}

export class ApiError extends Error {
  name = 'ApiError';

  constructor(
    readonly category: ErrorCategory,
    readonly meta: ApiErrorMeta,
  ) {
    // The message is always the category. It never contains server-provided text.
    super(category);
  }
}

/** Categories that go to error reporting (R26.1). The rest are expected outcomes (R26.2). */
export const REPORTABLE: Record<ErrorCategory, boolean> = {
  network: false,
  auth_expired: false,
  forbidden: true,
  conflict_duplicate: false,
  not_found: false,
  validation: true,
  server: true,
  realtime_degraded: true,
  crash: true,
};

/** Only network failures are worth retrying; everything else fails the same way again (R14.1). */
export function isRetryable(e: ApiError): boolean {
  return e.category === 'network';
}

// React Native's fetch rejects with a TypeError carrying one of these messages. postgrest-js turns
// the rejection into an error object whose message is prefixed with the error's name.
const NETWORK_MESSAGE = /^(TypeError: )?Network request (failed|timed out)$/;

// Postgres SQLSTATEs, PostgREST `PGRST…` codes and Supabase Auth codes. Anything else in the `code`
// field is server text and is dropped.
const CODE = /^[A-Za-z0-9_]{1,64}$/;

const CODE_CATEGORY = new Map<string, ErrorCategory>([
  ['42501', 'forbidden'],
  ['23505', 'conflict_duplicate'],
  ['23514', 'validation'],
  ['22001', 'validation'],
  ['23502', 'validation'],
  ['23503', 'server'],
  ['PGRST301', 'auth_expired'],
  ['PGRST303', 'auth_expired'],
]);

const UNIQUE_CONSTRAINT = /unique constraint "([^"]+)"/;

/**
 * Classifies a Supabase Auth error, a PostgREST error (with the response's `status` copied on), a
 * fetch rejection or any other thrown value. Returns an existing ApiError unchanged.
 */
export function classifyError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (typeof e !== 'object' || e === null) return new ApiError('server', {});

  const { name, message, code, status } = e as Record<string, unknown>;
  const meta: ApiErrorMeta = {};
  if (typeof code === 'string' && CODE.test(code)) meta.code = code;
  if (typeof status === 'number' && Number.isInteger(status)) meta.status = status;

  let category: ErrorCategory;
  if (
    name === 'AuthRetryableFetchError' ||
    (typeof message === 'string' && NETWORK_MESSAGE.test(message))
  ) {
    category = 'network';
  } else if (meta.code !== undefined && CODE_CATEGORY.has(meta.code)) {
    category = CODE_CATEGORY.get(meta.code)!;
  } else if (meta.status === 401 || ('__isAuthError' in e && meta.status === 400)) {
    // Supabase Auth answers a failed refresh, a missing session and bad credentials with a 400.
    // Sign-in tells bad credentials apart by the status (R2.5).
    category = 'auth_expired';
  } else if (meta.status === 403) {
    category = 'forbidden';
  } else {
    category = 'server';
  }

  if (category === 'conflict_duplicate' && typeof message === 'string') {
    const constraint = UNIQUE_CONSTRAINT.exec(message)?.[1];
    if (constraint !== undefined) meta.constraint = constraint;
  }

  return new ApiError(category, meta);
}

/** What `api.ts` throws: the classified error, labelled with where it happened. */
export function toApiError(
  e: unknown,
  ctx: { table: string; operation: string; recordId?: string },
): ApiError {
  const { category, meta } = classifyError(e);
  return new ApiError(category, { ...meta, ...ctx });
}
