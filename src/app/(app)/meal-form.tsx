import { randomUUID } from 'expo-crypto';
import { Stack, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';

import type { FormProblem } from '@/features/meal-library/components/form-error';
import { HeaderAction } from '@/features/meal-library/components/header-action';
import {
  LoadError,
  MissingMeal,
  WaitingForConnection,
} from '@/features/meal-library/components/library-states';
import { MealForm, type MealFormHandle } from '@/features/meal-library/components/meal-form';
import { COPY } from '@/features/meal-library/constants';
import {
  type CleanMeal,
  formValuesOf,
  isDirty,
  type Meal,
  planSave,
  type Tag,
} from '@/features/meal-library/domain';
import { lastSaved, newMealName } from '@/features/meal-library/handoff';
import {
  type LibraryView,
  useDeleteMeal,
  useLibrary,
  useSaveMeal,
} from '@/features/meal-library/hooks';
import { FormScrollView } from '@/ui/form-scroll-view';
import { KeyboardToolbar } from '@/ui/keyboard-toolbar';
import { Screen } from '@/ui/screen';
import { useTheme } from '@/ui/use-theme';

/**
 * Adding or editing a meal (§3.9). A full-screen modal, so Cancel is the only way out: there's no
 * swipe to dismiss (DD50, finding 3). Only the meal's ID travels in the route (DD51); the name for
 * a new meal comes from the `newMealName` hand-off.
 */
export default function MealFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const library = useLibrary();
  const opened = useOpened(id, library);

  if (opened.kind === 'form') {
    return <MealEditor base={opened.base} tags={library.library.tags} />;
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Edit meal',
          // The missing meal's Close is the only way on.
          headerLeft:
            opened.kind === 'missing'
              ? undefined
              : () => <CancelAction disabled={false} onPress={() => router.back()} />,
        }}
      />
      {opened.kind === 'missing' ? (
        <MissingMeal onClose={() => router.back()} />
      ) : (
        <LibraryPending status={opened.status} onRetry={library.refetch} />
      )}
    </Screen>
  );
}

type Opened =
  | { kind: 'form'; base: Meal | null }
  | { kind: 'missing' }
  | { kind: 'pending'; status: Exclude<LibraryView['status'], 'ready'> };

function toOpen(id: string | undefined, { library, status }: LibraryView): Opened {
  if (id === undefined) return { kind: 'form', base: null };
  const meal = library.meals.find((m) => m.id === id);
  if (meal !== undefined) return { kind: 'form', base: meal };
  return status === 'ready' ? { kind: 'missing' } : { kind: 'pending', status };
}

/**
 * What the form opens on: a new meal, the meal as it is now, or the missing-meal message. Once
 * known, it's fixed. A change from the other phone doesn't reach the open form (R42.13), and a
 * delete from it is found when the member saves, so nothing they've typed is lost (R46.7).
 */
function useOpened(id: string | undefined, view: LibraryView): Opened {
  const now = toOpen(id, view);
  const [opened, setOpened] = useState(now.kind === 'pending' ? null : now);
  // The library opens the form only once it has loaded, so this waits only on a cold start.
  if (opened === null && now.kind !== 'pending') setOpened(now);
  return opened ?? now;
}

/** An edit opened before the library has loaded (R40.8, R40.10, R13.1). */
function LibraryPending({
  status,
  onRetry,
}: {
  status: Exclude<LibraryView['status'], 'ready'>;
  onRetry: () => Promise<void>;
}) {
  const theme = useTheme();
  if (status === 'error') return <LoadError onRetry={() => void onRetry()} />;
  if (status === 'waiting') return <WaitingForConnection />;
  return (
    <ActivityIndicator
      accessibilityLabel="Loading meals"
      color={theme.inkMuted}
      style={styles.loading}
    />
  );
}

/**
 * The form itself. `base` is the meal as it was when the form opened, or null for a new meal: the
 * values start from it once, and an edit's save sends only what differs from it (R46.5).
 */
function MealEditor({ base, tags }: { base: Meal | null; tags: Tag[] }) {
  const router = useRouter();
  const saveMeal = useSaveMeal();
  const deleteMeal = useDeleteMeal();
  const form = useRef<MealFormHandle>(null);

  const [initial] = useState(() => formValuesOf(base, newMealName.read()?.value)); // R42.6, R42.7
  const [values, setValues] = useState(initial);
  // What Save writes. A new meal's ID is made now, so every Save from this form, Retry included,
  // repeats the same upsert (DD46, R46.4). Save as new meal replaces both (R46.7).
  const [target, setTarget] = useState(() => ({ base, mealId: base?.id ?? randomUUID() }));
  const [pending, setPending] = useState<'save' | 'delete' | null>(null);
  const [problem, setProblem] = useState<FormProblem | null>(null);
  // 'discard' once the member discards; 'done' after a save or delete, which then goes back.
  const [leaving, setLeaving] = useState<'discard' | 'done' | null>(null);

  // Cancel with changes asks first (R42.12). Discard repeats what was blocked.
  usePreventRemove(isDirty(initial, values) && leaving === null, ({ repeat }) =>
    Alert.alert(COPY.discardTitle, undefined, [
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

  // Back in the effect after `leaving` is set, once the discard prompt is off (§3.9).
  useEffect(() => {
    if (leaving === 'done') router.back();
  }, [leaving, router]);

  async function save(meal: CleanMeal, to = target) {
    // An unchanged edit closes without a write (R42.11).
    if (planSave(to.base, meal, to.mealId) === null) {
      setLeaving('done');
      return;
    }
    setProblem(null);
    setPending('save'); // R42.8
    const outcome = await saveMeal({ ...to, meal });
    if (outcome.ok) {
      lastSaved.set({ mealId: outcome.mealId, kind: 'saved' }); // R42.9
      setLeaving('done');
    } else {
      // Every value stays, for Retry or the member to fix (R42.10).
      setPending(null);
      setProblem({ kind: 'save', outcome });
    }
  }

  // The meal was deleted on the other phone: write every field and tag under a new ID (R46.7).
  function saveAsNew(meal: CleanMeal) {
    const to = { base: null, mealId: randomUUID() };
    setTarget(to);
    void save(meal, to);
  }

  async function remove() {
    setProblem(null);
    setPending('delete');
    const outcome = await deleteMeal(target.mealId);
    if (outcome.ok) {
      lastSaved.set({ mealId: target.mealId, kind: 'deleted' }); // R44.3
      setLeaving('done');
    } else {
      // Nothing was removed early, so the meal stays listed (R44.4).
      setPending(null);
      setProblem({ kind: 'delete', outcome });
    }
  }

  // R44.2. Delete meal shows only for a meal that exists.
  function confirmDelete() {
    if (target.base === null) return;
    Alert.alert(COPY.deleteTitle(target.base.name), COPY.deleteBody, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);
  }

  return (
    <>
      <Screen edges={['left', 'right', 'bottom']}>
        <Stack.Screen
          options={{
            title: base === null ? 'New meal' : 'Edit meal', // R42.1
            headerLeft: () => (
              <CancelAction disabled={pending !== null} onPress={() => router.back()} />
            ),
            headerRight: () => (
              <HeaderAction
                testID="meal-form-save"
                label="Save"
                busy={pending === 'save'}
                disabled={pending === 'delete'}
                onPress={() => form.current?.save()}
              />
            ),
          }}
        />
        <FormScrollView
          contentContainerStyle={styles.content}
          // Chips, New tag and Delete meal take the first tap while the keyboard is up.
          keyboardShouldPersistTaps="handled"
        >
          <MealForm
            ref={form}
            values={values}
            onChange={setValues}
            tags={tags}
            editing={target.base !== null}
            problem={problem}
            busy={pending !== null}
            onSave={(meal) => void save(meal)}
            onSaveAsNew={saveAsNew}
            onDelete={confirmDelete}
            onRetryDelete={() => void remove()}
          />
        </FormScrollView>
      </Screen>
      {/* The modal covers the root's toolbar, so it mounts its own, last so it paints on top. */}
      <KeyboardToolbar />
    </>
  );
}

function CancelAction({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <HeaderAction
      testID="meal-form-cancel"
      label="Cancel"
      plain
      disabled={disabled}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  loading: { flex: 1 },
});
