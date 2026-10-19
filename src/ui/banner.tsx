import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

/** A full-width strip for a lasting state, such as being offline (R13.1). */
export function Banner({ message }: { message: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.banner, { backgroundColor: theme.ink }]}>
      <Text variant="subhead" color="onBrand">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 10 },
});
