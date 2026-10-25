import { SymbolView } from 'expo-symbols';
import { type ComponentRef, type Ref, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, type TextInput, View } from 'react-native';

import { MEAL_TYPES } from '@/features/meals/constants';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme } from '@/ui/use-theme';

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
import { MealImage } from './meal-image';
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
  /** What the photo shows: a signed URL for a stored photo, or the picked file. */
  photoUri?: string;
  /** Opens the screen's choices for the photo: take, choose or remove. */
  onPhotoPress: () => void;
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
 * The meal form's content (§3.9, specs/redesign/design.md §5.3): a failure, if any, then the photo,
 * Name, Meal type, Description, Ingredients and Tags, and Delete meal when editing. Only the name is
 * required. The screen owns the header's Cancel and Save, the scroll view, the keyboard toolbar and
 * the photo's choices, and holds the values, so it can tell whether they've changed (R42.12).
 *
 * Each field stops at its limit: `maxLength` is the field's length plus the characters it has
 * left, so native input stops there, and pasted text is clamped to the first characters (R42.3,
 * DD56). Name is one line: pasted line breaks become spaces (R42.2).
 */
export function MealForm({
  values,
  onChange,
  tags,
  photoUri,
  onPhotoPress,
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
  const focus = (field: FormField) =>
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
    if (result.field !== 'tags' && result.field !== 'image') focus(result.field);
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
      <PhotoField
        hasPhoto={values.image.kind !== 'none'}
        uri={photoUri}
        path={values.image.kind === 'none' ? null : values.image.path}
        mealType={values.mealType}
        error={errorFor('image')}
        onPress={onPhotoPress}
      />
      <TextField
        ref={nameRef}
        testID="meal-form-name"
        label="Name"
        placeholder="e.g. Chicken & rice"
        value={values.name}
        onChangeText={(text) => setField('name', text)}
        maxLength={maxLengthFor(values.name, LIMITS.name)}
        error={errorFor('name')}
        hint={counter('name')}
        autoCapitalize="sentences"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => focus('description')}
      />
      <MealTypePicker
        selected={values.mealType}
        onSelect={(mealType) => onChange({ ...values, mealType })}
      />
      <TextField
        ref={descriptionRef}
        testID="meal-form-description"
        label="Description"
        labelNote="Optional"
        placeholder="A short note, such as how you serve it"
        value={values.description}
        onChangeText={(text) => setField('description', text)}
        maxLength={maxLengthFor(values.description, LIMITS.description)}
        error={errorFor('description')}
        hint={counter('description')}
        multiline
        // The field grows with its text and the form scrolls, so nothing is hidden (N12).
        scrollEnabled={false}
      />
      <TextField
        ref={ingredientsRef}
        testID="meal-form-ingredients"
        label="Ingredients"
        labelNote="Optional"
        value={values.ingredients}
        onChangeText={(text) => setField('ingredients', text)}
        maxLength={maxLengthFor(values.ingredients, LIMITS.ingredients)}
        error={errorFor('ingredients')}
        hint={
          counter('ingredients') ?? (
            <Text variant="footnote" color="inkMuted">
              One per line
            </Text>
          )
        }
        placeholder={'Chicken thighs\nRice\nBroccoli'}
        multiline
        scrollEnabled={false}
      />
      <TagPicker tags={tags} values={values} onChange={onChange} error={errorFor('tags')} />
      {editing ? (
        <View style={styles.delete}>
          <Button
            testID="meal-form-delete"
            label="Delete meal"
            variant="text"
            destructive
            disabled={busy}
            onPress={onDelete}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The photo at the top of the form, wide and short so the fields stay close: tap it to take, choose
 * or remove one (design §5.3). Without one, it's an inviting tile, never a required field.
 */
function PhotoField({
  hasPhoto,
  uri,
  path,
  mealType,
  error,
  onPress,
}: {
  hasPhoto: boolean;
  uri?: string;
  path: string | null;
  mealType: FormValues['mealType'];
  error: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.photoField}>
      <Pressable
        testID="meal-form-photo"
        accessibilityRole="button"
        accessibilityLabel={hasPhoto ? COPY.changePhoto : COPY.addPhoto}
        onPress={onPress}
        style={({ pressed }) => [
          styles.photo,
          { borderRadius: theme.radius.card, backgroundColor: theme.sunken },
          pressed && styles.pressed,
        ]}
      >
        {hasPhoto ? (
          <>
            <MealImage
              path={path}
              uri={uri}
              mealType={mealType}
              width="100%"
              aspectRatio={16 / 9}
              radius={0}
              symbolSize={32}
            />
            <View style={[styles.photoBadge, { backgroundColor: theme.background }]}>
              <SymbolView name="camera.fill" tintColor={theme.ink} size={13} />
              <Text variant="footnote" weight="semibold">
                Change
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.photoEmpty}>
            <SymbolView name="camera" tintColor={theme.accent} size={26} />
            <Text variant="subhead" color="accentInk" weight="semibold">
              {COPY.addPhoto}
            </Text>
            <Text variant="footnote" color="inkMuted">
              Optional · helps you spot it in the list
            </Text>
          </View>
        )}
      </Pressable>
      {error ? (
        <Text variant="footnote" color="destructive" weight="semibold">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Breakfast, Lunch or Dinner as three chips, at most one chosen; tapping the chosen one clears it
 * (DD-R6). A type isn't a tag: it's what the library's type filter uses, and it never stops the
 * meal being planned in another slot.
 */
function MealTypePicker({
  selected,
  onSelect,
}: {
  selected: FormValues['mealType'];
  onSelect: (mealType: FormValues['mealType']) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <Text variant="subhead" weight="semibold" accessibilityRole="header">
        {COPY.mealType}
        <Text variant="subhead" color="inkMuted">
          {'  '}Optional
        </Text>
      </Text>
      <View style={styles.types}>
        {MEAL_TYPES.map(({ key, label, symbol, glyph }) => (
          <Chip
            key={key}
            testID={`meal-form-type-${key}`}
            label={label}
            selected={selected === key}
            onPress={() => onSelect(selected === key ? null : key)}
            leading={<SymbolView name={symbol} tintColor={theme[glyph]} size={13} />}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 22 },
  field: { gap: 8 },
  photoField: { gap: 6 },
  photo: { overflow: 'hidden', aspectRatio: 16 / 9 },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 16 },
  photoBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  delete: { alignItems: 'center', marginTop: 8 },
  pressed: { opacity: 0.8 },
});
