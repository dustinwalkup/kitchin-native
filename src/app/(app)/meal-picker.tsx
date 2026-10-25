import { useFocusEffect, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, StyleSheet, View } from 'react-native';

import { useWeekStart } from '@/features/household/use-week-start';
import { MealBrowser } from '@/features/meal-library/components/meal-browser';
import { MealImage } from '@/features/meal-library/components/meal-image';
import { COPY } from '@/features/meal-library/constants';
import { copiedText, type Meal, recentMeals } from '@/features/meal-library/domain';
import { lastSaved, newMealName, newMealType } from '@/features/meal-library/handoff';
import { type LibraryView, useLibrary, useMealImageUrls } from '@/features/meal-library/hooks';
import { MealTypeIcon } from '@/features/meals/components/meal-type-icon';
import { slotName, splitBody } from '@/features/meals/components/slot-row';
import { MEAL_TYPES, type MealType } from '@/features/meals/constants';
import {
  charactersLeft,
  clampEntry,
  type MealEntry,
  slotChange,
  trimEntry,
} from '@/features/meals/domain';
import {
  type SetMealVariables,
  useMealWeek,
  useRecentLibraryMealIds,
  useSetMeal,
} from '@/features/meals/hooks';
import {
  formatDay,
  formatDayShort,
  type IsoDate,
  parseIsoDate,
  type Weekday,
  weekStartOf,
} from '@/lib/calendar';
import { reportOnce } from '@/lib/reporting';
import { ToastProvider, useToast } from '@/lib/toast';
import { Button } from '@/ui/button';
import { FormScrollView } from '@/ui/form-scroll-view';
import { KeyboardToolbar } from '@/ui/keyboard-toolbar';
import { Screen } from '@/ui/screen';
import { SegmentedControl } from '@/ui/segmented-control';
import { SheetHeader } from '@/ui/sheet-header';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme } from '@/ui/use-theme';

/**
 * Planning one slot (specs/redesign/design.md §5.4, superseding the inline editor of §3.5 and the
 * picker of meal-library §3.10): choose a saved meal, or type one in, for "Sun, Oct 25 · Dinner".
 * A page sheet over Meals, so a swipe down cancels, as Cancel does (R45.7). It has a search field,
 * so its toasts show at the top, where the keyboard can't cover them (DD60). The sheet covers the
 * root's keyboard toolbar, so it mounts its own, last so it paints on top.
 */
export default function MealPicker() {
  const { date, mealType } = useLocalSearchParams<{ date?: string; mealType?: string }>();
  const slot = parseSlot(date, mealType);
  const start = useWeekStart();
  // Outside the sheet's own toasts, so a save that fails after the sheet has closed still says so,
  // with Retry, on Meals (R35.5).
  const setMeal = useSetMeal(start);

  return (
    <>
      <ToastProvider placement="top">
        {slot === null ? (
          <BadParams />
        ) : (
          <PlanSheet date={slot.date} mealType={slot.mealType} start={start} setMeal={setMeal} />
        )}
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

type Mode = 'library' | 'write';

const MODES = [
  { key: 'library', label: 'Choose from library' },
  { key: 'write', label: 'Enter manually' },
] as const;

/**
 * The slot's entry as the sheet opened, once the week has loaded. Fixed from then on, as the inline
 * editor's base was (DD27): the other phone's save doesn't rewrite what the member is looking at.
 */
function useOpenedEntry(date: IsoDate, mealType: MealType, start: Weekday) {
  const week = useMealWeek(weekStartOf(date, start));
  const now =
    week.status === 'ready'
      ? (week.days.find((day) => day.date === date)?.slots.find((s) => s.mealType === mealType)
          ?.entry ?? null)
      : undefined;
  const [opened, setOpened] = useState<MealEntry | null | undefined>(now);
  if (opened === undefined && now !== undefined) setOpened(now);
  return opened;
}

interface PlanSheetProps {
  date: IsoDate;
  mealType: MealType;
  start: Weekday;
  /** `useSetMeal`'s function, from outside the sheet's toasts. */
  setMeal: (v: SetMealVariables) => void;
}

function PlanSheet({ date, mealType, start, setMeal }: PlanSheetProps) {
  const router = useRouter();
  const base = useOpenedEntry(date, mealType, start);
  const library = useLibrary();
  const recentIds = useRecentLibraryMealIds();
  const recent = useMemo(
    () => recentMeals(library.library.meals, recentIds),
    [library.library.meals, recentIds],
  );
  useRefreshFailedToast(library);
  // Whether the meal form was opened to create a meal for this slot, rather than to edit one.
  const creating = useRef(false);
  const justSaved = useLastSaved(library, creating, (meal) => choose(meal));

  const { label } = MEAL_TYPES.find((t) => t.key === mealType)!;
  const short = formatDayShort(date);
  const name = slotName(formatDay(date).weekday, mealType);
  const linked =
    base?.libraryMealId != null
      ? library.library.meals.find((meal) => meal.id === base.libraryMealId)
      : undefined;

  // A slot with typed text opens on Enter manually, with the text; any other on the library, unless
  // the library has loaded empty (design §5.4).
  const [mode, setMode] = useState<Mode | null>(null);
  const shownMode: Mode =
    mode ??
    (base && base.libraryMealId === null
      ? 'write'
      : library.status === 'ready' && library.library.meals.length === 0
        ? 'write'
        : 'library');
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? base?.body ?? '';
  const dirty = draft !== null && trimEntry(draft) !== trimEntry(base?.body ?? '');
  // The browser holds the search. This follows it, for New meal to start from (R42.6).
  const search = useRef('');
  // 'done' once the sheet has saved, cleared or chosen, which then goes back; 'discard' once the
  // member discards, whose own close is already under way. Either way closing doesn't ask again.
  const [leaving, setLeaving] = useState<'discard' | 'done' | null>(null);

  // Typed text that hasn't been saved asks before the sheet closes (as the meal form, R42.12).
  usePreventRemove(dirty && leaving === null, ({ repeat }) =>
    Alert.alert('Discard this meal?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setLeaving('discard');
          repeat();
        },
      },
    ]),
  );

  // Back in the effect after `leaving` is set, once the discard prompt is off. Not after Discard,
  // whose repeat already closes the sheet: a second back would leave Meals too.
  useEffect(() => {
    if (leaving === 'done') router.back();
  }, [leaving, router]);

  function announce(body: string) {
    // "Thursday dinner: Tacos": the slot, then the meal's name (R45.3).
    AccessibilityInfo.announceForAccessibility(`${name}: ${body.split('\n')[0]}`);
  }

  // Choosing a meal copies its text into the slot and remembers which meal it was (R45.3, R45.4,
  // DD-R10). The library meal itself never changes (K19).
  function choose(meal: Meal) {
    const body = copiedText(meal);
    if (base?.body !== body || base.libraryMealId !== meal.id) {
      setMeal({ date, mealType, body, libraryMealId: meal.id });
    }
    announce(body);
    setLeaving('done');
  }

  // Typed text is the slot's own: it saves with no link, and an unchanged draft sends nothing, so it
  // never writes over the other member's newer save (R32.3, R32.7, DD27).
  function saveText() {
    const change = slotChange(base?.body ?? '', text);
    if (change.kind === 'save') {
      setMeal({ date, mealType, body: change.body, libraryMealId: null });
      announce(change.body);
    } else if (change.kind === 'clear') {
      setMeal({ date, mealType, body: null });
    }
    setLeaving('done');
  }

  // R33.2
  function remove() {
    setMeal({ date, mealType, body: null });
    AccessibilityInfo.announceForAccessibility(`${name} cleared`);
    setLeaving('done');
  }

  // The form presents over the sheet; a meal saved there is chosen for this slot (design §5.4).
  const addNewMeal = () => {
    if (search.current === '') newMealName.clear();
    else newMealName.set(search.current);
    newMealType.set(mealType);
    creating.current = true;
    router.push('/meal-form');
  };

  // Editing the library meal is its own, explicit step: it changes the meal everywhere it's chosen
  // from next time, but never this plan's text (K19).
  const editLinked = () => {
    if (linked === undefined) return;
    creating.current = false;
    router.push({ pathname: '/meal-form', params: { id: linked.id } });
  };

  const top = (
    <View style={styles.top}>
      {base ? (
        <Current
          entry={base}
          meal={linked}
          mealType={mealType}
          onRemove={remove}
          onEditMeal={linked ? editLinked : undefined}
        />
      ) : null}
      <SegmentedControl
        testID="plan-mode"
        segments={MODES}
        selected={shownMode}
        onSelect={setMode}
      />
    </View>
  );

  const left = charactersLeft(text);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <SheetHeader
        title={`${short.weekday}, ${short.date} · ${label}`}
        left={{ label: 'Cancel', onPress: () => router.back(), testID: 'picker-cancel' }}
        right={
          shownMode === 'write'
            ? { label: 'Save', onPress: saveText, disabled: !dirty, testID: 'plan-save' }
            : undefined
        }
      />
      {shownMode === 'library' ? (
        // No pull to refresh, and rows only choose: no edit or delete (R45.10).
        <MealBrowser
          library={library.library}
          status={library.status}
          onRetry={library.refetch}
          onPressMeal={choose}
          rowHint="Chooses this meal"
          emptyAction={{ label: 'New meal', onPress: addNewMeal }}
          justSaved={justSaved}
          onSearchChange={(value) => (search.current = value)}
          recent={recent}
          // The slot's plan and the mode switch stay even when the library is empty, so the member
          // can always switch to Enter manually or remove the plan.
          persistentHeader={top}
          header={
            <>
              <View style={styles.newMeal}>
                <Button
                  testID="picker-new-meal"
                  label="Create a new meal"
                  variant="secondary"
                  size="small"
                  icon={<Text color="accentInk">＋</Text>}
                  onPress={addNewMeal}
                />
              </View>
            </>
          }
        />
      ) : (
        <FormScrollView contentContainerStyle={styles.write} keyboardShouldPersistTaps="handled">
          {top}
          <View style={styles.writeField}>
            <TextField
              testID="slot-editor"
              label={label}
              value={text}
              onChangeText={(next) => setDraft(clampEntry(next))}
              placeholder={`What's for ${label.toLowerCase()}?`}
              autoFocus={mode === 'write' || base?.libraryMealId === null}
              multiline
              scrollEnabled={false}
              hint={
                <Text variant="footnote" color="inkMuted" bold={left === 0}>
                  {left === null
                    ? "Typed meals stay in this plan; they aren't added to the library."
                    : left === 0
                      ? 'No characters left'
                      : `${left} ${left === 1 ? 'character' : 'characters'} left`}
                </Text>
              }
            />
          </View>
        </FormScrollView>
      )}
    </Screen>
  );
}

/**
 * What the slot holds now, with Remove and, for a meal chosen from the library, Edit library meal
 * (design §5.4). The planned text is the slot's own copy; the photo comes from the meal it was
 * chosen from, if that still exists.
 */
function Current({
  entry,
  meal,
  mealType,
  onRemove,
  onEditMeal,
}: {
  entry: MealEntry;
  meal: Meal | undefined;
  mealType: MealType;
  onRemove: () => void;
  onEditMeal?: () => void;
}) {
  const theme = useTheme();
  const { title, detail } = splitBody(entry.body);
  const path = meal?.imagePath ?? null;
  const uri = useMealImageUrls([path])[path ?? ''];

  return (
    <View
      testID="plan-current"
      style={[
        styles.current,
        { backgroundColor: theme.background, borderRadius: theme.radius.card },
      ]}
    >
      <View style={styles.currentRow}>
        {meal ? (
          <MealImage
            path={path}
            uri={uri}
            mealType={meal.mealType}
            width={48}
            height={48}
            radius={10}
          />
        ) : (
          <View style={[styles.currentIcon, { backgroundColor: theme.sunken }]}>
            <MealTypeIcon mealType={mealType} />
          </View>
        )}
        <View style={styles.currentText}>
          <Text variant="eyebrow" color="inkMuted">
            Planned
          </Text>
          <Text variant="headline">{title}</Text>
          {detail ? (
            <Text variant="footnote" color="inkMuted">
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.currentActions}>
        {onEditMeal ? (
          <Button
            testID="plan-edit-meal"
            label="Edit library meal"
            variant="text"
            size="small"
            onPress={onEditMeal}
          />
        ) : null}
        <Button
          testID="slot-clear"
          label="Remove from plan"
          variant="text"
          size="small"
          destructive
          onPress={onRemove}
        />
      </View>
    </View>
  );
}

/**
 * On focus after the meal form: a meal created from this sheet is chosen for the slot at once; one
 * edited from it is just saved, with a toast. If the new meal isn't in the library yet, the Just
 * saved row offers it instead (R45.9, DD55). The hand-off is applied once, so a second focus doesn't
 * repeat it (DD51). Leaving the sheet ends the Just saved row.
 */
function useLastSaved(
  library: LibraryView,
  creating: { current: boolean },
  onCreated: (meal: Meal) => void,
) {
  const toast = useToast();
  const [value, setValue] = useState<{ id: number; mealId: string } | null>(null);
  const applied = useRef<number | null>(null);
  // The focus effect reads these without depending on them: re-running it would end the Just saved
  // row on every library update.
  const latest = useRef({ meals: library.library.meals, onCreated });
  useEffect(() => {
    latest.current = { meals: library.library.meals, onCreated };
  });

  useFocusEffect(
    useCallback(() => {
      const saved = lastSaved.read();
      if (saved !== null && saved.id !== applied.current) {
        applied.current = saved.id;
        lastSaved.clear();
        if (saved.value.kind === 'deleted') {
          toast.show({ message: COPY.deleted });
        } else {
          const meal = latest.current.meals.find((m) => m.id === saved.value.mealId);
          if (creating.current && meal) {
            latest.current.onCreated(meal);
          } else {
            setValue({ id: saved.id, mealId: saved.value.mealId });
            toast.show({ message: COPY.saved });
          }
        }
      }
      return () => setValue(null);
    }, [toast, creating]),
  );

  return value;
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
  top: { gap: 14, paddingHorizontal: 16, paddingTop: 8 },
  newMeal: { alignItems: 'flex-start', paddingHorizontal: 16 },
  write: { paddingBottom: 32 },
  writeField: { paddingHorizontal: 16, paddingTop: 18 },
  current: { padding: 14, gap: 8 },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  currentIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentText: { flex: 1, gap: 2 },
  currentActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
});
