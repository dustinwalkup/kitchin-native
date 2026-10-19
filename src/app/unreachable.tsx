import { StyleSheet, View } from 'react-native';

import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { useHousehold } from '@/features/household/household-provider';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/**
 * The membership couldn't load (R1.7). Screen shows the offline banner when that's why, and the
 * membership loads by itself once the device is back online.
 */
export default function Unreachable() {
  const household = useHousehold();

  return (
    <Screen>
      <View style={styles.content}>
        <Text variant="title" accessibilityRole="header">
          Can&apos;t reach Kitchin
        </Text>
        <Text>Check your connection, then try again.</Text>
        <Button
          label="Retry"
          onPress={() => {
            if (household.status === 'unreachable') household.retry();
          }}
        />
        <SignOutButton />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
});
