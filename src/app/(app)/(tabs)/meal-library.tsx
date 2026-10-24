import { useFocusEffect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import { ReconnectingPill } from '@/features/household/components/reconnecting-pill';
import { describeProblem } from '@/features/meal-library/components/form-error';
import { HeaderAction } from '@/features/meal-library/components/header-action';
import { MealBrowser } from '@/features/meal-library/components/meal-browser';
import { COPY } from '@/features/meal-library/constants';
import type { Meal } from '@/features/meal-library/domain';
import { lastSaved, newMealName } from '@/features/meal-library/handoff';
import { type LibraryView, useDeleteMeal, useLibrary } from '@/features/meal-library/hooks';
import { useIsOnline } from '@/lib/query-client';
import { ToastProvider, useToast } from '@/lib/toast';
import { Screen } from '@/ui/screen';
import { useTheme } from '@/ui/use-theme';

/**
 * The household's meals, to search, filter, open and delete (§3.8). Its own tab, so it keeps its
 * search and tags while the member visits the other tabs (R40.1, R41.9). It has a search field, so
 * its toasts show at the top, where the keyboard can't cover them (DD60).
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
  const confirmDelete = useDeleteFromList();
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
    <Screen edges={['left', 'right']}>
      <Tabs.Screen
        options={{
          // Beside Add meal, where it doesn't cover the list (R13.4).
          headerRight: () => (
            <View style={styles.headerRight}>
              <ReconnectingPill />
              <HeaderAction testID="library-add-meal" label={COPY.addMeal} onPress={addMeal} />
            </View>
          ),
        }}
      />
      <MealBrowser
        library={library.library}
        status={library.status}
        onRetry={library.refetch}
        onPressMeal={openMeal}
        rowHint="Edits this meal"
        onDeleteMeal={confirmDelete}
        rowDisclosure
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
 * Deleting from the list, by swiping a row or with VoiceOver's Delete action (R44.8). It asks first,
 * as the form does (R44.2). The meal stays listed until the backend confirms (K24), and a failure
 * says why with Retry, which deletes without asking again (R44.4).
 */
function useDeleteFromList() {
  const toast = useToast();
  const deleteMeal = useDeleteMeal();

  // Stable, so the memoised rows don't redraw as the member types (N25).
  return useCallback(
    (meal: Meal) => {
      async function remove() {
        const outcome = await deleteMeal(meal.id);
        if (outcome.ok) {
          toast.show({ message: COPY.deleted }); // R44.3
          return;
        }
        const { message, action } = describeProblem({ kind: 'delete', outcome });
        toast.show({
          message,
          action: action === 'retry' ? { label: 'Retry', onPress: () => void remove() } : undefined,
        });
      }

      Alert.alert(COPY.deleteTitle(meal.name), COPY.deleteBody, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void remove() },
      ]);
    },
    [deleteMeal, toast],
  );
}

/**
 * On focus, says what the form just did: "Meal saved" with the Just saved row, or "Meal deleted"
 * (R42.9, R44.3, DD55). The hand-off is applied once, so a second focus repeats neither (DD51).
 * Leaving the screen, for the form or another tab, ends the Just saved row.
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

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
