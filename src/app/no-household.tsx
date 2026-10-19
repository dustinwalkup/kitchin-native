import { StyleSheet, View } from 'react-native';

import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/** A signed-in account with no membership (R1.3). It loads no household data. */
export default function NoHousehold() {
  return (
    <Screen>
      <View style={styles.content}>
        <Text variant="title" accessibilityRole="header">
          No household access
        </Text>
        <Text>This account isn&apos;t linked to a household yet. Ask the owner to set it up.</Text>
        <SignOutButton />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
});
