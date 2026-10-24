import { type ComponentRef, type Ref, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, type TextInput, View } from 'react-native';

import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

import { COPY, COUNTER_FROM, LIMITS } from '../constants';
import {
  charactersLeft,
  clampTo,
  type CleanMeal,
  type FormField,
  type FormValues,
  maxLengthFor,
  oneLine,
  type Tag,
  validateMeal,
} from '../domain';
import { describeProblem, FormError, type FormProblem } from './form-error';
import { TagPicker } from './tag-picker';

type TextFieldName = 'name' | 'description' | 'ingredients';

/** "49 characters left", "1 character left" or "No characters left" (R42.3). */
export function counterLabel(left: number): string {
  if (left === 0) return 'No characters left';
  return `${left} ${left === 1 ? 'character' : 'characters'} left`;
}

const left = (field: TextFieldName, s: string) =>
  charactersLeft(s, LIMITS[field], COUNTER_FROM[field]);

/** Tells VoiceOver when a counter first appears, and when it reaches zero (N10). */
function announceCounter(before: number | null, after: number | null) {
  if (after === null) return;
  if (before === null || (after === 0 && before !== 0)) {
    AccessibilityInfo.announceForAccessibility(counterLabel(after));
  }
}

export interface MealFormHandle {
  /**
   * Checks the values and, if they can be saved, calls `onSave` with them trimmed. Otherwise it
   * shows the message at the field, focuses the field and announces the message (R42.5). The
   * screen's Save calls it.
   */
  save(): void;
}

export interface MealFormProps {
  values: FormValues;
  onChange: (values: FormValues) => void;
  /** Every household tag, in alphabetical order (R43.10). */
  tags: Tag[];
  /** An existing meal, which offers Delete meal (R44.1). */
  editing: boolean;
  /** The last failed save or delete. The screen clears it when the next one starts (R42.10). */
  problem: FormProblem | null;
  /** While a save or delete is in progress, Delete meal and the problem's action are disabled. */
  busy?: boolean;
  onSave: (meal: CleanMeal) => void;
  /** Save as new meal, after the other phone deleted this one (R46.7). */
  onSaveAsNew: (meal: CleanMeal) => void;
  /** Delete meal. The screen confirms first (R44.2). */
  onDelete: () => void;
  /** Retry after a failed delete, which the member has already confirmed (R44.4). */
  onRetryDelete: () => void;
  ref?: Ref<MealFormHandle>;
}

/**
 * The meal form's content (§3.9): a failure, if any, then Name, Description, Ingredients and
 * Tags, and Delete meal when editing. The screen owns the header's Cancel and Save, the scroll view
 * and the keyboard toolbar, and holds the values, so it can tell whether they've changed (R42.12).
 *
 * Each field stops at its limit: `maxLength` is the field's length plus the characters it has
 * left, so native input stops there, and pasted text is clamped to the first characters (R42.3,
 * DD56). Name is one line: pasted line breaks become spaces (R42.2).
 */
export function MealForm({
  values,
  onChange,
  tags,
  editing,
  problem,
  busy = false,
  onSave,
  onSaveAsNew,
  onDelete,
  onRetryDelete,
  ref,
}: MealFormProps) {
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const descriptionRef = useRef<ComponentRef<typeof TextInput>>(null);
  const ingredientsRef = useRef<ComponentRef<typeof TextInput>>(null);
  const focus = (field: TextFieldName) =>
    (field === 'name'
      ? nameRef
      : field === 'description'
        ? descriptionRef
        : ingredientsRef
    ).current?.focus();
  // The field the last Save stopped at, until the member changes it (R42.5).
  const [invalid, setInvalid] = useState<{ field: FormField; message: string } | null>(null);
  const copy = problem && describeProblem(problem);

  const errorFor = (field: FormField) =>
    invalid?.field === field ? invalid.message : copy?.field === field ? COPY.fieldRejected : null;

  function setField(field: TextFieldName, text: string) {
    const next = clampTo(field === 'name' ? oneLine(text) : text, LIMITS[field]);
    announceCounter(left(field, values[field]), left(field, next));
    if (invalid?.field === field) setInvalid(null);
    onChange({ ...values, [field]: next });
  }

  function validated(): CleanMeal | null {
    const result = validateMeal(values);
    if (result.ok) {
      setInvalid(null);
      return result.meal;
    }
    setInvalid({ field: result.field, message: result.message });
    if (result.field !== 'tags') focus(result.field);
    AccessibilityInfo.announceForAccessibility(result.message);
    return null;
  }

  function save() {
    const meal = validated();
    if (meal) onSave(meal);
  }

  function saveAsNew() {
    const meal = validated();
    if (meal) onSaveAsNew(meal);
  }

  useImperativeHandle(ref, () => ({ save }));

  // Retry repeats what failed, with the form's current values (§3.9).
  const action =
    copy?.action === 'retry'
      ? {
          label: 'Retry',
          onPress: problem?.kind === 'save' ? save : onRetryDelete,
          disabled: busy,
        }
      : copy?.action === 'saveAsNew'
        ? { label: COPY.saveAsNew, onPress: saveAsNew, disabled: busy }
        : null;

  const counter = (field: TextFieldName) => {
    const n = left(field, values[field]);
    return n === null ? null : (
      <Text variant="footnote" color="inkMuted" bold={n === 0}>
        {counterLabel(n)}
      </Text>
    );
  };

  return (
    <View style={styles.form}>
      {copy ? <FormError message={copy.message} action={action} /> : null}
      <View style={styles.field}>
        <TextField
          ref={nameRef}
          testID="meal-form-name"
          label="Name"
          value={values.name}
          onChangeText={(text) => setField('name', text)}
          maxLength={maxLengthFor(values.name, LIMITS.name)}
          error={errorFor('name')}
          autoCapitalize="sentences"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => focus('description')}
        />
        {counter('name')}
      </View>
      <View style={styles.field}>
        <TextField
          ref={descriptionRef}
          testID="meal-form-description"
          label="Description (optional)"
          value={values.description}
          onChangeText={(text) => setField('description', text)}
          maxLength={maxLengthFor(values.description, LIMITS.description)}
          error={errorFor('description')}
          multiline
          // The field grows with its text and the form scrolls, so nothing is hidden (N12).
          scrollEnabled={false}
        />
        {counter('description')}
      </View>
      <View style={styles.field}>
        <TextField
          ref={ingredientsRef}
          testID="meal-form-ingredients"
          label="Ingredients (optional)"
          value={values.ingredients}
          onChangeText={(text) => setField('ingredients', text)}
          maxLength={maxLengthFor(values.ingredients, LIMITS.ingredients)}
          error={errorFor('ingredients')}
          placeholder="One per line"
          multiline
          scrollEnabled={false}
        />
        {counter('ingredients')}
      </View>
      <TagPicker tags={tags} values={values} onChange={onChange} error={errorFor('tags')} />
      {editing ? (
        <Pressable
          testID="meal-form-delete"
          accessibilityRole="button"
          accessibilityLabel="Delete meal"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onDelete}
          style={({ pressed }) => [styles.delete, (pressed || busy) && styles.pressed]}
        >
          {/* Destructive red carries text only in bold (N13). */}
          <Text variant="headline" color="destructive" bold>
            Delete meal
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 20 },
  field: { gap: 4 },
  // Apart from Save, which is in the header (R44.1).
  delete: {
    alignSelf: 'center',
    minHeight: 44,
    minWidth: 44,
    marginTop: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
