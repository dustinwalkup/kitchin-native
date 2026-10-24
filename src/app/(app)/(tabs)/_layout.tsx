import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ReconnectingPill } from '@/features/household/components/reconnecting-pill';
import { COPY as LIBRARY_COPY } from '@/features/meal-library/constants';
import { AddToGroceriesButton } from '@/features/meals/components/add-to-groceries-button';
import { useTheme } from '@/ui/use-theme';

// The main tabs are Groceries, Meals, Library and Settings, and the app opens on Groceries (R1.5,
// K16, meal-library K18). The active tab's colour comes from the focused screen: cactus, or terracotta on Meals
// and the library (DD36, R40.12). Both carry text only in bold (N13), so the labels are bold.
export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();

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
          // Beside the title, where it doesn't cover the list (§3.4, R13.4).
          headerRight: () => <ReconnectingPill />,
          headerRightContainerStyle: { paddingRight: 16 },
          tabBarIcon: ({ color, size }) => (
            <SymbolView name="cart.fill" tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: 'Meals',
          tabBarActiveTintColor: theme.accent,
          // The sheet opens over Meals, which keeps its week and scroll position (R37.1, R37.3).
          headerRight: () => (
            <View style={styles.headerRight}>
              <ReconnectingPill />
              <AddToGroceriesButton onPress={() => router.push('/add-item')} />
            </View>
          ),
          // The button's 44 pt target pads the glyph, so the edge needs less.
          headerRightContainerStyle: { paddingRight: 8 },
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
          tabBarActiveTintColor: theme.accent,
          // The screen sets Add meal beside the Reconnecting pill; Add meal's 44 pt target pads it.
          headerRightContainerStyle: { paddingRight: 8 },
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
