import type { Env } from './env';

// tsconfig keeps Node's global types out of app code. Jest runs this file as CommonJS, so it exists.
declare const __dirname: string;

const NAMES = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
] as const;
type Values = Partial<Record<(typeof NAMES)[number], string>>;

const DSN = 'https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/0';
const LOCAL: Values = {
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local',
};
const HOSTED: Values = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_hosted',
  EXPO_PUBLIC_SENTRY_DSN: DSN,
};

const saved: Values = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

function setEnv(values: Values) {
  for (const name of NAMES) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

afterEach(() => setEnv(saved));

/** Loads a fresh copy of env.ts, which validates at import time. */
function loadEnv(appVariant: unknown, values: Values): Env {
  setEnv(values);
  let env: Env | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { appVariant } } },
    }));
    // Jest's CommonJS runtime can't run `import()`, so load the module synchronously.
    ({ env } = jest.requireActual<typeof import('./env')>('./env'));
  });
  return env!;
}

/** The error env.ts throws at import. Each copy defines its own ConfigError, so match on `name`. */
function loadError(appVariant: unknown, values: Values): unknown {
  try {
    loadEnv(appVariant, values);
  } catch (error) {
    return error;
  }
  throw new Error('Expected env.ts to throw');
}

function configError(name: string) {
  return { name: 'ConfigError', message: expect.stringContaining(name) };
}

describe('env', () => {
  it('loads a development config, with no DSN', () => {
    expect(loadEnv('development', LOCAL)).toEqual({
      variant: 'development',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'sb_publishable_local',
      sentryDsn: null,
    });
  });

  it('defaults to development when extra.appVariant is absent (DD22)', () => {
    expect(loadEnv(undefined, LOCAL)).toMatchObject({ variant: 'development' });
  });

  it('loads a production config', () => {
    expect(loadEnv('production', HOSTED)).toEqual({
      variant: 'production',
      supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      supabasePublishableKey: 'sb_publishable_hosted',
      sentryDsn: DSN,
    });
  });

  it('U-ENV-09 throws a ConfigError naming EXPO_PUBLIC_SUPABASE_URL when it is missing', () => {
    expect(
      loadError('development', { ...LOCAL, EXPO_PUBLIC_SUPABASE_URL: undefined }),
    ).toMatchObject(configError('EXPO_PUBLIC_SUPABASE_URL'));
  });

  it('U-ENV-09 throws a ConfigError naming EXPO_PUBLIC_SENTRY_DSN when production has none', () => {
    expect(loadError('production', { ...HOSTED, EXPO_PUBLIC_SENTRY_DSN: undefined })).toMatchObject(
      configError('EXPO_PUBLIC_SENTRY_DSN'),
    );
  });

  it('throws a ConfigError naming the publishable key when it is missing (R24.5)', () => {
    expect(
      loadError('development', { ...LOCAL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }),
    ).toMatchObject(configError('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
  });

  it('treats an empty value as missing (R24.5)', () => {
    expect(loadError('production', { ...HOSTED, EXPO_PUBLIC_SENTRY_DSN: '' })).toMatchObject(
      configError('EXPO_PUBLIC_SENTRY_DSN'),
    );
    expect(loadEnv('development', { ...LOCAL, EXPO_PUBLIC_SENTRY_DSN: '' })).toMatchObject({
      sentryDsn: null,
    });
  });

  it('fails at startup when development points at a hosted project (R24.3)', () => {
    expect(loadError('development', HOSTED)).toMatchObject(configError('EXPO_PUBLIC_SUPABASE_URL'));
  });

  it('validates the key and a DSN given in development (R24.5, R25.1)', () => {
    expect(
      loadError('development', { ...LOCAL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'not-a-key' }),
    ).toMatchObject(configError('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
    expect(
      loadError('development', { ...LOCAL, EXPO_PUBLIC_SENTRY_DSN: 'not-a-dsn' }),
    ).toMatchObject(configError('EXPO_PUBLIC_SENTRY_DSN'));
  });

  it('throws a ConfigError for an unknown variant', () => {
    expect(loadError('staging', LOCAL)).toMatchObject(configError('APP_VARIANT'));
  });

  it('U-ENV-10 reads every variable with dot access, so each value is inlined', () => {
    const { readFileSync } = jest.requireActual<{
      readFileSync(path: string, encoding: 'utf8'): string;
    }>('node:fs');
    const source = readFileSync(`${__dirname}/env.ts`, 'utf8');

    for (const name of NAMES) expect(source).toContain(`process.env.${name}`);
    // No bracket access, destructuring or aliasing: every use is `process.env.EXPO_PUBLIC_…`.
    expect(source).not.toMatch(/process\.env(?!\.EXPO_PUBLIC_[A-Z_]+\b)/);
  });
});
