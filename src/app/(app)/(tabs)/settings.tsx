import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { useSignOut } from '@/features/auth/use-sign-out';
import { env } from '@/lib/env';
import { reportTestError } from '@/lib/reporting';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

const ENVIRONMENTS = { development: 'Development', production: 'Production' } as const;

const VERSION = `${Application.nativeApplicationVersion ?? '–'} (${Application.nativeBuildVersion ?? '–'})`;

/** The account, the build and Sign out, plus development tools in the development variant (R15). */
export default function Settings() {
  const router = useRouter();
  const { state } = useAuth();
  const { confirmSignOut, pending, message } = useSignOut();
  const email = state.status === 'signedIn' ? state.session.user.email : undefined;

  return (
    <Screen edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.group}>
          <Row label="Signed in as" value={email ?? '–'} />
          <Row label="Version" value={VERSION} />
          <Row label="Environment" value={ENVIRONMENTS[env.variant]} />
        </Card>

        <View style={styles.group}>
          <Button label="Sign out" variant="secondary" loading={pending} onPress={confirmSignOut} />
          {message ? (
            <Text variant="footnote" color="destructive" bold>
              {message}
            </Text>
          ) : null}
        </View>

        {/* The production variant has neither (R15.4). */}
        {env.variant === 'development' && (
          <View style={styles.group}>
            <Text variant="footnote" color="inkMuted" accessibilityRole="header">
              Developer tools
            </Text>
            <Button
              label="Theme preview"
              variant="secondary"
              onPress={() => router.push('/theme')}
            />
            <Button label="Send test error" variant="secondary" onPress={reportTestError} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/** A label and its value, read by VoiceOver as one element. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible>
      <Text>{label}</Text>
      <Text color="inkMuted" style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  group: { gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, minHeight: 44 },
  value: { flexShrink: 1, textAlign: 'right' },
});
