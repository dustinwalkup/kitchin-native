import {
  HOUSEHOLD_TEXT,
  makeAuthError,
  makePostgrestError,
  makePostgrestFetchError,
} from '@/test/factories';

import {
  ApiError,
  classifyError,
  isRetryable,
  REPORTABLE,
  toApiError,
  type ErrorCategory,
} from './errors';

const CATEGORIES: ErrorCategory[] = [
  'network',
  'auth_expired',
  'forbidden',
  'conflict_duplicate',
  'not_found',
  'validation',
  'server',
  'realtime_degraded',
  'crash',
];

const CTX = { table: 'grocery_items', operation: 'insert' };

describe('classifyError', () => {
  it.each([
    ['a failed request', new TypeError('Network request failed')],
    ['a timed-out request', new TypeError('Network request timed out')],
    ['a failed request', makePostgrestFetchError(new TypeError('Network request failed'))],
    ['a timed-out request', makePostgrestFetchError(new TypeError('Network request timed out'))],
  ])('U-ERR-01 maps %s to network', (_, e) => {
    const error = classifyError(e);
    expect(error.category).toBe('network');
    expect(isRetryable(error)).toBe(true);
  });

  it.each([
    ['a rejected fetch', makeAuthError('retryable_fetch'), 0],
    ['a gateway 5xx', makeAuthError('retryable_gateway'), 503],
  ])('U-ERR-02 maps AuthRetryableFetchError from %s to network', (_, e, status) => {
    expect(classifyError(e)).toMatchObject({ category: 'network', meta: { status } });
  });

  it('U-ERR-03 keeps the status and code of an AuthApiError 400, which sign-in reads', () => {
    expect(classifyError(makeAuthError('invalid_credentials'))).toMatchObject({
      category: 'auth_expired',
      meta: { status: 400, code: 'invalid_credentials' },
    });
  });

  it.each([
    ['AuthApiError 401', makeAuthError('unauthorized')],
    ['a refresh failure', makeAuthError('refresh_failed')],
    ['a missing session', makeAuthError('session_missing')],
    ['HTTP 401', makePostgrestError('', { status: 401 })],
    ['PGRST301', makePostgrestError('PGRST301', { status: 401 })],
    ['PGRST303', makePostgrestError('PGRST303', { status: 401 })],
  ])('U-ERR-04 maps %s to auth_expired', (_, e) => {
    expect(classifyError(e).category).toBe('auth_expired');
  });

  it.each([
    ['Postgres 42501', makePostgrestError('42501', { status: 403 })],
    ['42501 even with an anonymous 401', makePostgrestError('42501', { status: 401 })],
    ['HTTP 403', makePostgrestError('', { status: 403 })],
  ])('U-ERR-05 maps %s to forbidden', (_, e) => {
    expect(classifyError(e).category).toBe('forbidden');
  });

  it.each(['grocery_items_one_open_per_name', 'grocery_items_pkey'])(
    'U-ERR-06/07 maps 23505 to conflict_duplicate with the constraint %s',
    (constraint) => {
      expect(classifyError(makePostgrestError('23505', { constraint, status: 409 }))).toEqual(
        expect.objectContaining({
          category: 'conflict_duplicate',
          meta: { code: '23505', status: 409, constraint },
        }),
      );
    },
  );

  it('keeps no constraint when a 23505 message has none', () => {
    expect(classifyError(makePostgrestError('23505')).meta).toEqual({ code: '23505' });
  });

  it.each(['23514', '22001', '23502'])('U-ERR-08 maps %s to validation', (code) => {
    expect(classifyError(makePostgrestError(code, { status: 400 }))).toMatchObject({
      category: 'validation',
      meta: { code, status: 400 },
    });
  });

  it('U-ERR-09 maps 23503 to server', () => {
    expect(classifyError(makePostgrestError('23503', { status: 409 })).category).toBe('server');
  });

  it.each([
    ['HTTP 500', makePostgrestError('XX000', { status: 500 })],
    ['a 503 from PostgREST', makePostgrestError('PGRST002', { status: 503 })],
    ['a 502 with a non-JSON body', { message: '<html>502 Bad Gateway</html>', status: 502 }],
    ['an unknown PGRST code', makePostgrestError('PGRST116', { status: 406 })],
    ['an AuthApiError 429', makeAuthError('rate_limited')],
    ['an AuthApiError 500', makeAuthError('server')],
    ['an AuthUnknownError', makeAuthError('unknown')],
    ['a TypeError that is a bug, not the network', new TypeError('x is not a function')],
    ['an Error', new Error('boom')],
    ['a string', 'boom'],
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
  ])('U-ERR-10 maps %s to server', (_, e) => {
    expect(classifyError(e).category).toBe('server');
  });

  it.each([
    ['42501', makePostgrestError('42501', { status: 403 })],
    ['23505', makePostgrestError('23505', { constraint: 'grocery_items_pkey', status: 409 })],
    ['23514', makePostgrestError('23514', { status: 400 })],
    ['500', makePostgrestError('XX000', { status: 500 })],
  ])('U-ERR-11 drops the message, details and hint of a %s error', (_, e) => {
    const error = toApiError(e, { ...CTX, recordId: 'item-1' });

    expect(error.message).not.toContain(HOUSEHOLD_TEXT);
    expect(error.stack).not.toContain(HOUSEHOLD_TEXT);
    expect(JSON.stringify(error)).not.toContain(HOUSEHOLD_TEXT);
    expect(JSON.stringify(error.meta)).not.toContain(HOUSEHOLD_TEXT);
    expect(error).not.toHaveProperty('details');
    expect(error).not.toHaveProperty('hint');
    expect(error.cause).toBeUndefined();
  });

  it('U-ERR-11 drops a code or status that is not shaped like one', () => {
    const e = { code: `bad ${HOUSEHOLD_TEXT}`, status: '500', message: HOUSEHOLD_TEXT };
    expect(classifyError(e).meta).toEqual({});
  });

  it('U-ERR-12 returns an existing ApiError unchanged', () => {
    const error = new ApiError('not_found', { table: 'grocery_items' });
    expect(classifyError(error)).toBe(error);
  });
});

describe('toApiError', () => {
  it('adds the table, operation and record ID', () => {
    const error = toApiError(makePostgrestError('42501', { status: 403 }), {
      ...CTX,
      recordId: 'item-1',
    });
    expect(error.meta).toEqual({
      code: '42501',
      status: 403,
      table: 'grocery_items',
      operation: 'insert',
      recordId: 'item-1',
    });
  });

  it('leaves out a missing record ID', () => {
    expect(toApiError(new Error('boom'), CTX).meta).toEqual(CTX);
  });

  it('keeps the category and meta of an existing ApiError', () => {
    const error = toApiError(new ApiError('not_found', { code: 'zero_rows' }), CTX);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ category: 'not_found', meta: { code: 'zero_rows', ...CTX } });
  });
});

describe('ApiError', () => {
  it("is an Error whose message is the category, never the server's text", () => {
    const error = new ApiError('forbidden', { code: '42501' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('forbidden');
  });
});

describe('isRetryable', () => {
  it.each(CATEGORIES)('is true only for network (%s)', (category) => {
    expect(isRetryable(new ApiError(category, {}))).toBe(category === 'network');
  });
});

describe('REPORTABLE', () => {
  it('reports what R26.1 lists and nothing that R26.2 excludes', () => {
    expect(REPORTABLE).toEqual({
      network: false,
      auth_expired: false,
      forbidden: true,
      conflict_duplicate: false,
      not_found: false,
      validation: true,
      server: true,
      realtime_degraded: true,
      crash: true,
    });
  });
});
