import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, type Theme as NavigationTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AuthProvider, type AuthState, useAuth } from '@/features/auth/auth-provider';
import {
  HouseholdProvider,
  type HouseholdState,
  useHousehold,
} from '@/features/household/household-provider';
import { useForegroundAutoRefresh } from '@/lib/auto-refresh';
import { env } from '@/lib/env';
import { queryClient } from '@/lib/query-client';
import { initSentry } from '@/lib/sentry';
import { ToastProvider } from '@/lib/toast';
import { DevBadge } from '@/ui/dev-badge';
import { KeyboardToolbar } from '@/ui/keyboard-toolbar';
import { useTheme } from '@/ui/use-theme';

// Before anything renders, so startup errors are reported too (§3.9).
initSentry();

// The splash stays up until the app knows which screen to show (R1.1). SplashController hides it.
void SplashScreen.preventAutoHideAsync();

// Catches what the (app) layout's boundary can't: the root itself and screens outside (app).
export { ErrorBoundary } from '@/ui/crash-screen';

export default Sentry.wrap(RootLayout);

function RootLayout() {
  useForegroundAutoRefresh();

  return (
    // Gestures, such as swiping a grocery row to delete it, work only inside this view.
    <GestureHandlerRootView style={styles.root}>
      {/* Tracks the keyboard for the toolbar and the screens' FormScrollViews. */}
      <KeyboardProvider>
        <Providers>
          <RootNavigator />
          {env.variant === 'development' && <DevBadge />}
        </Providers>
        {/* Beside the navigator, not inside a screen, so every screen gets it and none clips it. */}
        <KeyboardToolbar />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={useNavigationTheme()}>
        <ToastProvider>
          <AuthProvider>
            <HouseholdProvider>{children}</HouseholdProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** The app states of §2.4, from the auth and household states. */
type AppState = 'restoring' | 'signedOut' | 'loading' | 'noHousehold' | 'unreachable' | 'ready';
type ShownState = Exclude<AppState, 'loading'>;

function appState(auth: AuthState, household: HouseholdState): AppState {
  if (auth.status !== 'signedIn') return auth.status;
  switch (household.status) {
    case 'none':
      return 'noHousehold';
    case 'unreachable':
    case 'ready':
      return household.status;
    default:
      return 'loading';
  }
}

/**
 * While the membership loads, the screen that was showing stays: the splash at launch, sign-in
 * (with its spinner) after signing in, or "Can't reach Kitchin" while it retries.
 */
function useShownState(): ShownState {
  const app = appState(useAuth().state, useHousehold());
  const [shown, setShown] = useState<ShownState>('restoring');
  if (app !== 'loading' && app !== shown) setShown(app);
  return app === 'loading' ? shown : app;
}

function RootNavigator() {
  const shown = useShownState();

  // No screen at all until the app knows which one to show, so sign-in never flashes (R1.1).
  if (shown === 'restoring') return null;

  return (
    <>
      <SplashController />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={shown === 'signedOut'}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={shown === 'noHousehold'}>
          <Stack.Screen name="no-household" />
        </Stack.Protected>
        <Stack.Protected guard={shown === 'unreachable'}>
          <Stack.Screen name="unreachable" />
        </Stack.Protected>
        <Stack.Protected guard={shown === 'ready'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Hides the splash once the first screen has rendered. */
function SplashController() {
  useEffect(() => SplashScreen.hide(), []);
  return null;
}

/** Headers, tab bars and screen backgrounds take their colours from the theme (R16.7). */
function useNavigationTheme(): NavigationTheme {
  const theme = useTheme();

  return {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      // Header buttons, such as Back, use `primary` in regular weight, which accentInk can carry.
      primary: theme.accentInk,
      background: theme.screen,
      // Headers sit on the page's ivory, so the title reads as part of the screen.
      card: theme.screen,
      text: theme.ink,
      border: theme.border,
      notification: theme.accent,
    },
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
