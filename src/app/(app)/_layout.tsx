import { Stack } from 'expo-router';

import { env } from '@/lib/env';

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* The production variant has no theme preview (R15.4). */}
      <Stack.Protected guard={env.variant === 'development'}>
        <Stack.Screen name="theme" options={{ title: 'Theme preview' }} />
      </Stack.Protected>
    </Stack>
  );
}
