import { DefaultTheme, Stack, type Theme as NavigationTheme, ThemeProvider } from 'expo-router';

import { env } from '@/lib/env';
import { DevBadge } from '@/ui/dev-badge';
import { useTheme } from '@/ui/use-theme';

// Section 3 adds the query client, toast, auth and household providers, the Stack.Protected
// guards (§3.3) and the SplashController here.

export default function RootLayout() {
  return (
    <Providers>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="sign-in" />
      </Stack>
      {env.variant === 'development' && <DevBadge />}
    </Providers>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider value={useNavigationTheme()}>{children}</ThemeProvider>;
}

/** Headers, tab bars and screen backgrounds take their colours from the desert theme (R16.7). */
function useNavigationTheme(): NavigationTheme {
  const theme = useTheme();

  return {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      // Header buttons use `primary` in regular weight, which cactus can't carry (N13).
      primary: theme.ink,
      background: theme.screen,
      card: theme.background,
      text: theme.ink,
      border: theme.border,
      notification: theme.cactus,
    },
  };
}
