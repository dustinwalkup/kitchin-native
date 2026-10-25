import { useFocusEffect, useRouter } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  RefreshControl,
  StyleSheet,
} from 'react-native';

import { useHouseholdToday } from '@/features/household/use-household-today';
import { useWeekStart } from '@/features/household/use-week-start';
import { mealPick } from '@/features/meal-library/handoff';
import { DayCard } from '@/features/meals/components/day-card';
import { SkeletonWeek } from '@/features/meals/components/skeleton-week';
import { SlotEditor } from '@/features/meals/components/slot-editor';
import { slotName } from '@/features/meals/components/slot-row';
import { WeekHeader } from '@/features/meals/components/week-header';
import { LoadError, WaitingForConnection } from '@/features/meals/components/week-states';
import { COPY } from '@/features/meals/constants';
import type { Slot } from '@/features/meals/domain';
import { type MealWeek, useMealWeek, useSetMeal } from '@/features/meals/hooks';
import { addDays, formatDay, type IsoDate, reanchorWeek, weekStartOf } from '@/lib/calendar';
import { useIsOnline } from '@/lib/query-client';
import { ToastProvider, useToast } from '@/lib/toast';
import { FormScrollView } from '@/ui/form-scroll-view';
import { Screen } from '@/ui/screen';
import { useTheme } from '@/ui/use-theme';

/**
 * The household's meals, a week at a time (§3.4). Meals is typed into, so its toasts show at the
 * top, where the keyboard can't cover them (DD35).
 */
export default function Meals() {
  return (
    <ToastProvider placement="top">
      <MealsWeek />
    </ToastProvider>
  );
}

/** The slot whose editor is open. */
type SlotKey = Pick<Slot, 'date' | 'mealType'>;

const sameSlot = (a: SlotKey | null, b: SlotKey) =>
  a !== null && a.date === b.date && a.mealType === b.mealType;

function MealsWeek() {
  const theme = useTheme();
  const router = useRouter();
  const today = useHouseholdToday();
  const liveStart = useWeekStart();
  // The start day the week is laid out from. It follows the household's once no slot is open, so a
  // change from the other phone never closes the editor (R48.8, DD66).
  const [start, setStart] = useState(liveStart);
  // Tab screens stay mounted, so the week lasts while the app runs (R31.6), and a restart begins
  // at the current week (R31.1). A new day moves the Today pill but never the week (R34.3).
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today, liveStart));
  const [editing, setEditing] = useState<SlotKey | null>(null);
  const week = useMealWeek(weekStart);
  const setMeal = useSetMeal(start);
  const { refreshing, onRefresh } = usePullToRefresh(week.refetch);
  useRefreshFailedToast(week);

  const scrollRef = useRef<ComponentRef<typeof FormScrollView>>(null);
  // Set on first show and by This week. Today's card scrolls into view once it's laid out, and
  // only then, so later layout changes such as new week data never move the list (R35.6).
  const scrollToToday = useRef(true);
  const onTodayLayout = useCallback((event: LayoutChangeEvent) => {
    if (!scrollToToday.current) return;
    scrollToToday.current = false;
    // Unanimated, so it respects Reduce Motion (N14).
    scrollRef.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false });
  }, []);

  // The slot the picker was opened for, and the last pick applied (meal-library §3.11, DD51).
  const returning = useRef<SlotKey | null>(null);
  const appliedPick = useRef<number | null>(null);
  // The focus effect reads the loaded week without depending on it: re-running the effect would
  // close the editor on every update.
  const days = useRef(week.days);
  useEffect(() => {
    days.current = week.days;
  });
  // The meal just chosen for a slot, which its reopened editor starts from. The week shows the
  // save only after `useSetMeal`'s optimistic update, which can land after the editor has opened.
  const [chosen, setChosen] = useState<{ slot: SlotKey; text: string } | null>(null);

  // Leaving the tab, or opening a screen over Meals, closes the editor, which saves it (R32.3).
  // Back from the picker, Meals saves the meal chosen there and reopens the slot's editor, which
  // starts from the chosen text. Closing the picker without choosing only reopens it (DD52).
  useFocusEffect(
    useCallback(() => {
      const slot = returning.current;
      if (slot !== null) {
        returning.current = null;
        const pick = mealPick.read();
        if (pick !== null && pick.id !== appliedPick.current && sameSlot(slot, pick.value)) {
          appliedPick.current = pick.id;
          mealPick.clear();
          const { text } = pick.value;
          const shown = days.current
            .find((day) => day.date === slot.date)
            ?.slots.find((s) => s.mealType === slot.mealType)?.entry?.body;
          if (text !== shown) {
            setMeal({ date: slot.date, mealType: slot.mealType, body: text }); // R45.3, R45.5
            setChosen({ slot, text });
            // "Thursday dinner: Tacos": the meal's name, the copied text's first line (R45.3).
            const name = slotName(formatDay(slot.date).weekday, slot.mealType);
            AccessibilityInfo.announceForAccessibility(`${name}: ${text.split('\n')[0]}`);
          }
        }
        setEditing(slot); // R45.3, R45.7
      }
      return () => {
        setEditing(null);
        setChosen(null);
      };
    }, [setMeal]),
  );

  // Only the slot's date and meal type travel in the route (DD51). A pick left from an earlier
  // visit is dropped, so only one made in this visit can fill the slot (R45.7).
  const chooseFromLibrary = useCallback(
    (slot: SlotKey) => {
      returning.current = slot;
      mealPick.clear();
      router.push({
        pathname: '/meal-picker',
        params: { date: slot.date, mealType: slot.mealType },
      });
    },
    [router],
  );

  // Changing week closes the editor too, which saves it (R32.3).
  const showWeek = (first: IsoDate, scroll: boolean) => {
    scrollToToday.current = scroll;
    setEditing(null);
    setWeekStart(first);
  };

  // A new start day shows the new current week, scrolled to today, or else the new week sharing the
  // most dates with this one (R48.7). It waits while a slot is open, or the picker is open for one.
  const followStart = useEffectEvent(() => {
    if (returning.current !== null) return;
    const next = reanchorWeek({ weekStart, today, from: start, to: liveStart });
    setStart(liveStart);
    showWeek(next, next === weekStartOf(today, liveStart));
  });
  useEffect(() => {
    if (liveStart !== start && editing === null) followStart();
  }, [liveStart, start, editing]);

  // Stable, so the memoised day cards redraw only when their own day or open slot changes (N21).
  // A tapped slot starts from its entry, never from a meal chosen earlier.
  const onEdit = useCallback((slot: Slot) => {
    setChosen(null);
    setEditing({ date: slot.date, mealType: slot.mealType });
  }, []);
  const onClear = useCallback(
    (slot: Slot) => setMeal({ date: slot.date, mealType: slot.mealType, body: null }),
    [setMeal],
  );
  const renderEditor = useCallback(
    (slot: Slot, name: string) => (
      <SlotEditor
        slot={slot}
        name={name}
        setMeal={setMeal}
        // Return also blurs, so this can run twice: it closes this slot only, never a newer one.
        onClose={() => setEditing((open) => (sameSlot(open, slot) ? null : open))}
        onChooseFromLibrary={() => chooseFromLibrary({ date: slot.date, mealType: slot.mealType })}
        initialText={chosen !== null && sameSlot(chosen.slot, slot) ? chosen.text : undefined}
      />
    ),
    // `chosen` changes only around a pick, so the day cards stay put as slots open and close.
    [setMeal, chooseFromLibrary, chosen],
  );

  return (
    <Screen edges={['left', 'right']}>
      <WeekHeader
        weekStart={weekStart}
        start={start}
        today={today}
        onPrevious={() => showWeek(addDays(weekStart, -7), false)}
        onNext={() => showWeek(addDays(weekStart, 7), false)}
        onThisWeek={() => showWeek(weekStartOf(today, start), true)}
      />
      {/* Not virtualised: seven cards stay cheap with 21 long meals, and each can be measured (N22). */}
      <FormScrollView
        ref={scrollRef}
        testID="meals-week"
        contentContainerStyle={week.status === 'ready' ? styles.days : styles.fill}
        // The first tap on another slot opens it, rather than only closing the keyboard (DD25).
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.inkMuted}
          />
        }
      >
        {week.status === 'ready' ? (
          // Seven days even when nothing is planned: the empty slots invite planning (R30.8).
          week.days.map((day) => (
            <DayCard
              // A new week mounts new cards, so today's card lays out, and scrolls, again (R31.3).
              key={day.date}
              day={day}
              isToday={day.date === today}
              editing={editing?.date === day.date ? editing.mealType : null}
              renderEditor={renderEditor}
              onEdit={onEdit}
              onClear={onClear}
              onLayout={day.date === today ? onTodayLayout : undefined}
            />
          ))
        ) : (
          <WeekState status={week.status} onRetry={week.refetch} />
        )}
      </FormScrollView>
    </Screen>
  );
}

/** What shows in place of the days until the week has loaded (§3.4). */
function WeekState({
  status,
  onRetry,
}: {
  status: Exclude<MealWeek['status'], 'ready'>;
  onRetry: () => void;
}) {
  switch (status) {
    case 'loading':
      return <SkeletonWeek />; // R30.9
    case 'waiting':
      return <WaitingForConnection />; // R13.1; the Screen shows the offline banner
    case 'error':
      return <LoadError onRetry={onRetry} />; // R30.10
  }
}

/**
 * Pull to refresh reloads the week (R30.11). The spinner follows the member's own pull only, so
 * background refetches from live updates don't move the list. Offline, the fetch waits for the
 * connection, so the spinner goes away and the banner explains (R13.1). As on Groceries.
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

/** A failed reload keeps the loaded week on screen, and says so with a Retry (R30.10). */
function useRefreshFailedToast({ refreshFailedAt, refetch }: MealWeek) {
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
  days: { gap: 12, paddingVertical: 16 },
  fill: { flexGrow: 1 },
});
