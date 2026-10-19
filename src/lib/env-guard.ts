// Shared by app.config.ts (build time, in Node) and env.ts (startup, in Hermes), so the rules can't
// drift apart (R24.3–R24.5). Keep it free of React Native and Node imports. URLs are parsed with a
// regex because React Native's `URL` implementation is incomplete. See specs/mvp/2-design.md §3.1.

export type AppVariant = 'development' | 'production';

/** A missing or invalid configuration value. The message names the variable, never its value (24.5). */
export class ConfigError extends Error {
  name = 'ConfigError';
}

const URL_VAR = 'EXPO_PUBLIC_SUPABASE_URL';
const KEY_VAR = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const DSN_VAR = 'EXPO_PUBLIC_SENTRY_DSN';

/** `APP_VARIANT`, which app.config.ts passes to the app as `extra.appVariant` (DD22). */
export function parseVariant(raw: string | undefined): AppVariant {
  if (raw === undefined) return 'development';
  if (raw === 'development' || raw === 'production') return raw;
  throw new ConfigError("APP_VARIANT must be 'development' or 'production'.");
}

// Scheme, host (a name, IPv4 address or bracketed IPv6 address), optional port and optional trailing
// slash. Anything else, such as credentials, a path or a query, doesn't match.
const BACKEND_URL = /^(https?):\/\/([a-z0-9.-]+|\[[0-9a-f:]+\])(:\d{1,5})?\/?$/i;

const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.local)$/i;

const SUPABASE_HOST = /^[a-z0-9]+\.supabase\.co$/i;

/** Throws a ConfigError unless the URL suits the variant (24.3, 24.4). */
export function assertBackendUrl(variant: AppVariant, url: string): void {
  const parts = BACKEND_URL.exec(url);
  if (!parts) {
    throw new ConfigError(`${URL_VAR} must be an http(s) URL with no credentials, path or query.`);
  }
  const [, scheme, host, port] = parts;

  if (variant === 'development') {
    // A LAN address lets a physical device reach the stack on the laptop.
    if (!PRIVATE_HOST.test(host)) {
      throw new ConfigError(
        `${URL_VAR} must point at the local stack (localhost, a private-network address or a .local host) in the development variant.`,
      );
    }
    return;
  }

  if (scheme.toLowerCase() !== 'https' || port || !SUPABASE_HOST.test(host)) {
    throw new ConfigError(
      `${URL_VAR} must be https://<project-ref>.supabase.co in the production variant.`,
    );
  }
}

const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]+$/;
const JWT = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*$/;
const PRIVILEGED_ROLES: unknown[] = ['service_role', 'supabase_admin'];
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Hand-rolled because neither `atob` nor `Buffer` is guaranteed in every runtime that loads this file.
// The input has already matched JWT, so every character is in the alphabet.
function decodeBase64Url(input: string): string {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of input) {
    buffer = ((buffer << 6) | BASE64URL_ALPHABET.indexOf(char)) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/** The `role` claim of a JWT, or undefined when the key isn't a JWT with a JSON object payload. */
function jwtRole(key: string): unknown {
  const match = JWT.exec(key);
  if (!match) return undefined;
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(match[1]));
    return typeof payload === 'object' && payload !== null && 'role' in payload
      ? payload.role
      : undefined;
  } catch {
    return undefined;
  }
}

/** Rejects anything that looks like a privileged key (25.1, 25.2). */
export function assertPublishableKey(variant: AppVariant, key: string): void {
  if (key.startsWith('sb_secret_')) {
    throw new ConfigError(
      `${KEY_VAR} holds a secret key. Only the publishable key may ship in the app.`,
    );
  }
  const role = jwtRole(key);
  if (PRIVILEGED_ROLES.includes(role)) {
    throw new ConfigError(
      `${KEY_VAR} holds a privileged (service_role or supabase_admin) JWT. Only the publishable key may ship in the app.`,
    );
  }

  if (PUBLISHABLE_KEY.test(key)) return;
  // The local stack may still print its legacy anon JWT (OI-12).
  if (variant === 'development' && role === 'anon') return;

  throw new ConfigError(
    variant === 'production'
      ? `${KEY_VAR} must be a publishable key (sb_publishable_…) in the production variant.`
      : `${KEY_VAR} must be a publishable key (sb_publishable_…) or the local stack's anon JWT.`,
  );
}

// https://<public key>@<host>/<project id>. Legacy DSNs that also carry a secret key don't match.
const SENTRY_DSN = /^https:\/\/[0-9a-f]+@[a-z0-9.-]+\/\d+$/i;

/** Throws a ConfigError unless the value has the shape of a Sentry DSN (24.5). */
export function assertSentryDsn(dsn: string): void {
  if (!SENTRY_DSN.test(dsn)) {
    throw new ConfigError(`${DSN_VAR} must be a Sentry DSN (https://<key>@<host>/<project-id>).`);
  }
}
