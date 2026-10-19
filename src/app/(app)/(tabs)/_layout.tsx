import { Tabs } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';

import { useTheme } from '@/ui/use-theme';

// The main tabs are Groceries and Settings (R1.5). Cactus labels are bold because cactus carries
// text only in bold (N13).
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.cactus,
        tabBarInactiveTintColor: theme.inkMuted,
        tabBarLabelStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="groceries"
        options={{
          title: 'Groceries',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name="cart.fill" tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name="gearshape.fill" tintColor={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
