import { makeJwt } from '@/test/jwt';

import {
  assertBackendUrl,
  assertPublishableKey,
  assertSentryDsn,
  ConfigError,
  parseVariant,
  type AppVariant,
} from './env-guard';

const URL_VAR = 'EXPO_PUBLIC_SUPABASE_URL';
const KEY_VAR = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const DSN_VAR = 'EXPO_PUBLIC_SENTRY_DSN';

const VARIANTS: AppVariant[] = ['development', 'production'];

// Built at runtime so this file never contains a secret-key pattern (25.3).
const SECRET_KEY = `sb_secret_${'x'.repeat(32)}`;
const PUBLISHABLE_KEY = 'sb_publishable_abcDEF123_-xyz';
const ANON_JWT = makeJwt({ iss: 'supabase-demo', role: 'anon', exp: 1983812996 });
const SERVICE_ROLE_JWT = makeJwt({ iss: 'supabase-demo', role: 'service_role' });
const SUPABASE_ADMIN_JWT = makeJwt({ role: 'supabase_admin' });
const DSN = 'https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/0';

describe('parseVariant', () => {
  it('U-ENV-01 defaults to development and accepts both variants', () => {
    expect(parseVariant(undefined)).toBe('development');
    expect(parseVariant('development')).toBe('development');
    expect(parseVariant('production')).toBe('production');
  });

  it.each(['staging', '', 'Production'])('U-ENV-01 throws on %j', (raw) => {
    expect(() => parseVariant(raw)).toThrow(ConfigError);
  });
});

describe('assertBackendUrl', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://192.168.1.20:54321',
    'http://10.0.0.5:54321',
    'http://172.16.0.2:54321',
    'http://laptop.local:54321',
    'https://localhost:54321/',
    'http://[::1]:54321',
  ])('U-ENV-02 development accepts %s', (url) => {
    expect(() => assertBackendUrl('development', url)).not.toThrow();
  });

  it.each([
    'https://abcd.supabase.co',
    'http://example.com',
    'http://172.32.0.1',
    'http://127.0.0.1.example.com:54321',
    'http://user@127.0.0.1:54321',
    'http://127.0.0.1:54321/rest/v1',
    'ftp://127.0.0.1',
    'localhost:54321',
    '',
  ])('U-ENV-03 development rejects %j', (url) => {
    expect(() => assertBackendUrl('development', url)).toThrow(ConfigError);
  });

  it.each(['https://abcdefghijklmnop.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co/'])(
    'U-ENV-04 production accepts %s',
    (url) => {
      expect(() => assertBackendUrl('production', url)).not.toThrow();
    },
  );

  it.each([
    'http://abcd.supabase.co',
    'https://127.0.0.1',
    'https://evil.com/x.supabase.co',
    'https://abcd.supabase.co.evil.com',
    'https://abcd.supabase.co@evil.com',
    'https://abcd.supabase.co:8443',
    'https://supabase.co',
    'https://localhost:54321',
    'http://127.0.0.1:54321',
  ])('U-ENV-05 production rejects %s', (url) => {
    expect(() => assertBackendUrl('production', url)).toThrow(ConfigError);
  });
});

describe('assertPublishableKey', () => {
  // These keys would also fail the format check, so assert the specific reason: the dedicated checks
  // must still recognise a privileged key.
  describe.each(VARIANTS)('U-ENV-06 %s', (variant) => {
    it.each([
      ['a secret key', SECRET_KEY, /holds a secret key/],
      ['a service_role JWT', SERVICE_ROLE_JWT, /holds a privileged/],
      ['a supabase_admin JWT', SUPABASE_ADMIN_JWT, /holds a privileged/],
    ])('rejects %s', (_name, key, reason) => {
      expect(() => assertPublishableKey(variant, key)).toThrow(ConfigError);
      expect(() => assertPublishableKey(variant, key)).toThrow(reason);
    });
  });

  it('U-ENV-07 production accepts only a publishable key', () => {
    expect(() => assertPublishableKey('production', PUBLISHABLE_KEY)).not.toThrow();
    expect(() => assertPublishableKey('production', ANON_JWT)).toThrow(ConfigError);
    expect(() => assertPublishableKey('production', 'sb_publishable_')).toThrow(ConfigError);
    expect(() => assertPublishableKey('production', '')).toThrow(ConfigError);
  });

  it('U-ENV-07 development also accepts the local anon JWT', () => {
    expect(() => assertPublishableKey('development', PUBLISHABLE_KEY)).not.toThrow();
    expect(() => assertPublishableKey('development', ANON_JWT)).not.toThrow();
  });

  it.each([
    ['a JWT with another role', makeJwt({ role: 'authenticated' })],
    ['a JWT without a role', makeJwt({ iss: 'supabase-demo' })],
    ['a JWT whose payload is not JSON', 'aGVhZGVy.bm90LWpzb24.c2ln'],
    ['a JWT whose payload is not an object', `aGVhZGVy.${btoa('"anon"')}.c2ln`],
    ['an arbitrary string', 'not-a-key'],
  ])('U-ENV-07 development rejects %s', (_name, key) => {
    expect(() => assertPublishableKey('development', key)).toThrow(ConfigError);
  });
});

describe('assertSentryDsn', () => {
  it('accepts a Sentry DSN (R24.5)', () => {
    expect(() => assertSentryDsn(DSN)).not.toThrow();
  });

  it.each([
    'http://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/0',
    'https://o0.ingest.us.sentry.io/0',
    'https://public:secret@o0.ingest.us.sentry.io/0',
    'https://0123456789abcdef@o0.ingest.us.sentry.io/',
    'not-a-dsn',
  ])('rejects the malformed DSN %s (R24.5)', (dsn) => {
    expect(() => assertSentryDsn(dsn)).toThrow(ConfigError);
  });
});

describe('error messages', () => {
  const failures: [name: string, value: string, run: () => void][] = [
    ['APP_VARIANT', 'staging', () => parseVariant('staging')],
    [URL_VAR, 'http://example.com', () => assertBackendUrl('development', 'http://example.com')],
    [URL_VAR, 'not a url', () => assertBackendUrl('development', 'not a url')],
    [
      URL_VAR,
      'https://abcd.supabase.co.evil.com',
      () => assertBackendUrl('production', 'https://abcd.supabase.co.evil.com'),
    ],
    [
      URL_VAR,
      'http://127.0.0.1:54321',
      () => assertBackendUrl('production', 'http://127.0.0.1:54321'),
    ],
    [KEY_VAR, SECRET_KEY, () => assertPublishableKey('development', SECRET_KEY)],
    [KEY_VAR, SERVICE_ROLE_JWT, () => assertPublishableKey('development', SERVICE_ROLE_JWT)],
    [KEY_VAR, ANON_JWT, () => assertPublishableKey('production', ANON_JWT)],
    [KEY_VAR, 'not-a-key', () => assertPublishableKey('development', 'not-a-key')],
    [DSN_VAR, 'not-a-dsn', () => assertSentryDsn('not-a-dsn')],
  ];

  function configErrorMessage(run: () => void): string {
    try {
      run();
    } catch (error) {
      if (error instanceof ConfigError) return error.message;
      throw error;
    }
    throw new Error('Expected a ConfigError');
  }

  it.each(failures)(
    'U-ENV-08 a %s error names the variable but not the value',
    (name, value, run) => {
      const message = configErrorMessage(run);
      expect(message).toContain(name);
      expect(message).not.toContain(value);
    },
  );
});
