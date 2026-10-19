import { type ComponentRef, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, type TextInput, View } from 'react-native';

import { type SignInResult, useAuth } from '@/features/auth/auth-provider';
import { Button } from '@/ui/button';
import { LogoTile } from '@/ui/logo-tile';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

type Failure = Extract<SignInResult, { ok: false }>['reason'];

const MESSAGES: Record<Failure, string> = {
  // The same words for an unknown email and a wrong password (R2.5).
  invalid_credentials: 'Email or password is incorrect',
  offline: "You're offline. Connect to sign in.", // R2.6
  server: "Couldn't sign in. Try again.",
};

const PLAUSIBLE_EMAIL = /^\S+@\S+\.\S+$/;

/** Email and password only: no sign-up, reset or invitations (R2.8). */
export default function SignIn() {
  const { state, signIn } = useAuth();
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [left, setLeft] = useState({ email: false, password: false });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const emailValid = PLAUSIBLE_EMAIL.test(email.trim());
  const canSubmit = emailValid && password.length > 0 && !pending; // R2.3, R2.4

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setFailure(null);
    const result = await signIn(email, password);
    // On success the spinner stays until the guards replace this screen.
    if (!result.ok) {
      setPending(false);
      setFailure(result.reason);
      AccessibilityInfo.announceForAccessibility(MESSAGES[result.reason]);
    }
  }

  const expired = state.status === 'signedOut' && state.reason === 'expired';
  const message = failure ? MESSAGES[failure] : expired ? 'Please sign in again' : null; // R3.6

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.brand}>
          <LogoTile />
          <Text variant="largeTitle" accessibilityRole="header">
            Kitchin
          </Text>
        </View>

        {message ? (
          <Text
            variant="subhead"
            color={failure ? 'destructive' : 'ink'}
            bold
            accessibilityRole="alert"
          >
            {message}
          </Text>
        ) : null}

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          onBlur={() => setLeft((current) => ({ ...current, email: true }))}
          error={left.email && !emailValid ? 'Enter a valid email address.' : null}
          // iOS Password AutoFill pairs a "username" field with the password field (R2.2).
          textContentType="username"
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          onBlur={() => setLeft((current) => ({ ...current, password: true }))}
          error={left.password && password.length === 0 ? 'Enter your password.' : null}
          textContentType="password"
          autoComplete="current-password"
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <Button
          label="Sign in"
          onPress={() => void submit()}
          disabled={!canSubmit}
          loading={pending}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  brand: { alignItems: 'center', gap: 12, marginBottom: 16 },
});
