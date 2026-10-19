import { createClient } from '@supabase/supabase-js';

import { secureSessionStorage } from './secure-session-storage';
import { supabase } from './supabase';

const URL_VALUE = 'http://127.0.0.1:54321';
const KEY_VALUE = 'sb_publishable_local';

// env.ts validates every EXPO_PUBLIC_* value at import. The client reads only these two.
jest.mock('./env', () => ({
  env: { supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'sb_publishable_local' },
}));

// The real createClient, wrapped so the test can read the options it was given.
jest.mock('@supabase/supabase-js', () => {
  const actual = jest.requireActual('@supabase/supabase-js');
  return { ...actual, createClient: jest.fn(actual.createClient) };
});

// Creating the client starts supabase-js's refresh ticker.
afterAll(() => supabase.auth.stopAutoRefresh());

describe('supabase client', () => {
  it('U-SBC-02 keeps an encrypted, persisted, auto-refreshed session and ignores session URLs', () => {
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(URL_VALUE, KEY_VALUE, {
      auth: {
        storage: secureSessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  });

  // Jest runs on Node's URL. On the phone, React Native's own URL has no `protocol` setter, which
  // createClient needs. Expo's runtime replaces it as soon as `expo` loads, which both the app's
  // entry and the expo-* modules behind the session storage do (OI-3).
  it("works on Expo's URL, which replaces React Native's", async () => {
    // The isolated copy of Expo reinstalls these, so the originals go back afterwards.
    const saved = (['URL', 'URLSearchParams', 'fetch'] as const).map(
      (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)!] as const,
    );
    const native = jest.requireActual<Pick<typeof globalThis, 'URL' | 'URLSearchParams'>>(
      'react-native/Libraries/Blob/URL',
    );

    try {
      Object.assign(globalThis, { URL: native.URL, URLSearchParams: native.URLSearchParams });
      let client: typeof supabase | undefined;
      jest.isolateModules(() => {
        jest.requireActual('expo');
        ({ supabase: client } = jest.requireActual<typeof import('./supabase')>('./supabase'));
      });

      expect(globalThis.URL).not.toBe(native.URL);
      // The http → ws swap is the `protocol` setter that React Native's URL lacks.
      expect(client!.realtime.endpointURL()).toMatch(/^ws:\/\/127\.0\.0\.1:54321\/realtime\/v1\//);
      await client!.auth.stopAutoRefresh();
    } finally {
      for (const [name, descriptor] of saved) Object.defineProperty(globalThis, name, descriptor);
    }
  });
});
