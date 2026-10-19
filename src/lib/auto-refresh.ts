import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

/**
 * Refreshes the session only while the app is in the foreground (R3.3). supabase-js can't tell on
 * React Native, so it asks the app to start and stop the refresh. Call this once, from the root
 * layout, which isn't allowed to import the client itself (2-design §2.2).
 */
export function useForegroundAutoRefresh(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, []);
}
