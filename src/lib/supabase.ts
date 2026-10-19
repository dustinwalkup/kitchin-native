// The app's one Supabase client. See specs/mvp/2-design.md §3.2. Screens and components can't
// import it (§2.2): data goes through a feature's hooks.ts → api.ts.
//
// No URL polyfill (OI-3). supabase-js sets `URL.protocol`, which React Native's own URL can't do,
// but Expo's runtime replaces that URL with a standard one as soon as `expo` loads, and the
// session storage's expo-* imports load it before createClient runs.
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

import { env } from './env';
import { secureSessionStorage } from './secure-session-storage';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storage: secureSessionStorage, // encrypted at rest (R3.2)
    persistSession: true, // survives a relaunch (R3.1)
    autoRefreshToken: true, // only in the foreground: see auto-refresh.ts (R3.3)
    detectSessionInUrl: false, // no URL-based auth flows on native
  },
});
