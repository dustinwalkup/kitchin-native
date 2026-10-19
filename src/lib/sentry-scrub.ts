// The last safeguard before a report leaves the phone (R26.4, R26.5). Sentry runs these as
// `beforeSend` and `beforeBreadcrumb` (task 6.2). The first safeguard is errors.ts, which never
// keeps server-provided text (§3.8). Pure functions, so they're tested without Sentry. See
// specs/mvp/2-design.md §3.9.

/** The breadcrumb fields the scrubber reads. Sentry's `Breadcrumb` type fits it. */
export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/** The event fields the scrubber handles. Sentry's `Event` and `ErrorEvent` types fit it. */
export interface ScrubbableEvent {
  message?: string;
  logentry?: { message?: string; params?: unknown[] };
  exception?: { values?: { value?: string }[] };
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  user?: { id?: string | number; [key: string]: unknown };
  request?: unknown;
  server_name?: string;
  breadcrumbs?: ScrubbableBreadcrumb[];
  release?: string;
  dist?: string;
}

const REDACTED = '[redacted]';

// Postgres error text puts row values after these, so the whole string goes.
const ROW_MARKERS = /Failing row contains|Key \(|DETAIL:/;

const PATTERNS: [RegExp, string][] = [
  // URL query strings and fragments, which can hold filters on household content (R26.4). Any
  // scheme, so deep links (`kitchin://…`) are covered too.
  [/\b([a-z][\w+.-]*:\/\/[^\s?#]*)[?#]\S*/gi, '$1'],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED], // JWTs
  [/sb_(?:publishable|secret)_[\w-]+/g, REDACTED], // Supabase keys
  [/apikey=[^&\s]+/gi, `apikey=${REDACTED}`],
  [/Bearer\s+\S+/gi, `Bearer ${REDACTED}`],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, REDACTED], // email addresses
];

function redactString(text: string): string {
  if (ROW_MARKERS.test(text)) return REDACTED;
  return PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

/**
 * Redacts every string inside arrays and plain objects, and returns copies. Anything else, such as
 * a number or a Date, is kept as it is: Sentry normalizes the event into plain data before
 * `beforeSend`, which then sees it.
 */
function redact(value: unknown, path = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  const isArray = Array.isArray(value);
  if (!isArray && Object.prototype.toString.call(value) !== '[object Object]') return value;

  const container = value as object;
  if (path.has(container)) return '[circular]';
  path.add(container);
  const copy = isArray
    ? value.map((item) => redact(item, path))
    : Object.fromEntries(Object.entries(container).map(([key, item]) => [key, redact(item, path)]));
  path.delete(container);
  return copy;
}

/** The URL or path without its query string or fragment. */
const stripQuery = (url: unknown) => (typeof url === 'string' ? url.split(/[?#]/)[0] : url);

/** The object without its undefined fields. */
const defined = (fields: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B | null {
  const { data } = breadcrumb;
  switch (breadcrumb.category) {
    case 'console': // R26.6
    // Sentry labels a tapped element with its accessibility label, testID or text, which can be an
    // item name (R26.4). `ui.multiClick` is a repeated tap.
    case 'touch':
    case 'ui.multiClick':
      return null;
    case 'fetch':
    case 'xhr':
    case 'http': {
      // `http` is the native iOS SDK's request breadcrumb, merged into JS events. sentry.ts turns
      // it off, so this is a backstop.
      const fields = {
        method: data?.method,
        url: stripQuery(data?.url),
        status_code: data?.status_code,
      };
      return redact({ ...breadcrumb, data: defined(fields) }) as B;
    }
    case 'navigation': {
      // Route changes record `from` and `to`; Expo Router calls record `method` and `pathname`.
      const fields = {
        from: stripQuery(data?.from),
        to: stripQuery(data?.to),
        method: data?.method,
        pathname: stripQuery(data?.pathname),
      };
      return redact({ ...breadcrumb, data: defined(fields) }) as B;
    }
    default:
      return redact(breadcrumb) as B;
  }
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  // Dropped: the request (headers, cookies and bodies), the server name, and every user field but
  // the ID (R26.3, R26.4). Sentry's `bundle@version+build` release and its dist look like email
  // addresses, so they skip redaction.
  const { request, server_name, user, breadcrumbs, release, dist, ...rest } = event;
  const scrubbed: E = { ...(redact(rest) as E), ...defined({ release, dist }) };
  if (user?.id !== undefined) scrubbed.user = { id: user.id };
  // beforeBreadcrumb has seen these already, but only before Sentry normalized their data.
  if (breadcrumbs) {
    scrubbed.breadcrumbs = breadcrumbs
      .map((breadcrumb) => scrubBreadcrumb(breadcrumb))
      .filter((breadcrumb) => breadcrumb !== null);
  }
  return scrubbed;
}
