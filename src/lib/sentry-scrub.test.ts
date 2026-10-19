import { makeJwt } from '@/test/jwt';

import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

const RECORD_ID = '3f2a8c1e-7b4d-4e9a-a1c2-5d6e7f8a9b0c';
const JWT = makeJwt({ sub: RECORD_ID, role: 'authenticated' });
// Assembled at runtime, so the secrets scanner (R25.3) doesn't flag this file.
const SECRET_KEY = 'sb_secret_' + 'x'.repeat(32);
const PUBLISHABLE_KEY = 'sb_publishable_' + 'y'.repeat(32);
const EMAIL = 'member@example.test';
const REST_URL = 'https://abcdefghijklmnopqrst.supabase.co/rest/v1/grocery_items';

describe('scrubEvent', () => {
  it('U-SCR-01 removes the request, with its headers, body and cookies', () => {
    const scrubbed = scrubEvent({
      message: 'server',
      request: {
        url: `${REST_URL}?select=*`,
        headers: { Authorization: `Bearer ${JWT}`, apikey: PUBLISHABLE_KEY },
        data: '{"name":"Milk"}',
        cookies: { session: 'cookie-value' },
      },
    });

    expect(scrubbed).not.toHaveProperty('request');
    expect(scrubbed).toEqual({ message: 'server' });
  });

  it('U-SCR-02 keeps only the account ID of the user', () => {
    const scrubbed = scrubEvent({
      user: { id: RECORD_ID, email: EMAIL, username: 'Member', ip_address: '192.0.2.1' },
    });

    expect(scrubbed.user).toEqual({ id: RECORD_ID });
  });

  it('removes a user that has no ID', () => {
    expect(scrubEvent({ user: { email: EMAIL } })).not.toHaveProperty('user');
  });

  it('U-SCR-09 removes server_name', () => {
    expect(scrubEvent({ server_name: 'Member-iPhone', message: 'crash' })).toEqual({
      message: 'crash',
    });
  });

  it.each([
    ['a JWT', `token ${JWT} rejected`, JWT],
    ['a secret key', `key ${SECRET_KEY} rejected`, SECRET_KEY],
    ['a publishable key', `key ${PUBLISHABLE_KEY} rejected`, PUBLISHABLE_KEY],
    ['an apikey parameter', 'socket apikey=opaque-key-value&vsn=2.0.0 closed', 'opaque-key-value'],
    ['a Bearer token', 'header Bearer opaque-token-value sent', 'opaque-token-value'],
    ['an email address', `no account for ${EMAIL}`, EMAIL],
  ])(
    'U-SCR-06 redacts %s in the message, tags, extra, contexts, exceptions and breadcrumbs',
    (_kind, text, secret) => {
      const scrubbed = scrubEvent({
        message: text,
        logentry: { message: text, params: [text] },
        tags: { note: text },
        extra: { nested: { list: [text] } },
        contexts: { custom: { value: text } },
        exception: { values: [{ type: 'Error', value: text }] },
        breadcrumbs: [{ category: 'ui.click', message: text, data: { note: text } }],
      });

      const fields = [
        scrubbed.message,
        scrubbed.logentry.message,
        scrubbed.logentry.params[0],
        scrubbed.tags.note,
        scrubbed.extra.nested.list[0],
        scrubbed.contexts.custom.value,
        scrubbed.exception.values[0].value,
        scrubbed.breadcrumbs[0].message,
        scrubbed.breadcrumbs[0].data.note,
      ];
      for (const field of fields) {
        expect(field).toContain('[redacted]');
        expect(field).not.toContain(secret);
      }
    },
  );

  it.each([
    'new row for relation "grocery_items" violates check constraint "name_length" Failing row contains (… Milk …).',
    'duplicate key value violates unique constraint "grocery_items_list_id_lower_name_key" Key (list_id, lower(name))=(…, milk) already exists.',
    'insert or update violates foreign key constraint\nDETAIL: Key is not present.',
  ])('U-SCR-07 replaces an exception value with Postgres row data: %s', (value) => {
    const scrubbed = scrubEvent({ exception: { values: [{ type: 'Error', value }] } });

    expect(scrubbed.exception.values[0].value).toBe('[redacted]');
  });

  it('U-SCR-08 leaves the allowed fields intact', () => {
    const event = {
      message: 'membership_multiple',
      exception: { values: [{ type: 'ApiError', value: 'conflict_duplicate' }] },
      tags: { category: 'forbidden', table: 'grocery_items', operation: 'update', code: '42501' },
      extra: { code: '23505', status: 403, recordId: RECORD_ID, channelStatus: 'disconnected' },
      contexts: { app: { app_version: '1.0.0' }, os: { name: 'iOS', version: '18.5' } },
      user: { id: RECORD_ID },
      // Sentry's `bundle@version+build` releases look like email addresses.
      release: 'com.example.kitchin@1.0.0+5',
      dist: '5',
      environment: 'production',
      timestamp: 1_760_000_000,
    };

    expect(scrubEvent(event)).toEqual(event);
  });

  it('scrubs the breadcrumbs already on the event', () => {
    const scrubbed = scrubEvent({
      breadcrumbs: [
        { category: 'console', message: `signed in as ${EMAIL}` },
        { category: 'fetch', data: { method: 'GET', url: `${REST_URL}?name=eq.Milk` } },
      ],
    });

    expect(scrubbed.breadcrumbs).toEqual([
      { category: 'fetch', data: { method: 'GET', url: REST_URL } },
    ]);
  });

  it('strips query strings and fragments from URLs anywhere in the event', () => {
    const scrubbed = scrubEvent({
      message: `request to ${REST_URL}?name=eq.Milk&select=* failed`,
      extra: { socket: 'wss://abcdefghijklmnopqrst.supabase.co/realtime/v1/websocket#vsn=2.0.0' },
    });

    expect(scrubbed.message).toBe(`request to ${REST_URL} failed`);
    expect(scrubbed.extra.socket).toBe(
      'wss://abcdefghijklmnopqrst.supabase.co/realtime/v1/websocket',
    );
  });

  it("doesn't change the event it was given", () => {
    const event = { message: EMAIL, user: { id: RECORD_ID, email: EMAIL }, server_name: 'host' };
    const copy = structuredClone(event);

    scrubEvent(event);

    expect(event).toEqual(copy);
  });
});

describe('scrubBreadcrumb', () => {
  // `http` is the native iOS SDK's own request breadcrumb, which Sentry merges into JS events.
  it.each(['fetch', 'xhr', 'http'])(
    'U-SCR-03 keeps only the method, the URL without its query, and the status of a %s request',
    (category) => {
      const scrubbed = scrubBreadcrumb({
        type: 'http',
        category,
        level: 'info',
        timestamp: 1_760_000_000,
        data: {
          method: 'GET',
          url: `${REST_URL}?name=eq.Milk&select=*`,
          status_code: 200,
          request_body_size: 18,
          response_body_size: 512,
        },
      });

      expect(scrubbed).toEqual({
        type: 'http',
        category,
        level: 'info',
        timestamp: 1_760_000_000,
        data: { method: 'GET', url: REST_URL, status_code: 200 },
      });
    },
  );

  it('U-SCR-04 keeps only the navigation paths, without their query strings', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'navigation',
      data: {
        from: '/groceries?item=Milk',
        to: '/add-item?name=Milk#top',
        params: { name: 'Milk' },
      },
    });

    expect(scrubbed).toEqual({
      category: 'navigation',
      data: { from: '/groceries', to: '/add-item' },
    });
  });

  it("U-SCR-04 keeps the method and path of Sentry's Expo Router navigation breadcrumbs", () => {
    const scrubbed = scrubBreadcrumb({
      category: 'navigation',
      data: { method: 'push', pathname: '/add-item?name=Milk', href: '/add-item?name=Milk' },
    });

    expect(scrubbed?.data).toEqual({ method: 'push', pathname: '/add-item' });
  });

  it('U-SCR-05 drops console breadcrumbs', () => {
    expect(
      scrubBreadcrumb({ category: 'console', message: 'Milk', data: { arguments: ['Milk'] } }),
    ).toBeNull();
  });

  it('redacts secrets in any other breadcrumb', () => {
    expect(
      scrubBreadcrumb({ category: 'auth', message: `signed in as ${EMAIL}`, data: { jwt: JWT } }),
    ).toEqual({
      category: 'auth',
      message: 'signed in as [redacted]',
      data: { jwt: '[redacted]' },
    });
  });

  it('leaves values that are not strings, arrays or plain objects as they are', () => {
    const at = new Date(0);
    const scrubbed = scrubBreadcrumb({
      category: 'app',
      data: { at, count: 2, ok: true, none: null },
    });

    expect(scrubbed?.data).toEqual({ at, count: 2, ok: true, none: null });
    expect(scrubbed?.data?.at).toBe(at);
  });

  it('survives circular data', () => {
    const data: Record<string, unknown> = { note: EMAIL };
    data.self = data;

    expect(scrubBreadcrumb({ category: 'app', data })).toEqual({
      category: 'app',
      data: { note: '[redacted]', self: '[circular]' },
    });
  });
});
