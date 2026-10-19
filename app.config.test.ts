/**
 * @jest-environment node
 */
import type { ExpoConfig } from 'expo/config';

import eas from './eas.json';

// specs/mvp/4-test-plan.md §3.2. The variant and URL guards run when app.config.ts is evaluated,
// so each case loads a fresh copy of the module with its own environment.

// tsconfig keeps Node's global types out of app code. Jest runs this file as CommonJS, so it exists.
declare const __dirname: string;
const fs = jest.requireActual<{
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
}>('node:fs');

const LOCAL_URL = 'http://127.0.0.1:54321';
const PROD_URL = 'https://abcdefghijklmnop.supabase.co';
const ENV_KEYS = ['APP_VARIANT', 'EXPO_PUBLIC_SUPABASE_URL'] as const;

type Env = Partial<Record<(typeof ENV_KEYS)[number], string>>;

function loadConfig(env: Env): ExpoConfig {
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  let config: ExpoConfig | undefined;
  jest.isolateModules(() => {
    const { default: makeConfig } =
      jest.requireActual<typeof import('./app.config')>('./app.config');
    config = makeConfig({
      config: {},
      projectRoot: __dirname,
      staticConfigPath: null,
      packageJsonPath: null,
    });
  });
  return config!;
}

const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('app.config.ts', () => {
  it('U-CFG-01 production with a local URL throws', () => {
    expect(() =>
      loadConfig({ APP_VARIANT: 'production', EXPO_PUBLIC_SUPABASE_URL: LOCAL_URL }),
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('U-CFG-02 development with a *.supabase.co URL throws', () => {
    expect(() =>
      loadConfig({
        APP_VARIANT: 'development',
        EXPO_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co',
      }),
    ).toThrow('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('U-CFG-03 development produces Kitchin Dev, the .dev bundle ID and the kitchin-dev scheme', () => {
    const config = loadConfig({ APP_VARIANT: 'development', EXPO_PUBLIC_SUPABASE_URL: LOCAL_URL });

    expect(config.name).toBe('Kitchin Dev');
    expect(config.ios?.bundleIdentifier).toBe('com.dustinwalkup.kitchin.dev');
    expect(config.scheme).toBe('kitchin-dev');
    expect(config.icon).toBe('./assets/icon-dev.png');
  });

  it('U-CFG-04 production produces Kitchin and the store bundle ID', () => {
    const config = loadConfig({ APP_VARIANT: 'production', EXPO_PUBLIC_SUPABASE_URL: PROD_URL });

    expect(config.name).toBe('Kitchin');
    expect(config.ios?.bundleIdentifier).toBe('com.dustinwalkup.kitchin');
    expect(config.scheme).toBe('kitchin');
    expect(config.icon).toBe('./assets/icon.png');
  });

  it.each([
    ['development', LOCAL_URL],
    ['production', PROD_URL],
  ])('U-CFG-05 %s shares the EAS project and the fixed iOS settings', (variant, url) => {
    const config = loadConfig({ APP_VARIANT: variant, EXPO_PUBLIC_SUPABASE_URL: url });

    expect(config).toMatchObject({
      owner: 'dustinwalkup',
      slug: 'kitchin',
      orientation: 'portrait',
      userInterfaceStyle: 'light',
      ios: { supportsTablet: false, config: { usesNonExemptEncryption: false } },
      extra: { appVariant: variant, eas: { projectId: 'e7d10c82-e824-4b06-b34e-295b4152a6c5' } },
    });
  });

  it('U-CFG-06 a missing URL warns and does not throw', () => {
    const config = loadConfig({});

    expect(config.extra?.appVariant).toBe('development');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EXPO_PUBLIC_SUPABASE_URL'));
  });

  it('references only asset files that exist', () => {
    for (const env of [{}, { APP_VARIANT: 'production', EXPO_PUBLIC_SUPABASE_URL: PROD_URL }]) {
      const config = loadConfig(env);
      const paths = JSON.stringify(config).match(/\.\/assets\/[^"]+/g) ?? [];

      expect(paths.length).toBeGreaterThan(0);
      expect(paths.filter((path) => !fs.existsSync(`${__dirname}/${path}`))).toEqual([]);
    }
  });
});

describe('eas.json', () => {
  it('U-CFG-07 versions remotely and builds production for the store', () => {
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production).toMatchObject({
      autoIncrement: true,
      distribution: 'store',
      environment: 'production',
      env: { APP_VARIANT: 'production' },
    });
    expect(eas.build.development).toMatchObject({
      environment: 'development',
      env: { APP_VARIANT: 'development' },
    });
  });

  it('builds with the .nvmrc Node version, which loads env-guard.ts for app.config.ts (OI-1)', () => {
    const nvmrc = fs.readFileSync(`${__dirname}/.nvmrc`, 'utf8').trim();

    expect(eas.build.development.node).toBe(nvmrc);
    expect(eas.build.production.node).toBe(nvmrc);
  });
});
