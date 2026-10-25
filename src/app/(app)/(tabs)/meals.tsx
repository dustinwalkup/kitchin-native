import { useRouter } from 'expo-router';
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { useHouseholdToday } from '@/features/household/use-household-today';
import { useWeekStart } from '@/features/household/use-week-start';
import { useLibrary, useMealImageUrls } from '@/features/meal-library/hooks';
import { DayCard } from '@/features/meals/components/day-card';
import { SkeletonWeek } from '@/features/meals/components/skeleton-week';
import type { SlotPhoto } from '@/features/meals/components/slot-row';
import { WeekHeader } from '@/features/meals/components/week-header';
import { LoadError, WaitingForConnection } from '@/features/meals/components/week-states';
import { COPY } from '@/features/meals/constants';
import type { MealEntry, Slot } from '@/features/meals/domain';
import { type MealWeek, useMealWeek, useSetMeal } from '@/features/meals/hooks';
import { addDays, type IsoDate, reanchorWeek, weekStartOf } from '@/lib/calendar';
import { useIsOnline } from '@/lib/query-client';
import { ToastProvider, useToast } from '@/lib/toast';
import { Screen } from '@/ui/screen';
import { useTheme } from '@/ui/use-theme';

/**
 * The household's meals, a week at a time (§3.4, specs/redesign/design.md §5.1): seven compact
 * days that answer "what are we eating today, and what's for dinner this week?" Its toasts show at
 * the top, clear of the tab bar (DD35).
 */
export default function Meals() {
  return (
    <ToastProvider placement="top">
      <MealsWeek />
    </ToastProvider>
  );
}

function MealsWeek() {
  const theme = useTheme();
  const router = useRouter();
  const today = useHouseholdToday();
  const liveStart = useWeekStart();
  // The start day the week is laid out from, which follows the household's (R48.7, DD66).
  const [start, setStart] = useState(liveStart);
  // Tab screens stay mounted, so the week lasts while the app runs (R31.6), and a restart begins
  // at the current week (R31.1). A new day moves the Today pill but never the week (R34.3).
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today, liveStart));
  const week = useMealWeek(weekStart);
  const setMeal = useSetMeal(start);
  const photoFor = usePlannedPhotos(week.days);
  const { refreshing, onRefresh } = usePullToRefresh(week.refetch);
  useRefreshFailedToast(week);

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // Set on first show and by This week. Today's card scrolls into view once it's laid out, and
  // only then, so later layout changes such as new week data never move the list (R35.6).
  const [scrollToToday, setScrollToToday] = useState(true);
  const onTodayLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!scrollToToday) return;
      setScrollToToday(false);
      // Unanimated, so it respects Reduce Motion (N14). A little above, so the heading shows.
      scrollRef.current?.scrollTo({
        y: Math.max(0, event.nativeEvent.layout.y - 8),
        animated: false,
      });
    },
    [scrollToToday],
  );

  const showWeek = (first: IsoDate, scroll: boolean) => {
    setScrollToToday(scroll);
    setWeekStart(first);
  };

  // A new start day shows the new current week, scrolled to today, or else the new week sharing the
  // most dates with this one (R48.7). Adjusted while rendering, so the old layout never shows.
  if (liveStart !== start) {
    const next = reanchorWeek({ weekStart, today, from: start, to: liveStart });
    setStart(liveStart);
    showWeek(next, next === weekStartOf(today, liveStart));
  }

  // Stable, so the memoised day cards redraw only when their own day changes (N21). Only the slot's
  // date and meal type travel in the route (DD51).
  const onEdit = useCallback(
    (slot: Slot) =>
      router.push({
        pathname: '/meal-picker',
        params: { date: slot.date, mealType: slot.mealType },
      }),
    [router],
  );
  const onClear = useCallback(
    (slot: Slot) => setMeal({ date: slot.date, mealType: slot.mealType, body: null }),
    [setMeal],
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
      {/* Not virtualised: seven days stay cheap with 21 long meals, and each can be measured (N22). */}
      <ScrollView
        ref={scrollRef}
        testID="meals-week"
        contentContainerStyle={week.status === 'ready' ? styles.days : styles.fill}
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
              onEdit={onEdit}
              onClear={onClear}
              photoFor={photoFor}
              onLayout={day.date === today ? onTodayLayout : undefined}
            />
          ))
        ) : (
          <WeekState status={week.status} onRetry={week.refetch} />
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * The photo for each planned meal chosen from the library, from the cached library and one batch of
 * signed URLs (DD-R10). A meal without a photo, or deleted since, gets none, and the row shows no
 * thumbnail. A photo still loading shows its placeholder.
 */
function usePlannedPhotos(days: MealWeek['days']): (entry: MealEntry) => SlotPhoto | undefined {
  const { library } = useLibrary();
  const imageOf = useMemo(
    () => new Map(library.meals.map((meal) => [meal.id, meal.imagePath])),
    [library.meals],
  );
  const paths = useMemo(
    () =>
      days.flatMap((day) =>
        day.slots.flatMap(({ entry }) => {
          const path = entry?.libraryMealId ? imageOf.get(entry.libraryMealId) : null;
          return path ? [path] : [];
        }),
      ),
    [days, imageOf],
  );
  const urls = useMealImageUrls(paths);

  return useCallback(
    (entry: MealEntry) => {
      const path = entry.libraryMealId ? imageOf.get(entry.libraryMealId) : null;
      return path ? { uri: urls[path], cacheKey: path } : undefined;
    },
    [imageOf, urls],
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
  days: { gap: 12, paddingTop: 4, paddingBottom: 24 },
  fill: { flexGrow: 1 },
});
