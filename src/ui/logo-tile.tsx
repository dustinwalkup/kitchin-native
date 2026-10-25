import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';

import { useTheme } from './use-theme';

/** The Kitchin chef-hat mark on a terracotta tile (R16.5 as redesigned). */
export function LogoTile({ size = 72 }: { size?: number }) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Kitchin"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        backgroundColor: theme.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name="chef-hat" size={Math.round(size * 0.6)} color={theme.onBrand} />
    </View>
  );
}
