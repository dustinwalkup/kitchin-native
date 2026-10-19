import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Text } from '@/ui/text';

import { useSignOut } from '../use-sign-out';

/** Sign out, behind the same confirmation as Settings (R3.5), for the access screens. */
export function SignOutButton() {
  const { confirmSignOut, pending, message } = useSignOut();

  return (
    <View style={styles.group}>
      <Button label="Sign out" variant="secondary" loading={pending} onPress={confirmSignOut} />
      {message ? (
        <Text variant="subhead" color="destructive" bold>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
});
