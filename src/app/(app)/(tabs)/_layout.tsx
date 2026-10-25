import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ReconnectingPill } from '@/features/household/components/reconnecting-pill';
import { COPY as LIBRARY_COPY } from '@/features/meal-library/constants';
import { AddToGroceriesButton } from '@/features/meals/components/add-to-groceries-button';
import { useTheme } from '@/ui/use-theme';

// The main tabs are Groceries, Meals, Library and Settings, and the app opens on Groceries (R1.5,
// K16, meal-library K18). One accent for every tab: the active tab is terracotta, in bold, which
// terracotta needs to carry text (N13), and the rest are muted (specs/redesign/design.md §3.4).
export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        // The header is part of the page: ivory, no rule beneath, the title centred.
        headerStyle: { backgroundColor: theme.screen },
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerTitleStyle: { color: theme.ink, fontSize: 17, fontWeight: '600' },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.inkMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        headerRightContainerStyle: { paddingRight: 8 },
        headerLeftContainerStyle: { paddingLeft: 8 },
      }}
    >
      <Tabs.Screen
        name="groceries"
        options={{
          title: 'Groceries',
          // The screen sets its list menu beside the Reconnecting pill.
          tabBarIcon: ({ color, size }) => (
            <SymbolView name="cart.fill" tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: 'Meals',
          // The sheet opens over Meals, which keeps its week and scroll position (R37.1, R37.3).
          headerRight: () => (
            <View style={styles.headerRight}>
              <ReconnectingPill />
              <AddToGroceriesButton onPress={() => router.push('/add-item')} />
            </View>
          ),
          tabBarIcon: ({ color, size }) => (
            <SymbolView name="fork.knife" tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="meal-library"
        options={{
          // "Meal Library" in the header, "Library" under the icon (R40.1, R40.2).
          title: LIBRARY_COPY.title,
          tabBarLabel: LIBRARY_COPY.tabLabel,
          tabBarIcon: ({ color, size }) => (
            <SymbolView name="book.fill" tintColor={color} size={size} />
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

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
