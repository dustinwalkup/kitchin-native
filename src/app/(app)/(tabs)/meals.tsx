import { useFocusEffect } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { type LayoutChangeEvent, RefreshControl, StyleSheet } from 'react-native';

import { useHouseholdToday } from '@/features/household/use-household-today';
import { DayCard } from '@/features/meals/components/day-card';
import { SkeletonWeek } from '@/features/meals/components/skeleton-week';
import { SlotEditor } from '@/features/meals/components/slot-editor';
import { WeekHeader } from '@/features/meals/components/week-header';
import { LoadError, WaitingForConnection } from '@/features/meals/components/week-states';
import { COPY } from '@/features/meals/constants';
import type { Slot } from '@/features/meals/domain';
import { type MealWeek, useMealWeek, useSetMeal } from '@/features/meals/hooks';
import { addDays, type IsoDate, weekStartOf } from '@/lib/calendar';
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
  const today = useHouseholdToday();
  // Tab screens stay mounted, so the week lasts while the app runs (R31.6), and a restart begins
  // at the current week (R31.1). A new day moves the Today pill but never the week (R34.3).
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today));
  const [editing, setEditing] = useState<SlotKey | null>(null);
  const week = useMealWeek(weekStart);
  const setMeal = useSetMeal();
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

  // Leaving the tab closes the editor, which saves it (R32.3).
  useFocusEffect(useCallback(() => () => setEditing(null), []));

  // Changing week closes the editor too, which saves it (R32.3).
  const showWeek = (start: IsoDate, scroll: boolean) => {
    scrollToToday.current = scroll;
    setEditing(null);
    setWeekStart(start);
  };

  // Stable, so the memoised day cards redraw only when their own day or open slot changes (N21).
  const onEdit = useCallback(
    (slot: Slot) => setEditing({ date: slot.date, mealType: slot.mealType }),
    [],
  );
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
      />
    ),
    [setMeal],
  );

  return (
    <Screen edges={['left', 'right']}>
      <WeekHeader
        weekStart={weekStart}
        today={today}
        onPrevious={() => showWeek(addDays(weekStart, -7), false)}
        onNext={() => showWeek(addDays(weekStart, 7), false)}
        onThisWeek={() => showWeek(weekStartOf(today), true)}
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
