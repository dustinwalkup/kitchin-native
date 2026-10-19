import * as Sentry from '@sentry/react-native';

import { HOUSEHOLD_TEXT } from '@/test/factories';

import { ApiError, type ErrorCategory } from './errors';
import { report, reportCrash, reportOnce, setReportingUser, type SafeExtras } from './reporting';

// reportOnce remembers keys for the whole app session, so each test uses its own key. Sentry is
// the global mock from jest-setup.ts.

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('report', () => {
  it('logs the category with the SafeExtras fields of its meta', () => {
    const error = new ApiError('forbidden', {
      code: '42501',
      status: 403,
      constraint: 'grocery_items_pkey',
      table: 'grocery_items',
      operation: 'update',
      recordId: 'item-1',
    });

    report(error);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[report] forbidden', {
      code: '42501',
      status: 403,
      table: 'grocery_items',
      operation: 'update',
      recordId: 'item-1',
    });
  });

  it('lets the extras override the meta', () => {
    report(new ApiError('server', { table: 'grocery_items' }), { table: 'grocery_lists' });
    expect(warn).toHaveBeenCalledWith('[report] server', { table: 'grocery_lists' });
  });

  it('classifies a plain Error and never logs its message', () => {
    report(new Error(`Could not save ${HOUSEHOLD_TEXT}`));

    expect(warn).toHaveBeenCalledWith('[report] server', {});
    expect(JSON.stringify(warn.mock.calls)).not.toContain(HOUSEHOLD_TEXT);
  });

  it('drops fields outside SafeExtras that reach it at runtime', () => {
    const extras = { table: 'grocery_items', name: HOUSEHOLD_TEXT };

    report(new ApiError('validation', {}), extras);

    expect(warn).toHaveBeenCalledWith('[report] validation', { table: 'grocery_items' });
  });

  it.each<ErrorCategory>(['network', 'auth_expired', 'conflict_duplicate', 'not_found'])(
    'R26.2 never reports %s',
    (category) => {
      report(new ApiError(category, {}));
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('R26.2 never reports a network TypeError', () => {
    report(new TypeError('Network request failed'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('U-REP-02 accepts only the SafeExtras keys', () => {
    // @ts-expect-error: free-form fields aren't allowed (R26.3).
    const extras: SafeExtras = { message: HOUSEHOLD_TEXT };
    // @ts-expect-error: the channel status is a RealtimeStatus, not free text.
    const channel: SafeExtras = { channelStatus: HOUSEHOLD_TEXT };
    const allowed: SafeExtras = {
      table: 'grocery_items',
      operation: 'insert',
      recordId: 'item-1',
      code: '23505',
      status: 409,
      channelStatus: 'disconnected',
    };

    expect([extras, channel, allowed]).toHaveLength(3);
  });
});

describe('reportOnce', () => {
  it('U-REP-01 reports a key once per app session', () => {
    reportOnce('u-rep-01');
    reportOnce('u-rep-01');
    reportOnce('u-rep-01', { recordId: 'item-1' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[report] u-rep-01', {});
  });

  it('reports each key separately, with its extras', () => {
    reportOnce('realtime_degraded-test', { channelStatus: 'disconnected' });
    reportOnce('membership_multiple-test');

    expect(warn.mock.calls).toEqual([
      ['[report] realtime_degraded-test', { channelStatus: 'disconnected' }],
      ['[report] membership_multiple-test', {}],
    ]);
  });
});

describe('setReportingUser', () => {
  it('logs only the account ID', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});

    setReportingUser('user-1');
    setReportingUser(null);

    expect(info.mock.calls).toEqual([
      ['[reporting] user', { id: 'user-1' }],
      ['[reporting] user', null],
    ]);
  });
});

describe('U-REP-04 forwarding to Sentry', () => {
  it('sends the ApiError, whose message is its category, with the SafeExtras only', () => {
    const error = new ApiError('forbidden', {
      code: '42501',
      constraint: 'grocery_items_pkey',
      table: 'grocery_items',
    });

    report(error, { operation: 'update', recordId: 'item-1' });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { category: 'forbidden' },
      extra: { code: '42501', table: 'grocery_items', operation: 'update', recordId: 'item-1' },
      fingerprint: ['{{ default }}', 'forbidden'],
    });
  });

  it('never sends the message of an error it classified', () => {
    report(new Error(`Could not save ${HOUSEHOLD_TEXT}`), { table: 'grocery_items' });

    const [sent, context] = jest.mocked(Sentry.captureException).mock.calls[0];
    expect(sent).toBeInstanceOf(ApiError);
    expect((sent as ApiError).message).toBe('server');
    expect(JSON.stringify([sent, context])).not.toContain(HOUSEHOLD_TEXT);
  });

  it('R26.2 sends nothing for an expected outcome', () => {
    report(new ApiError('conflict_duplicate', {}));
    report(new TypeError('Network request failed'));

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('U-REP-01 sends a reportOnce key once, as a warning with its SafeExtras', () => {
    const extras = { channelStatus: 'disconnected', note: HOUSEHOLD_TEXT } as SafeExtras;

    reportOnce('u-rep-04-once', extras);
    reportOnce('u-rep-04-once', extras);

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith('u-rep-04-once', {
      level: 'warning',
      extra: { channelStatus: 'disconnected' },
    });
  });

  it('R26.11 sets the user to the account ID only, and clears it', () => {
    setReportingUser('user-1');
    setReportingUser(null);

    expect(jest.mocked(Sentry.setUser).mock.calls).toEqual([[{ id: 'user-1' }], [null]]);
  });

  it('R14.6 sends a crash with its stack, tagged as a crash', () => {
    const error = new Error('Render failed');

    reportCrash(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error, { tags: { category: 'crash' } });
  });
});

describe('U-REP-03 in a release build', () => {
  // React Native declares `__DEV__` as a global const; Jest defines it as a writable global.
  const runtime = globalThis as unknown as { __DEV__: boolean };

  beforeEach(() => {
    runtime.__DEV__ = false;
  });

  afterEach(() => {
    runtime.__DEV__ = true;
  });

  it('logs nothing, and still reports to Sentry', () => {
    const spies = CONSOLE_METHODS.map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );

    report(new ApiError('server', { table: 'grocery_items' }));
    reportOnce('u-rep-03');
    setReportingUser('user-1');
    reportCrash(new Error('Render failed'));

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.setUser).toHaveBeenCalledTimes(1);
  });
});
