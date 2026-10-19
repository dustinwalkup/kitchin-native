import * as Sentry from '@sentry/react-native';

import type { Env } from './env';
import { initSentry } from './sentry';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

const DSN = 'https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/0';

let mockEnv: Pick<Env, 'variant' | 'sentryDsn'>;
jest.mock('./env', () => ({
  get env() {
    return mockEnv;
  },
}));

// React Native declares `__DEV__` as a global const; Jest defines it as a writable global.
const runtime = globalThis as unknown as { __DEV__: boolean };

afterEach(() => {
  runtime.__DEV__ = true;
});

/** The options initSentry passes to Sentry.init, in a debug or a release build. */
function initOptions(env: typeof mockEnv, { debug }: { debug: boolean }) {
  mockEnv = env;
  runtime.__DEV__ = debug;
  initSentry();
  return jest.mocked(Sentry.init).mock.lastCall![0];
}

describe('initSentry', () => {
  it('U-SCR-10 starts Sentry with the privacy settings and the scrubbers', () => {
    const options = initOptions({ variant: 'production', sentryDsn: DSN }, { debug: false });

    // An exact match: no replay sample rates, no screenshots and no other integrations (R26.6).
    expect(options).toEqual({
      dsn: DSN,
      enabled: true,
      environment: 'production',
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableNetworkBreadcrumbs: false,
      tracesSampleRate: 0,
      integrations: [{ name: 'Breadcrumbs', options: { console: false } }, { name: 'ExpoRouter' }],
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
  });

  it('U-SCR-10 sends nothing from a debug build (R26.8)', () => {
    const options = initOptions({ variant: 'development', sentryDsn: DSN }, { debug: true });

    expect(options).toMatchObject({ enabled: false, environment: 'development' });
  });

  it('stays off without a DSN', () => {
    const options = initOptions({ variant: 'development', sentryDsn: null }, { debug: false });

    expect(options).toMatchObject({ dsn: undefined, enabled: false });
  });
});
