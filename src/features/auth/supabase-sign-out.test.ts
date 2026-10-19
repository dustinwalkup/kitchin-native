import { createClient, type SupportedStorage } from '@supabase/supabase-js';

import { makeSession } from '@/test/factories';

// OI-9: what supabase-js 2.118 does when sign-out can't reach the backend, which is why the auth
// provider revokes the session before clearing it. These run the real client against in-memory
// storage and a fetch that fails the way React Native's does offline.

const STORAGE_KEY = 'sb-test-auth-token';
const SESSION = makeSession();

function makeClient(fetch: jest.Mock) {
  const items = new Map([[STORAGE_KEY, JSON.stringify(SESSION)]]);
  const storage: SupportedStorage = {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => void items.set(key, value),
    removeItem: async (key) => void items.delete(key),
  };
  const client = createClient('http://127.0.0.1:54321', 'sb_publishable_local', {
    auth: { storage, storageKey: STORAGE_KEY, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });

  const events: string[] = [];
  client.auth.onAuthStateChange((event) => void events.push(event));
  return { client, events, isStored: () => items.has(STORAGE_KEY) };
}

const offline = () => jest.fn().mockRejectedValue(new TypeError('Network request failed'));

describe('supabase-js sign-out (OI-9)', () => {
  it('signOut deletes the local session even when the request fails', async () => {
    const { client, events, isStored } = makeClient(offline());

    const { error } = await client.auth.signOut({ scope: 'local' });

    expect(error?.name).toBe('AuthRetryableFetchError');
    expect(isStored()).toBe(false);
    expect(events).toContain('SIGNED_OUT');
  });

  it('revoking with admin.signOut leaves the local session alone when the request fails', async () => {
    const { client, events, isStored } = makeClient(offline());

    const { error } = await client.auth.admin.signOut(SESSION.access_token, 'local');

    expect(error?.name).toBe('AuthRetryableFetchError');
    expect(isStored()).toBe(true);
    expect((await client.auth.getSession()).data.session?.user.id).toBe('user-a');
    expect(events).not.toContain('SIGNED_OUT');
  });

  it('after a revoke, signOut clears the local session without an error', async () => {
    const fetch = jest
      .fn()
      // The revoke succeeds…
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      // …so signOut's own request finds the session gone, which supabase-js ignores.
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 'session_not_found', msg: 'Session not found' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const { client, events, isStored } = makeClient(fetch);

    expect((await client.auth.admin.signOut(SESSION.access_token, 'local')).error).toBeNull();
    expect((await client.auth.signOut({ scope: 'local' })).error).toBeNull();

    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe('http://127.0.0.1:54321/auth/v1/logout?scope=local');
      expect(init.headers.Authorization).toBe(`Bearer ${SESSION.access_token}`);
    }
    expect(isStored()).toBe(false);
    expect(events).toContain('SIGNED_OUT');
  });
});
