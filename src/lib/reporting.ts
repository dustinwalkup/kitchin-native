import * as Sentry from '@sentry/react-native';

import { type ApiError, classifyError, REPORTABLE } from './errors';

// The app's only way to report errors (specs/mvp/2-design.md §3.9). Reports go to Sentry, which
// sentry.ts turns off in debug builds (R26.8); debug builds log them instead. A report carries a
// category or key plus SafeExtras, never an error's message (R26.3, R26.4). Crashes are the
// exception: they keep their stack, and the scrubber cleans their message (§3.9).

/** The live-update connection status. The household channel (§3.6) reports it. */
export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

/** Everything a report may carry besides its category (R26.3). No free-form strings. */
export type SafeExtras = Partial<{
  table: string;
  operation: string;
  recordId: string;
  code: string;
  status: number;
  channelStatus: RealtimeStatus;
}>;

// A Record, so adding a SafeExtras field without listing it here fails to compile.
const SAFE_KEYS = Object.keys({
  table: true,
  operation: true,
  recordId: true,
  code: true,
  status: true,
  channelStatus: true,
} satisfies Record<keyof SafeExtras, true>) as (keyof SafeExtras)[];

/** Copies only the SafeExtras fields, since a non-literal object can carry more at runtime. */
function pickSafe(source: SafeExtras | undefined): SafeExtras {
  const extras: Record<string, unknown> = {};
  for (const key of SAFE_KEYS) {
    if (source?.[key] !== undefined) extras[key] = source[key];
  }
  return extras as SafeExtras;
}

function log(label: string, extras: SafeExtras): void {
  if (__DEV__) console.warn(`[report] ${label}`, extras);
}

/** Reports an error if its category is reportable (R26.1, R26.2). */
export function report(e: ApiError | Error, extras?: SafeExtras): void {
  const error = classifyError(e);
  if (!REPORTABLE[error.category]) return;
  const safe = { ...pickSafe(error.meta), ...pickSafe(extras) };
  log(error.category, safe);
  // ApiErrors raised at one call site share a stack, so the category splits them into issues.
  Sentry.captureException(error, {
    tags: { category: error.category },
    extra: safe,
    fingerprint: ['{{ default }}', error.category],
  });
}

const reportedKeys = new Set<string>();

/** Reports `key` at most once per app session, for example `membership_multiple` (R1.6). */
export function reportOnce(key: string, extras?: SafeExtras): void {
  if (reportedKeys.has(key)) return;
  reportedKeys.add(key);
  const safe = pickSafe(extras);
  log(key, safe);
  Sentry.captureMessage(key, { level: 'warning', extra: safe });
}

/** Reports a render error that an error boundary caught (R14.6). */
export function reportCrash(error: Error): void {
  Sentry.captureException(error, { tags: { category: 'crash' } });
}

/** Sends a fixed error from Settings, so the owner can check what a report contains (R15.3). */
export function reportTestError(): void {
  log('test', {});
  Sentry.captureException(new Error('Kitchin test error'), { tags: { category: 'test' } });
}

/** Identifies the member by account ID only, or clears the identity on sign-out (R26.11). */
export function setReportingUser(id: string | null): void {
  const user = id === null ? null : { id };
  if (__DEV__) console.info('[reporting] user', user);
  Sentry.setUser(user);
}
