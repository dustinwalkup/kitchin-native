import { StyleSheet, View } from 'react-native';

import { LogoTile } from '@/ui/logo-tile';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/** A placeholder until task 3.7 adds the sign-in form (R2). */
export default function SignIn() {
  return (
    <Screen>
      <View style={styles.content}>
        <LogoTile />
        <Text variant="largeTitle">Kitchin</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
});
