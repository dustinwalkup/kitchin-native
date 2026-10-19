import { useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { type SignOutResult, useAuth } from './auth-provider';

type Failure = Extract<SignOutResult, { ok: false }>['reason'];

const FAILURE_MESSAGES: Record<Failure, string> = {
  offline: 'Signing out needs a connection', // R3.9
  server: "Couldn't sign out. Try again.",
};

/**
 * Sign out behind a confirmation (R3.5, R15.2), for any screen with a Sign out button. `message`
 * explains a failed attempt, after which the member is still signed in.
 */
export function useSignOut() {
  const { signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signOutNow() {
    setPending(true);
    setMessage(null);
    const result = await signOut();
    setPending(false);
    if (!result.ok) {
      const text = FAILURE_MESSAGES[result.reason];
      setMessage(text);
      AccessibilityInfo.announceForAccessibility(text);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOutNow() },
    ]);
  }

  return { confirmSignOut, pending, message };
}
