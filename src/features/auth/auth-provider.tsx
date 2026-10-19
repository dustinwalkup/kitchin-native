import { type AuthChangeEvent, isAuthApiError, type Session } from '@supabase/supabase-js';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { classifyError } from '@/lib/errors';
import { report, setReportingUser } from '@/lib/reporting';
import { supabase } from '@/lib/supabase';

// The member's session, from supabase-js's auth events (specs/mvp/2-design.md §3.3). It must sit
// inside the QueryClientProvider, because ending a session clears the cache.

export type AuthState =
  | { status: 'restoring' }
  | { status: 'signedOut'; reason: 'none' | 'expired' }
  | { status: 'signedIn'; session: Session };

export type SignInResult =
  { ok: true } | { ok: false; reason: 'invalid_credentials' | 'offline' | 'server' };

export type SignOutResult = { ok: true } | { ok: false; reason: 'offline' | 'server' };

export interface AuthApi {
  state: AuthState;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<SignOutResult>;
}

type SessionEndCallback = () => void | Promise<void>;

const sessionEndCallbacks = new Set<SessionEndCallback>();

/**
 * Runs `callback` each time the member leaves `signedIn`, whether they signed out or the session
 * expired, before the query cache is cleared (R3.5, R3.6). Returns a function that unregisters it.
 */
export function onSessionEnd(callback: SessionEndCallback): () => void {
  sessionEndCallbacks.add(callback);
  return () => {
    sessionEndCallbacks.delete(callback);
  };
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'restoring' });
  const signingOut = useRef(false);

  useEffect(() => {
    let current: AuthState = { status: 'restoring' };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const previous = current;
      const next = nextState(previous, event, session, signingOut.current);
      if (next === previous) return;
      current = next;
      setState(next);
      // supabase-js holds its auth lock while this callback runs, and a Supabase call awaited here
      // can deadlock, so the side effects run afterwards (§3.3).
      setTimeout(() => onTransition(previous, next, queryClient), 0);
    });

    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? { ok: false, reason: signInFailure(error) } : { ok: true };
    } catch (e) {
      return { ok: false, reason: signInFailure(e) };
    }
  }, []);

  const signOut = useCallback(async (): Promise<SignOutResult> => {
    signingOut.current = true;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) return { ok: false, reason: failureReason(error) };

      if (data.session) {
        // supabase-js deletes the local session even when its own logout request fails (OI-9), so
        // the session is revoked first, and cleared only once the backend has dropped it (R3.9).
        // Despite the name, `admin.signOut` sends only the member's own access token.
        const revoke = await supabase.auth.admin.signOut(data.session.access_token, 'local');
        if (revoke.error && !isAlreadyRevoked(revoke.error)) {
          return { ok: false, reason: failureReason(revoke.error) };
        }
      }

      // This device only; the default scope would sign the member out everywhere (DD13).
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      return signOutError ? { ok: false, reason: failureReason(signOutError) } : { ok: true };
    } catch (e) {
      return { ok: false, reason: failureReason(e) };
    } finally {
      signingOut.current = false;
    }
  }, []);

  const api = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const api = useContext(AuthContext);
  if (!api) throw new Error('useAuth must be used inside <AuthProvider>');
  return api;
}

function nextState(
  current: AuthState,
  event: AuthChangeEvent,
  session: Session | null,
  signingOut: boolean,
): AuthState {
  switch (event) {
    case 'INITIAL_SESSION':
      if (session) return { status: 'signedIn', session };
      // A session that couldn't be refreshed at launch has already been signed out as expired.
      return current.status === 'signedOut' ? current : { status: 'signedOut', reason: 'none' };
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
    case 'USER_UPDATED':
      return session ? { status: 'signedIn', session } : current;
    case 'SIGNED_OUT':
      // Revoked or no longer refreshable, unless the member asked for it (R3.6).
      return { status: 'signedOut', reason: signingOut ? 'none' : 'expired' };
    default:
      return current;
  }
}

function onTransition(previous: AuthState, next: AuthState, queryClient: QueryClient): void {
  if (next.status === 'signedIn' && previous.status !== 'signedIn') {
    setReportingUser(next.session.user.id); // the account ID only (R26.11)
  }
  if (previous.status === 'signedIn' && next.status !== 'signedIn') {
    endSession(queryClient);
  }
}

/** The clean-up for both a sign-out and an expired session (R3.5, R3.6). */
function endSession(queryClient: QueryClient): void {
  // Callbacks first, so the household channel stops before the cache empties (§3.6). A failing
  // callback mustn't keep household data in memory.
  for (const callback of sessionEndCallbacks) {
    try {
      void Promise.resolve(callback()).catch(reportFailure);
    } catch (e) {
      reportFailure(e);
    }
  }
  // Also drops paused mutations, so nothing queued offline replays for the next account.
  queryClient.clear();
  setReportingUser(null);
}

function reportFailure(e: unknown): void {
  report(classifyError(e));
}

function signInFailure(e: unknown): 'invalid_credentials' | 'offline' | 'server' {
  // Supabase Auth rejects an unknown email and a wrong password with the same 400 (R2.5).
  if (isAuthApiError(e) && e.status === 400) return 'invalid_credentials';
  return failureReason(e);
}

/** A network failure means offline (R2.6, R3.9). Anything else is unexpected, so it's reported. */
function failureReason(e: unknown): 'offline' | 'server' {
  const error = classifyError(e);
  if (error.category === 'network') return 'offline';
  report(error);
  return 'server';
}

/** The statuses supabase-js's own signOut also treats as an already-ended session. */
function isAlreadyRevoked(e: unknown): boolean {
  return isAuthApiError(e) && (e.status === 401 || e.status === 403 || e.status === 404);
}
