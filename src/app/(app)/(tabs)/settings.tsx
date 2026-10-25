import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { useSignOut } from '@/features/auth/use-sign-out';
import { useWeekStart } from '@/features/household/use-week-start';
import { weekdayName } from '@/lib/calendar';
import { env } from '@/lib/env';
import { reportTestError } from '@/lib/reporting';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

const ENVIRONMENTS = { development: 'Development', production: 'Production' } as const;

const VERSION = `${Application.nativeApplicationVersion ?? '–'} (${Application.nativeBuildVersion ?? '–'})`;

/**
 * The account, the build, the household's start of the week and Sign out, plus development tools in
 * the development variant (R15, meals R48.1).
 */
export default function Settings() {
  const router = useRouter();
  const theme = useTheme();
  const weekStart = weekdayName(useWeekStart());
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

        {/* The household's, so it says it applies to both members (R48.2, design §11.5). */}
        <View style={styles.group}>
          <Card>
            <Pressable
              testID="settings-week-start"
              accessibilityRole="button"
              accessibilityLabel={`Week starts on, ${weekStart}`}
              accessibilityHint="Changes the first day of the week"
              onPress={() => router.push('/week-start')}
              style={({ pressed }) => [styles.row, styles.link, pressed && styles.pressed]}
            >
              <Text>Week starts on</Text>
              <Text color="inkMuted" style={styles.linkValue}>
                {weekStart}
              </Text>
              <SymbolView
                name="chevron.right"
                weight="semibold"
                tintColor={theme.inkMuted}
                size={13}
              />
            </Pressable>
          </Card>
          <Text variant="footnote" color="inkMuted">
            Meals shows weeks from this day, for everyone in the household.
          </Text>
        </View>

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
  link: { alignItems: 'center', gap: 8 },
  // Fills the row, so the day sits beside the chevron.
  linkValue: { flex: 1, textAlign: 'right' },
  pressed: { opacity: 0.6 },
  value: { flexShrink: 1, textAlign: 'right' },
});
