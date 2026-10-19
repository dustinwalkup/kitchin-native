import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { env } from '@/lib/env';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/** A placeholder until task 3.8 adds the account, version and sign-out rows (R15). */
export default function Settings() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.content}>
        <Text>Environment: {env.variant}</Text>
        {env.variant === 'development' && (
          <Button label="Theme preview" variant="secondary" onPress={() => router.push('/theme')} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
});
