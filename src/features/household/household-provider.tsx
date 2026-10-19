import { skipToken, useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { report, reportOnce } from '@/lib/reporting';

import { fetchMemberships } from './api';

// The signed-in member's household (specs/mvp/2-design.md §3.3). It must sit inside the
// AuthProvider and the QueryClientProvider.

export type HouseholdState =
  | { status: 'idle' } // signed out
  | { status: 'loading' }
  | { status: 'none' } // R1.3
  | { status: 'unreachable'; retry(): void } // R1.7
  | {
      status: 'ready';
      household: { id: string; name: string; timeZone: string };
      member: { userId: string; displayName: string };
    };

const HouseholdContext = createContext<HouseholdState | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { state: auth } = useAuth();
  const userId = auth.status === 'signedIn' ? auth.session.user.id : null;

  const { data, error, fetchStatus, refetch } = useQuery({
    queryKey: ['membership', userId],
    // No query at all while signed out (R1.3).
    queryFn: userId === null ? skipToken : () => fetchMemberships(userId),
  });

  // The facade drops what isn't reportable, such as network errors (R26.2).
  useEffect(() => {
    if (error) report(error);
  }, [error]);

  useEffect(() => {
    if (data && data.length > 1) reportOnce('membership_multiple'); // R1.6
  }, [data]);

  const state = useMemo((): HouseholdState => {
    if (userId === null) return { status: 'idle' };
    // Data that has loaded once stays in use while a later refetch is offline or fails.
    if (data) {
      const [oldest] = data;
      if (!oldest) return { status: 'none' };
      return {
        status: 'ready',
        household: oldest.household,
        member: { userId, displayName: oldest.displayName },
      };
    }
    // A paused query resumes by itself when the device comes back online (R1.7).
    if (error || fetchStatus === 'paused') {
      return { status: 'unreachable', retry: () => void refetch() };
    }
    return { status: 'loading' };
  }, [userId, data, error, fetchStatus, refetch]);

  return <HouseholdContext.Provider value={state}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdState {
  const state = useContext(HouseholdContext);
  if (!state) throw new Error('useHousehold must be used inside <HouseholdProvider>');
  return state;
}
