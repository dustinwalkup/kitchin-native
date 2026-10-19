import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { report, setReportingUser } from '@/lib/reporting';
import { supabase } from '@/lib/supabase';
import { makeAuthError, makeSession } from '@/test/factories';

import { AuthProvider, onSessionEnd, useAuth } from './auth-provider';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      admin: { signOut: jest.fn() },
    },
  },
}));

jest.mock('@/lib/reporting', () => ({
  report: jest.fn(),
  reportOnce: jest.fn(),
  setReportingUser: jest.fn(),
}));

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => unknown;

// Loosely typed handles on the mocked client, whose real methods are heavily overloaded.
const auth = supabase.auth as unknown as {
  onAuthStateChange: jest.Mock;
  getSession: jest.Mock;
  signInWithPassword: jest.Mock;
  signOut: jest.Mock;
  admin: { signOut: jest.Mock };
};

const SESSION = makeSession('user-a');
const EMAIL = 'member@example.com';

let emitAuth: AuthCallback;
const unsubscribe = jest.fn();
const unregisters: (() => void)[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  auth.onAuthStateChange.mockImplementation((callback: AuthCallback) => {
    emitAuth = callback;
    return { data: { subscription: { id: 'subscription', callback, unsubscribe } } };
  });
  auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
  auth.admin.signOut.mockResolvedValue({ data: null, error: null });
  // Like supabase-js, signOut announces SIGNED_OUT before it resolves.
  auth.signOut.mockImplementation(async () => {
    await emitAuth('SIGNED_OUT', null);
    return { error: null };
  });
});

afterEach(() => {
  unregisters.splice(0).forEach((unregister) => unregister());
});

function register(callback: () => void | Promise<void>) {
  unregisters.push(onSessionEnd(callback));
}

async function renderAuth() {
  const queryClient = new QueryClient();
  const clear = jest.spyOn(queryClient, 'clear');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  const rendered = await renderHook(() => useAuth(), { wrapper });
  return { ...rendered, clear };
}

async function send(event: AuthChangeEvent, session: Session | null) {
  await act(async () => {
    emitAuth(event, session);
  });
}

/** Runs the side effects the provider defers out of the auth callback. */
const flushDeferred = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

async function renderSignedIn() {
  const rendered = await renderAuth();
  await send('INITIAL_SESSION', SESSION);
  await flushDeferred();
  jest.mocked(setReportingUser).mockClear();
  return rendered;
}

describe('auth state', () => {
  it('U-AUTH-01 is restoring until INITIAL_SESSION, which resolves it', async () => {
    const { result } = await renderAuth();
    expect(result.current.state).toEqual({ status: 'restoring' });

    await send('INITIAL_SESSION', SESSION);
    expect(result.current.state).toEqual({ status: 'signedIn', session: SESSION });
  });

  it('U-AUTH-01 resolves to signedOut without a stored session', async () => {
    const { result } = await renderAuth();

    await send('INITIAL_SESSION', null);

    expect(result.current.state).toEqual({ status: 'signedOut', reason: 'none' });
  });

  it('accepts the SIGNED_IN that supabase-js sends before INITIAL_SESSION at launch', async () => {
    const { result } = await renderAuth();

    await send('SIGNED_IN', SESSION);
    await send('INITIAL_SESSION', SESSION);
    await flushDeferred();

    expect(result.current.state).toEqual({ status: 'signedIn', session: SESSION });
    expect(setReportingUser).toHaveBeenCalledTimes(1);
  });

  it.each<AuthChangeEvent>(['TOKEN_REFRESHED', 'USER_UPDATED'])(
    '%s replaces the session without re-entering signedIn',
    async (event) => {
      const { result, clear } = await renderSignedIn();
      const refreshed = makeSession('user-a');

      await send(event, refreshed);
      await flushDeferred();

      expect(result.current.state).toEqual({ status: 'signedIn', session: refreshed });
      expect(setReportingUser).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
    },
  );

  it('ignores events that carry no change of session', async () => {
    const { result } = await renderSignedIn();

    await send('PASSWORD_RECOVERY', null);
    await send('TOKEN_REFRESHED', null);

    expect(result.current.state).toEqual({ status: 'signedIn', session: SESSION });
  });

  it('U-AUTH-05 treats a SIGNED_OUT the member did not start as expired, unreported', async () => {
    const { result } = await renderSignedIn();

    await send('SIGNED_OUT', null);
    await flushDeferred();

    expect(result.current.state).toEqual({ status: 'signedOut', reason: 'expired' });
    expect(report).not.toHaveBeenCalled();
  });

  it('R3.6 keeps "expired" when a session revoked while closed is dropped at launch', async () => {
    const { result } = await renderAuth();

    // supabase-js removes a session it can't refresh, then reports no initial session.
    await send('SIGNED_OUT', null);
    await send('INITIAL_SESSION', null);

    expect(result.current.state).toEqual({ status: 'signedOut', reason: 'expired' });
  });

  it('stops listening when unmounted', async () => {
    const { unmount } = await renderAuth();

    await act(async () => unmount());

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('useAuth needs the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useAuth())).rejects.toThrow('inside <AuthProvider>');
    jest.mocked(console.error).mockRestore();
  });
});

describe('signIn', () => {
  it('U-AUTH-02 trims the email and succeeds', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
    const { result } = await renderAuth();

    await expect(result.current.signIn(`  ${EMAIL}  `, ' secret ')).resolves.toEqual({
      ok: true,
    });

    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: ' secret ' });
  });

  it('U-AUTH-02 maps a 400 to invalid_credentials, unreported', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: makeAuthError('invalid_credentials'),
    });
    const { result } = await renderAuth();

    await expect(result.current.signIn(EMAIL, 'wrong')).resolves.toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ['AuthRetryableFetchError', { error: makeAuthError('retryable_fetch') }],
    ['a gateway failure', { error: makeAuthError('retryable_gateway') }],
  ])('U-AUTH-03 maps %s to offline', async (_, response) => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, ...response });
    const { result } = await renderAuth();

    await expect(result.current.signIn(EMAIL, 'secret')).resolves.toEqual({
      ok: false,
      reason: 'offline',
    });
    expect(report).not.toHaveBeenCalled();
  });

  it('U-AUTH-03 maps a thrown network TypeError to offline', async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = await renderAuth();

    await expect(result.current.signIn(EMAIL, 'secret')).resolves.toEqual({
      ok: false,
      reason: 'offline',
    });
  });

  it.each([
    ['a 500', makeAuthError('server')],
    ['a rate limit', makeAuthError('rate_limited')],
    ['an unknown error', makeAuthError('unknown')],
  ])('U-AUTH-04 maps %s to server and reports it', async (_, error) => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error });
    const { result } = await renderAuth();

    await expect(result.current.signIn(EMAIL, 'secret')).resolves.toEqual({
      ok: false,
      reason: 'server',
    });
    expect(report).toHaveBeenCalledTimes(1);
    expect(jest.mocked(report).mock.calls[0][0]).toMatchObject({ category: 'server' });
  });

  it('U-AUTH-04 maps a thrown error to server', async () => {
    auth.signInWithPassword.mockRejectedValue(new Error('boom'));
    const { result } = await renderAuth();

    await expect(result.current.signIn(EMAIL, 'secret')).resolves.toEqual({
      ok: false,
      reason: 'server',
    });
  });
});

describe('signOut', () => {
  it('U-AUTH-06 revokes this session only, then clears it locally', async () => {
    const { result } = await renderSignedIn();

    let outcome;
    await act(async () => {
      outcome = await result.current.signOut();
    });

    expect(outcome).toEqual({ ok: true });
    expect(auth.admin.signOut).toHaveBeenCalledWith(SESSION.access_token, 'local');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.admin.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      auth.signOut.mock.invocationCallOrder[0],
    );
    expect(result.current.state).toEqual({ status: 'signedOut', reason: 'none' });
  });

  it.each([
    ['already revoked', makeAuthError('session_not_found')],
    ['an expired token', makeAuthError('unauthorized')],
  ])('still clears the local session when the backend reports it %s', async (_, error) => {
    auth.admin.signOut.mockResolvedValue({ data: null, error });
    const { result } = await renderSignedIn();

    await act(async () => {
      await expect(result.current.signOut()).resolves.toEqual({ ok: true });
    });

    expect(result.current.state).toEqual({ status: 'signedOut', reason: 'none' });
  });

  it.each([
    ['the revoke', () => auth.admin.signOut.mockResolvedValue(failure('retryable_fetch'))],
    ['loading the session', () => auth.getSession.mockResolvedValue(noSession('retryable_fetch'))],
  ])(
    'U-AUTH-07 returns offline when %s fails on the network, and stays signed in',
    async (_, arrange) => {
      arrange();
      const ended = jest.fn();
      register(ended);
      const { result, clear } = await renderSignedIn();

      await act(async () => {
        await expect(result.current.signOut()).resolves.toEqual({ ok: false, reason: 'offline' });
      });
      await flushDeferred();

      expect(auth.signOut).not.toHaveBeenCalled();
      expect(result.current.state).toEqual({ status: 'signedIn', session: SESSION });
      expect(ended).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    },
  );

  it('returns server, stays signed in and reports when the revoke fails otherwise', async () => {
    auth.admin.signOut.mockResolvedValue(failure('server'));
    const { result } = await renderSignedIn();

    await act(async () => {
      await expect(result.current.signOut()).resolves.toEqual({ ok: false, reason: 'server' });
    });

    expect(auth.signOut).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('signedIn');
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('returns the error of the local sign-out, if it has one', async () => {
    auth.signOut.mockResolvedValue({ error: makeAuthError('retryable_fetch') });
    const { result } = await renderSignedIn();

    await act(async () => {
      await expect(result.current.signOut()).resolves.toEqual({ ok: false, reason: 'offline' });
    });
  });

  it('clears the local session without a revoke when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { result } = await renderSignedIn();

    await act(async () => {
      await expect(result.current.signOut()).resolves.toEqual({ ok: true });
    });

    expect(auth.admin.signOut).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('maps a thrown error', async () => {
    auth.getSession.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = await renderSignedIn();

    await act(async () => {
      await expect(result.current.signOut()).resolves.toEqual({ ok: false, reason: 'offline' });
    });
  });

  it('treats a later SIGNED_OUT the member did not start as expired', async () => {
    auth.admin.signOut.mockResolvedValue(failure('retryable_fetch'));
    const { result } = await renderSignedIn();
    await act(async () => {
      await result.current.signOut();
    });

    await send('SIGNED_OUT', null);

    expect(result.current.state).toEqual({ status: 'signedOut', reason: 'expired' });
  });
});

describe('session end', () => {
  it.each([
    ['signing out', async (signOut: () => Promise<unknown>) => void (await signOut())],
    ['the session expiring', async () => send('SIGNED_OUT', null)],
  ])(
    'U-AUTH-08 on %s runs every session-end callback, clears the cache, then the reporting user',
    async (_, leave) => {
      const calls: string[] = [];
      register(() => void calls.push('channel'));
      register(async () => void calls.push('other'));
      const { result, clear } = await renderSignedIn();
      clear.mockImplementation(() => void calls.push('clear'));
      jest.mocked(setReportingUser).mockImplementation((id) => void calls.push(`user:${id}`));

      await act(async () => leave(() => result.current.signOut()));
      await flushDeferred();

      expect(calls).toEqual(['channel', 'other', 'clear', 'user:null']);
    },
  );

  it('still clears everything when a callback fails, and reports the failure', async () => {
    register(() => {
      throw new Error('stop failed');
    });
    register(() => Promise.reject(new Error('remove failed')));
    const after = jest.fn();
    register(after);
    const { clear } = await renderSignedIn();

    await send('SIGNED_OUT', null);
    await flushDeferred();

    expect(after).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(setReportingUser).toHaveBeenCalledWith(null);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('stops calling a callback once it is unregistered', async () => {
    const ended = jest.fn();
    onSessionEnd(ended)();
    await renderSignedIn();

    await send('SIGNED_OUT', null);
    await flushDeferred();

    expect(ended).not.toHaveBeenCalled();
  });

  it('does not run when the app starts signed out', async () => {
    const ended = jest.fn();
    register(ended);
    const { clear } = await renderAuth();

    await send('INITIAL_SESSION', null);
    await flushDeferred();

    expect(ended).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('reporting user', () => {
  it('U-AUTH-09 entering signedIn identifies the member by account ID', async () => {
    await renderAuth();

    await send('SIGNED_IN', SESSION);
    await flushDeferred();

    expect(setReportingUser).toHaveBeenCalledTimes(1);
    expect(setReportingUser).toHaveBeenCalledWith('user-a');
  });
});

describe('the auth callback', () => {
  it('U-AUTH-10 returns at once and defers every side effect', async () => {
    const ended = jest.fn();
    register(ended);
    const { clear } = await renderAuth();

    let returned: unknown = 'not called';
    await act(async () => {
      returned = emitAuth('SIGNED_IN', SESSION);
    });
    expect(returned).toBeUndefined();
    expect(setReportingUser).not.toHaveBeenCalled();

    await act(async () => {
      emitAuth('SIGNED_OUT', null);
    });
    expect(ended).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();

    await flushDeferred();
    expect(setReportingUser).toHaveBeenCalledWith('user-a');
    expect(ended).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

function failure(kind: Parameters<typeof makeAuthError>[0]) {
  return { data: null, error: makeAuthError(kind) };
}

function noSession(kind: Parameters<typeof makeAuthError>[0]) {
  return { data: { session: null }, error: makeAuthError(kind) };
}
