// A controllable backend for route tests, which render the real root layout and its providers.
// It stands in for Supabase Auth, the household channel and the membership query, and nothing else:
//
//   jest.mock('@/lib/supabase', () => ({
//     supabase: jest.requireActual('@/test/mock-backend').mockSupabase,
//   }));
//   jest.mock('@/features/household/api', () => jest.requireActual('@/test/mock-backend').mockHouseholdApi);
//
// jest.requireActual returns the same instance the test file imports, so both share the mocks.
// Call resetBackend() in beforeEach. Like supabase-js, the auth mock announces INITIAL_SESSION
// shortly after the provider subscribes, and signOut announces SIGNED_OUT before it resolves.
// The channel joins only when a test calls `mockRealtime.latest().emitStatus('SUBSCRIBED')`.
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import type { Membership } from '@/features/household/api';

import { makeSession } from './factories';
import { createFakeRealtime } from './fake-channel';

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => unknown;

export const SESSION = makeSession('user-a');

export const MEMBERSHIP: Membership = {
  household: {
    id: 'household-1',
    name: 'Household One',
    timeZone: 'America/Denver',
    weekStart: 0,
  },
  displayName: 'Member A',
};

export const mockAuth = {
  onAuthStateChange: jest.fn(),
  getSession: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  admin: { signOut: jest.fn() },
};

export const mockRealtime = createFakeRealtime();

/** The Supabase client: Auth, plus the realtime calls the household channel makes. */
export const mockSupabase = {
  auth: mockAuth,
  realtime: mockRealtime.realtime,
  channel: mockRealtime.channel,
  removeChannel: mockRealtime.removeChannel,
};

export const mockHouseholdApi = { fetchMemberships: jest.fn(), updateWeekStart: jest.fn() };

let listener: AuthCallback | null = null;

/** Sends an auth event to the provider. Wrap it in act(). */
export async function emitAuth(event: AuthChangeEvent, session: Session | null): Promise<void> {
  await listener?.(event, session);
}

export interface BackendOptions {
  /** The session restored at launch; `'pending'` never finishes restoring. */
  session?: Session | null | 'pending';
  memberships?: Membership[];
}

export function resetBackend({
  session = SESSION,
  memberships = [MEMBERSHIP],
}: BackendOptions = {}) {
  listener = null;
  for (const mock of [...Object.values(mockAuth).filter(isMock), mockAuth.admin.signOut]) {
    mock.mockReset();
  }
  mockHouseholdApi.fetchMemberships.mockReset();
  mockHouseholdApi.updateWeekStart.mockReset();
  mockRealtime.reset();

  mockAuth.onAuthStateChange.mockImplementation((callback: AuthCallback) => {
    listener = callback;
    if (session !== 'pending') {
      void Promise.resolve().then(() => callback('INITIAL_SESSION', session));
    }
    return { data: { subscription: { id: 'test', callback, unsubscribe: jest.fn() } } };
  });
  mockAuth.getSession.mockResolvedValue({
    data: { session: session === 'pending' ? null : session },
    error: null,
  });
  mockAuth.signInWithPassword.mockImplementation(async () => {
    await emitAuth('SIGNED_IN', SESSION);
    return { data: { session: SESSION }, error: null };
  });
  mockAuth.admin.signOut.mockResolvedValue({ data: null, error: null });
  mockAuth.signOut.mockImplementation(async () => {
    await emitAuth('SIGNED_OUT', null);
    return { error: null };
  });
  mockHouseholdApi.fetchMemberships.mockResolvedValue(memberships);
  mockHouseholdApi.updateWeekStart.mockResolvedValue(undefined);
}

function isMock(value: unknown): value is jest.Mock {
  return jest.isMockFunction(value);
}
