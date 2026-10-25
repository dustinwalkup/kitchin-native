/**
 * @jest-environment node
 */
import type { ExpoConfig } from 'expo/config';

import eas from './eas.json';
import { themes } from './src/ui/theme';

// specs/mvp/4-test-plan.md §3.2. The variant and URL guards run when app.config.ts is evaluated,
// so each case loads a fresh copy of the module with its own environment.

// tsconfig keeps Node's global types out of app code. Jest runs this file as CommonJS, so it exists.
declare const __dirname: string;
const fs = jest.requireActual<{
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  readFileSync(path: string): Uint8Array;
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

  it.each([
    ['development', LOCAL_URL],
    ['production', PROD_URL],
  ])(
    'U-CFG-08 %s takes over-the-air updates from the EAS project, keyed by fingerprint',
    (variant, url) => {
      const config = loadConfig({ APP_VARIANT: variant, EXPO_PUBLIC_SUPABASE_URL: url });

      expect(config.runtimeVersion).toEqual({ policy: 'fingerprint' });
      expect(config.updates).toEqual({
        url: 'https://u.expo.dev/e7d10c82-e824-4b06-b34e-295b4152a6c5',
      });
    },
  );

  it('U-CFG-06 a missing URL warns and does not throw', () => {
    const config = loadConfig({});

    expect(config.extra?.appVariant).toBe('development');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EXPO_PUBLIC_SUPABASE_URL'));
  });

  it.each([
    ['development', LOCAL_URL],
    ['production', PROD_URL],
  ])(
    'configures Sentry source maps by slug, never with an auth token in %s (R25.4, R26.9)',
    (variant, url) => {
      const config = loadConfig({ APP_VARIANT: variant, EXPO_PUBLIC_SUPABASE_URL: url });
      const sentry = config.plugins?.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === '@sentry/react-native/expo',
      );

      // The token comes only from SENTRY_AUTH_TOKEN, an EAS secret, at build time.
      expect(sentry).toEqual([
        '@sentry/react-native/expo',
        { organization: 'personal-1yv', project: 'kitchin', url: 'https://sentry.io/' },
      ]);
    },
  );

  it.each([
    ['development', LOCAL_URL],
    ['production', PROD_URL],
  ])('declares the required-reason APIs from design §3.14 in %s (R29.4)', (variant, url) => {
    const config = loadConfig({ APP_VARIANT: variant, EXPO_PUBLIC_SUPABASE_URL: url });

    expect(config.ios?.privacyManifests).toEqual({
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    });
  });

  it('fills the splash with the ivory page colour, so launch runs straight into the app', () => {
    const config = loadConfig({});
    const splash = config.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );

    expect(splash).toEqual([
      'expo-splash-screen',
      expect.objectContaining({ backgroundColor: themes.light.screen }),
    ]);
  });

  it.each([
    ['development', LOCAL_URL],
    ['production', PROD_URL],
  ])(
    'asks for the camera and photos, never the microphone, for meal photos in %s (redesign §6.5)',
    (variant, url) => {
      const config = loadConfig({ APP_VARIANT: variant, EXPO_PUBLIC_SUPABASE_URL: url });
      const picker = config.plugins?.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
      );

      expect(picker).toEqual([
        'expo-image-picker',
        {
          photosPermission: expect.stringMatching(/^Kitchin uses .+ photos/),
          cameraPermission: expect.stringMatching(/^Kitchin uses the camera/),
          microphonePermission: false,
        },
      ]);
    },
  );

  it('references only asset files that exist', () => {
    for (const env of [{}, { APP_VARIANT: 'production', EXPO_PUBLIC_SUPABASE_URL: PROD_URL }]) {
      const config = loadConfig(env);
      const paths = JSON.stringify(config).match(/\.\/assets\/[^"]+/g) ?? [];

      expect(paths.length).toBeGreaterThan(0);
      expect(paths.filter((path) => !fs.existsSync(`${__dirname}/${path}`))).toEqual([]);
    }
  });
});

// specs/mvp/4-test-plan.md §3.14. App Store Connect rejects an icon with any transparency (R29.5).
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_RGB = 2;
const PNG_RGBA = 6;

/** Reads IHDR, then walks the chunks before the image data for tRNS, the other way to add alpha. */
function readPngHeader(bytes: Uint8Array) {
  expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const typeAt = (offset: number) => String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
  expect(typeAt(8)).toBe('IHDR');

  let transparencyChunk = false;
  // Each chunk is a 4-byte length, a 4-byte type, the data and a 4-byte CRC.
  for (let at = 8; at < bytes.length && typeAt(at) !== 'IDAT'; at += 12 + view.getUint32(at)) {
    if (typeAt(at) === 'tRNS') transparencyChunk = true;
  }
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    colourType: bytes[25],
    transparencyChunk,
  };
}

function pngChunk(type: string, data: number[]): number[] {
  const length = [24, 16, 8, 0].map((shift) => (data.length >>> shift) & 0xff);
  return [...length, ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

/** A PNG up to its first IDAT: enough for readPngHeader. The CRCs are left as zeros. */
function fakePng(colourType: number, extraChunks: number[] = []): Uint8Array {
  const size = [0, 0, 0x04, 0x00]; // 1024
  const ihdr = pngChunk('IHDR', [...size, ...size, 8, colourType, 0, 0, 0]);
  return Uint8Array.from([...PNG_SIGNATURE, ...ihdr, ...extraChunks, ...pngChunk('IDAT', [])]);
}

describe('assets', () => {
  it.each([
    ['development', LOCAL_URL],
    ['production', PROD_URL],
  ])('U-AST-02 the %s icon is a 1024 × 1024 RGB PNG with no transparency', (variant, url) => {
    const { icon } = loadConfig({ APP_VARIANT: variant, EXPO_PUBLIC_SUPABASE_URL: url });

    expect(readPngHeader(fs.readFileSync(`${__dirname}/${icon}`))).toEqual({
      width: 1024,
      height: 1024,
      colourType: PNG_RGB,
      transparencyChunk: false,
    });
  });

  it('U-AST-02 the header check sees an alpha channel and a tRNS chunk', () => {
    expect(readPngHeader(fakePng(PNG_RGB)).colourType).toBe(PNG_RGB);
    expect(readPngHeader(fakePng(PNG_RGBA)).colourType).toBe(PNG_RGBA);
    expect(readPngHeader(fakePng(PNG_RGB)).transparencyChunk).toBe(false);
    expect(
      readPngHeader(fakePng(PNG_RGB, pngChunk('tRNS', [0, 0, 0, 0, 0, 0]))).transparencyChunk,
    ).toBe(true);
  });
});

describe('eas.json', () => {
  it('U-CFG-07 versions remotely and builds production for the store', () => {
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production).toMatchObject({
      autoIncrement: true,
      distribution: 'store',
      channel: 'production', // the channel the deploy workflow publishes updates to (39.4)
      environment: 'production',
      env: { APP_VARIANT: 'production' },
    });
    expect(eas.build.development).toMatchObject({
      environment: 'development',
      env: { APP_VARIANT: 'development' },
    });
    // eas-cli won't submit from CI without the App Store Connect app ID (DD42).
    expect(eas.submit.production.ios.ascAppId).toMatch(/^\d{10}$/);
  });

  it('builds with the .nvmrc Node version, which loads env-guard.ts for app.config.ts (OI-1)', () => {
    const nvmrc = fs.readFileSync(`${__dirname}/.nvmrc`, 'utf8').trim();

    expect(eas.build.development.node).toBe(nvmrc);
    expect(eas.build.production.node).toBe(nvmrc);
  });
});
