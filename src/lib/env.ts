import Constants from 'expo-constants';

import {
  assertBackendUrl,
  assertPublishableKey,
  assertSentryDsn,
  ConfigError,
  parseVariant,
  type AppVariant,
} from './env-guard';

export { ConfigError };

export interface Env {
  variant: AppVariant;
  supabaseUrl: string;
  supabasePublishableKey: string;
  /** Required in production; optional in development. */
  sentryDsn: string | null;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new ConfigError(`${name} is not set.`);
  return value;
}

// Expo inlines a public variable only when it's read with dot access, so each one is spelled out in
// full below: no bracket access or destructuring (U-ENV-10).
function loadEnv(): Env {
  const variant = parseVariant(Constants.expoConfig?.extra?.appVariant);

  const supabaseUrl = required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
  assertBackendUrl(variant, supabaseUrl);

  const supabasePublishableKey = required(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  assertPublishableKey(variant, supabasePublishableKey);

  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || null;
  if (sentryDsn) assertSentryDsn(sentryDsn);
  else if (variant === 'production') required('EXPO_PUBLIC_SENTRY_DSN', undefined);

  return { variant, supabaseUrl, supabasePublishableKey, sentryDsn };
}

/** The validated public configuration. Importing this module throws a ConfigError when it's invalid (24.5). */
export const env: Env = loadEnv();
