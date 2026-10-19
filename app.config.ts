import type { ConfigContext, ExpoConfig } from 'expo/config';

// Expo compiles this file but loads its imports with Node, which strips the types from a .ts file
// only when the import names the extension (OI-1). Keep env-guard free of imports of its own.
import { assertBackendUrl, parseVariant } from './src/lib/env-guard.ts';

const BUNDLE_ID_PREFIX = 'com.dustinwalkup'; // DD9, chosen by the owner (gate G2)
const EAS_PROJECT_ID = 'e7d10c82-e824-4b06-b34e-295b4152a6c5'; // existing project; don't run `eas init`
const variant = parseVariant(process.env.APP_VARIANT);
const isProd = variant === 'production';

// Required-reason APIs that React Native and AsyncStorage use (R29.4, design §3.14). Apple emails
// after an upload if one is missing; add whatever that email names here.
const REQUIRED_REASON_APIS: Record<string, string[]> = {
  NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
  NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1'],
  NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
  NSPrivacyAccessedAPICategoryDiskSpace: ['E174.1'],
};

// Some tools (expo-doctor, Jest) evaluate config without env vars, so a missing URL only warns here.
// A wrong URL fails the build. env.ts fails at startup if the URL is missing.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (url) assertBackendUrl(variant, url);
else console.warn('EXPO_PUBLIC_SUPABASE_URL is not set while evaluating app config');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'Kitchin' : 'Kitchin Dev',
  owner: 'dustinwalkup',
  slug: 'kitchin', // the EAS project's slug; the same in both variants
  version: '1.0.0',
  scheme: isProd ? 'kitchin' : 'kitchin-dev',
  orientation: 'portrait',
  userInterfaceStyle: 'light', // R16.6
  icon: isProd ? './assets/icon.png' : './assets/icon-dev.png',
  ios: {
    bundleIdentifier: isProd ? `${BUNDLE_ID_PREFIX}.kitchin` : `${BUNDLE_ID_PREFIX}.kitchin.dev`, // R24.1
    supportsTablet: false,
    config: { usesNonExemptEncryption: false }, // R29.3
    privacyManifests: {
      NSPrivacyAccessedAPITypes: Object.entries(REQUIRED_REASON_APIS).map(([type, reasons]) => ({
        NSPrivacyAccessedAPIType: type,
        NSPrivacyAccessedAPITypeReasons: reasons,
      })),
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', backgroundColor: '#faf3ed', imageWidth: 120 },
    ],
    // Uploads source maps during EAS production builds (R26.9). The auth token comes only from the
    // SENTRY_AUTH_TOKEN EAS secret, never from this file (R25.4). Local Debug builds skip the upload.
    [
      '@sentry/react-native/expo',
      { organization: 'personal-1yv', project: 'kitchin', url: 'https://sentry.io/' },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  // Over-the-air updates (specs/app-deploy DD37). Any native change produces a new fingerprint, so an
  // update only reaches builds that can run it (39.5); native changes ship as a new build.
  runtimeVersion: { policy: 'fingerprint' },
  updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
  extra: {
    appVariant: variant, // DD22
    eas: { projectId: EAS_PROJECT_ID },
  },
});
