import { Stack } from 'expo-router';

import { groceryTableHandlers } from '@/features/groceries/realtime';
import { useRealtimeDegradedReport } from '@/features/household/use-connection-state';
import {
  type TableHandlers,
  useHouseholdRealtime,
} from '@/features/household/use-household-realtime';
import { libraryTableHandlers } from '@/features/meal-library/realtime';
import { mealTableHandlers } from '@/features/meals/realtime';
import { env } from '@/lib/env';

// A screen that fails to render is replaced by the crash screen, and the root stays mounted (R14.6).
export { ErrorBoundary } from '@/ui/crash-screen';

// Which feature updates the cache for each table's live events (§3.6).
const TABLE_HANDLERS: TableHandlers = {
  ...groceryTableHandlers,
  ...mealTableHandlers,
  ...libraryTableHandlers,
};

export default function AppLayout() {
  // Every household screen sits under this layout, so the channel runs while the household is open.
  useHouseholdRealtime(TABLE_HANDLERS);
  useRealtimeDegradedReport();

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* A native sheet, with its own title and Done (§3.4, DD10). */}
      <Stack.Screen
        name="add-item"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
      {/* A pushed card over Meals, with Back to it (§3.8, DD50). */}
      <Stack.Screen
        name="meal-library"
        options={{ title: 'Meal Library', headerBackTitle: 'Meals' }}
      />
      {/* Full screen, so only Cancel can close it; the screen sets its title and buttons (§3.9). */}
      <Stack.Screen name="meal-form" options={{ presentation: 'fullScreenModal' }} />
      {/* A page sheet over Meals; a swipe down cancels, as Cancel does (§3.10, R45.7). The header
          is opaque: iOS 26's glass header lets content run under it, and only a screen whose first
          child is its list gets inset below it. The picker's slot name comes first (R45.2). */}
      <Stack.Screen
        name="meal-picker"
        options={{ presentation: 'modal', title: 'Choose a meal', headerTransparent: false }}
      />
      {/* The production variant has no theme preview (R15.4). */}
      <Stack.Protected guard={env.variant === 'development'}>
        <Stack.Screen name="theme" options={{ title: 'Theme preview' }} />
      </Stack.Protected>
    </Stack>
  );
}
