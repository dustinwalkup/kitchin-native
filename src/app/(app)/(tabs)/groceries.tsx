import { StyleSheet, View } from 'react-native';

import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/** A placeholder until section 4 adds the list (R4). */
export default function Groceries() {
  return (
    <Screen>
      <View style={styles.content}>
        <Text variant="subhead" color="inkMuted">
          Your grocery list will appear here.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
