import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HeaderAction } from '@/features/meal-library/components/header-action';
import { MealBrowser } from '@/features/meal-library/components/meal-browser';
import { COPY } from '@/features/meal-library/constants';
import { copiedText, type Meal } from '@/features/meal-library/domain';
import { lastSaved, mealPick, newMealName } from '@/features/meal-library/handoff';
import { type LibraryView, useLibrary } from '@/features/meal-library/hooks';
import { slotName } from '@/features/meals/components/slot-row';
import { MEAL_TYPES, type MealType } from '@/features/meals/constants';
import { formatDay, type IsoDate, parseIsoDate } from '@/lib/calendar';
import { reportOnce } from '@/lib/reporting';
import { ToastProvider, useToast } from '@/lib/toast';
import { Button } from '@/ui/button';
import { KeyboardToolbar } from '@/ui/keyboard-toolbar';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/**
 * Choosing a meal for a slot (§3.10). A page sheet over Meals, so a swipe down cancels, as Cancel
 * does (R45.7). It has a search field, so its toasts show at the top, where the keyboard can't
 * cover them (DD60). The sheet covers the root's keyboard toolbar, so it mounts its own, last so it
 * paints on top.
 */
export default function MealPicker() {
  const { date, mealType } = useLocalSearchParams<{ date?: string; mealType?: string }>();
  const slot = parseSlot(date, mealType);

  return (
    <>
      <ToastProvider placement="top">
        {slot === null ? <BadParams /> : <PickerScreen date={slot.date} mealType={slot.mealType} />}
      </ToastProvider>
      <KeyboardToolbar />
    </>
  );
}

/** The slot from the route's params: a real date and a known meal type, or null. */
function parseSlot(
  date: string | undefined,
  mealType: string | undefined,
): { date: IsoDate; mealType: MealType } | null {
  const day = typeof date === 'string' ? parseIsoDate(date) : null;
  const type = MEAL_TYPES.find((t) => t.key === mealType)?.key;
  return day === null || type === undefined ? null : { date: day, mealType: type };
}

/** Meals always sends a real slot, so this is a bug or a hand-made link: close, and say so (§6). */
function BadParams() {
  const router = useRouter();
  // Once, even when development mode runs the effect twice.
  const closed = useRef(false);

  useEffect(() => {
    if (closed.current) return;
    closed.current = true;
    reportOnce('picker_bad_params');
    router.back();
  }, [router]);

  return null;
}

function PickerScreen({ date, mealType }: { date: IsoDate; mealType: MealType }) {
  const router = useRouter();
  const library = useLibrary();
  useRefreshFailedToast(library);
  const justSaved = useLastSaved();
  // The browser holds the search. This follows it, for "+ Add new meal" to start from (R42.6).
  const search = useRef('');

  // The form presents over the picker, and both Save and Cancel return here (R45.8, R45.9).
  const addNewMeal = () => {
    if (search.current === '') newMealName.clear();
    else newMealName.set(search.current);
    router.push('/meal-form');
  };

  // Meals applies the pick when it regains focus (§3.11). Stable, so the memoised rows don't
  // redraw as the member types (N25).
  const choose = useCallback(
    (meal: Meal) => {
      mealPick.set({ date, mealType, text: copiedText(meal) }); // R45.3, R45.4
      router.back();
    },
    [date, mealType, router],
  );

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <HeaderAction
              testID="picker-cancel"
              label="Cancel"
              plain
              onPress={() => router.back()}
            />
          ),
        }}
      />
      {/* Outside the browser, so it names the slot in every state, the empty library too (R45.2). */}
      <View style={styles.slot}>
        <Text variant="headline">For {slotName(formatDay(date).weekday, mealType)}</Text>
      </View>
      {/* No pull to refresh, and rows only choose: no edit or delete (R45.10). */}
      <MealBrowser
        library={library.library}
        status={library.status}
        onRetry={library.refetch}
        onPressMeal={choose}
        rowHint="Chooses this meal"
        emptyAction={{ label: COPY.addNewMeal, onPress: addNewMeal }}
        justSaved={justSaved}
        onSearchChange={(text) => (search.current = text)}
        header={
          <Button label={COPY.addNewMeal} variant="secondary" tone="accent" onPress={addNewMeal} />
        }
      />
    </Screen>
  );
}

/**
 * On focus after "+ Add new meal" saved, shows "Meal saved" and, if the search or tags hide the
 * meal, the Just saved row, so it can be chosen straight away (R45.9, DD55). The form opens from
 * here only to add, so there's no delete to report. The hand-off is applied once, so a second
 * focus doesn't repeat it (DD51). Leaving the picker ends the Just saved row.
 */
function useLastSaved() {
  const toast = useToast();
  const [justSaved, setJustSaved] = useState<{ id: number; mealId: string } | null>(null);
  const applied = useRef<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      const saved = lastSaved.read();
      if (saved !== null && saved.id !== applied.current && saved.value.kind === 'saved') {
        applied.current = saved.id;
        lastSaved.clear();
        setJustSaved({ id: saved.id, mealId: saved.value.mealId });
        toast.show({ message: COPY.saved });
      }
      return () => setJustSaved(null);
    }, [toast]),
  );

  return justSaved;
}

/** A failed reload keeps the loaded meals on screen, and says so with a Retry (R40.10, R45.12). */
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
  slot: { paddingHorizontal: 16, paddingTop: 16 },
});
