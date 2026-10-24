import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';

import { HeaderAction } from '@/features/meal-library/components/header-action';
import { MealBrowser } from '@/features/meal-library/components/meal-browser';
import { COPY } from '@/features/meal-library/constants';
import type { Meal } from '@/features/meal-library/domain';
import { lastSaved, newMealName } from '@/features/meal-library/handoff';
import { type LibraryView, useLibrary } from '@/features/meal-library/hooks';
import { useIsOnline } from '@/lib/query-client';
import { ToastProvider, useToast } from '@/lib/toast';
import { Screen } from '@/ui/screen';
import { useTheme } from '@/ui/use-theme';

/**
 * The household's meals, to search, filter and open (§3.8). It has a search field, so its toasts
 * show at the top, where the keyboard can't cover them (DD60). Meals stays mounted underneath, so
 * Back returns to the same week and scroll position (R40.2).
 */
export default function MealLibrary() {
  return (
    <ToastProvider placement="top">
      <LibraryScreen />
    </ToastProvider>
  );
}

function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const library = useLibrary();
  const { refreshing, onRefresh } = usePullToRefresh(library.refetch);
  useRefreshFailedToast(library);
  const justSaved = useLastSaved();
  // The browser holds the search. This follows it, for Add meal to start the name from (R42.6).
  const search = useRef('');

  // Visible whether or not the library has meals (R40.6).
  const addMeal = () => {
    if (search.current === '') newMealName.clear();
    else newMealName.set(search.current);
    router.push('/meal-form');
  };

  // Stable, so the memoised rows don't redraw as the member types (N25). Only the ID travels in
  // the route (DD51).
  const openMeal = useCallback(
    (meal: Meal) => router.push({ pathname: '/meal-form', params: { id: meal.id } }),
    [router],
  );

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderAction testID="library-add-meal" label={COPY.addMeal} onPress={addMeal} />
          ),
        }}
      />
      <MealBrowser
        library={library.library}
        status={library.status}
        onRetry={library.refetch}
        onPressMeal={openMeal}
        rowHint="Edits this meal"
        emptyAction={{ label: COPY.addMeal, onPress: addMeal }}
        justSaved={justSaved}
        onSearchChange={(text) => (search.current = text)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.inkMuted}
          />
        }
      />
    </Screen>
  );
}

/**
 * On focus, says what the form just did: "Meal saved" with the Just saved row, or "Meal deleted"
 * (R42.9, R44.3, DD55). The hand-off is applied once, so a second focus repeats neither (DD51).
 * Leaving the screen ends the Just saved row.
 */
function useLastSaved() {
  const toast = useToast();
  const [justSaved, setJustSaved] = useState<{ id: number; mealId: string } | null>(null);
  const applied = useRef<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      const saved = lastSaved.read();
      if (saved !== null && saved.id !== applied.current) {
        applied.current = saved.id;
        lastSaved.clear();
        if (saved.value.kind === 'saved') {
          setJustSaved({ id: saved.id, mealId: saved.value.mealId });
          toast.show({ message: COPY.saved });
        } else {
          toast.show({ message: COPY.deleted });
        }
      }
      return () => setJustSaved(null);
    }, [toast]),
  );

  return justSaved;
}

/**
 * Pull to refresh reloads the library (R40.11). The spinner follows the member's own pull only, so
 * background refetches from live updates don't move the list. Offline, the fetch waits for the
 * connection, so the spinner goes away and the banner explains (R13.1). As on Groceries and Meals.
 */
function usePullToRefresh(refetch: () => Promise<void>) {
  const isOnline = useIsOnline();
  const [pulling, setPulling] = useState(false);

  const onRefresh = async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  };

  return { refreshing: pulling && isOnline, onRefresh };
}

/** A failed reload keeps the loaded meals on screen, and says so with a Retry (R40.10). */
function useRefreshFailedToast({ refreshFailedAt, refetch }: LibraryView) {
  const toast = useToast();
  const showToast = useEffectEvent(() =>
    toast.show({
      message: COPY.loadError,
      action: { label: 'Retry', onPress: () => void refetch() },
    }),
  );

  useEffect(() => {
    if (refreshFailedAt !== null) showToast();
  }, [refreshFailedAt]);
}
