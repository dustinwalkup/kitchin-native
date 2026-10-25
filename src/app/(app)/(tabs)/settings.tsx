import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { useSignOut } from '@/features/auth/use-sign-out';
import { useWeekStart } from '@/features/household/use-week-start';
import { weekdayName } from '@/lib/calendar';
import { env } from '@/lib/env';
import { reportTestError } from '@/lib/reporting';
import { Group } from '@/ui/group';
import { ListRow } from '@/ui/list-row';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

const ENVIRONMENTS = { development: 'Development', production: 'Production' } as const;

const VERSION = `${Application.nativeApplicationVersion ?? '–'} (${Application.nativeBuildVersion ?? '–'})`;

/**
 * The account, the household's start of the week, the build, and development tools in the
 * development variant (R15, meals R48.1), as inset grouped lists (specs/redesign/design.md §7).
 * Developer tools sit last, under their own heading, apart from the household's settings.
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
        <Group title="Account">
          <ListRow label="Signed in as" value={email ?? '–'} />
          <ListRow
            testID="settings-sign-out"
            label="Sign out"
            tint
            centered
            chevron={false}
            disabled={pending}
            accessibilityState={{ busy: pending }}
            accessory={pending ? <ActivityIndicator color={theme.accent} /> : undefined}
            onPress={confirmSignOut}
          />
        </Group>
        {message ? (
          <Text variant="footnote" color="destructive" weight="semibold" style={styles.message}>
            {message}
          </Text>
        ) : null}

        {/* The household's, so it says it applies to both members (R48.2, design §11.5). */}
        <Group
          title="Household"
          footer="Meals shows weeks from this day, for everyone in the household."
        >
          <ListRow
            testID="settings-week-start"
            label="Week starts on"
            value={weekStart}
            accessibilityHint="Changes the first day of the week"
            onPress={() => router.push('/week-start')}
          />
        </Group>

        <Group title="About">
          <ListRow label="Version" value={VERSION} />
          <ListRow label="Environment" value={ENVIRONMENTS[env.variant]} />
        </Group>

        {/* The production variant has neither (R15.4). */}
        {env.variant === 'development' && (
          <Group title="Developer tools">
            <ListRow label="Theme preview" onPress={() => router.push('/theme')} />
            <ListRow label="Send test error" chevron={false} onPress={reportTestError} />
          </Group>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 8, gap: 24 },
  message: { marginTop: -16, paddingHorizontal: 4 },
});
