import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY, MEAL_TYPES } from '../constants';
import { charactersLeft, clampEntry, type Slot, slotChange, trimEntry } from '../domain';
import type { SetMealVariables } from '../hooks';
import { MealTypeIcon } from './meal-type-icon';

export interface SlotEditorProps {
  slot: Slot;
  /** The slot's name, such as "Thursday dinner", which labels the field for VoiceOver (N10). */
  name: string;
  /** `useSetMeal()`'s function. A `null` body clears the slot. */
  setMeal: (v: SetMealVariables) => void;
  /**
   * Asks the screen to close this editor, after Return, a blur or Clear. It can run twice (Return
   * blurs too), so it should close this slot only, never whichever slot is open by then.
   */
  onClose: () => void;
  /**
   * Opens the Meal Library picker for this slot (R45.1). Without it there's no Choose button
   * (R45.13). The screen's navigation unmounts the editor, which saves the draft as usual.
   */
  onChooseFromLibrary?: () => void;
}

/** "49 characters left", "1 character left" or "No characters left" (R32.5). */
export function counterLabel(left: number): string {
  if (left === 0) return 'No characters left';
  return `${left} ${left === 1 ? 'character' : 'characters'} left`;
}

/** Tells VoiceOver when the counter first appears, and when it reaches zero (N10). */
function announceCounter(before: number | null, after: number | null) {
  if (after === null) return;
  if (before === null || (after === 0 && before !== 0)) {
    AccessibilityInfo.announceForAccessibility(counterLabel(after));
  }
}

/**
 * An open slot: a multi-line field, the characters-left counter, Choose from Meal Library when the
 * screen offers it (meal-library design §3.11), and Clear (design §3.5, DD25). The
 * draft lives here, so a keystroke re-renders only the editor (N21), and nothing from the network
 * writes into it while it's open (R35.2, DD26).
 *
 * It saves when the member presses Return, the field blurs, the screen unmounts it (another slot,
 * week or tab) or the app leaves the foreground. Each save compares the trimmed draft with `base`,
 * the text the slot had when editing began (DD27), then makes the draft the new `base`, so a second
 * save of the same text sends nothing.
 */
export function SlotEditor({ slot, name, setMeal, onClose, onChooseFromLibrary }: SlotEditorProps) {
  const theme = useTheme();
  const { label } = MEAL_TYPES.find((t) => t.key === slot.mealType)!;
  // Read once: a later `slot.entry`, such as the other member's save, leaves the field alone (R35.2).
  const [draft, setDraft] = useState(() => slot.entry?.body ?? '');
  // Commits run from handlers, AppState and unmount, so they read a ref rather than a render's state.
  const edit = useRef({ base: draft, draft });

  function commit() {
    const { base, draft: text } = edit.current;
    const change = slotChange(base, text);
    edit.current.base = trimEntry(text);
    if (change.kind === 'none') return;
    setMeal({
      date: slot.date,
      mealType: slot.mealType,
      body: change.kind === 'save' ? change.body : null,
    });
  }

  function close() {
    commit();
    onClose();
  }

  // Empties the slot (R33.2). If it was empty when editing began and nothing has been saved since,
  // that only discards the draft, so the other member's new entry isn't deleted unseen (DD27).
  function clear() {
    edit.current.draft = '';
    close();
  }

  function onChangeText(text: string) {
    // Typing or pasting past the limit keeps the first ENTRY_MAX characters (R32.5, edge case 13).
    const next = clampEntry(text);
    announceCounter(charactersLeft(edit.current.draft), charactersLeft(next));
    edit.current.draft = next;
    setDraft(next);
  }

  const commitFromEffect = useEffectEvent(commit);

  // Leaving the foreground saves and keeps the editor open for the member's return (R32.3).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') commitFromEffect();
    });
    return () => subscription.remove();
  }, []);

  // Opening another slot, week or tab unmounts this editor, which saves (R32.3).
  useEffect(() => () => commitFromEffect(), []);

  const left = charactersLeft(draft);

  return (
    <View style={styles.row}>
      <MealTypeIcon mealType={slot.mealType} />
      <View style={styles.body}>
        {/* The field carries the slot's name for VoiceOver, so the visible label is hidden from it. */}
        <Text
          variant="subhead"
          color="inkMuted"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {label}
        </Text>
        <TextInput
          // Static, never meal text (R26.7).
          testID="slot-editor"
          accessibilityLabel={name}
          value={draft}
          onChangeText={onChangeText}
          placeholder={COPY.placeholder(label)}
          placeholderTextColor={theme.inkMuted}
          autoFocus
          multiline
          // Return means Done; a pasted line break stays (DD25, finding 4).
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          onSubmitEditing={close}
          onBlur={close}
          // The field grows with its text and the week scrolls, so long text wraps (R30.3, N12).
          scrollEnabled={false}
          allowFontScaling
          maxFontSizeMultiplier={2}
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              borderColor: theme.controlBorder,
              borderRadius: theme.radius.base,
              color: theme.ink,
            },
          ]}
        />
        <View style={styles.footer}>
          {left === null ? null : (
            <Text variant="footnote" color="inkMuted" bold={left === 0}>
              {counterLabel(left)}
            </Text>
          )}
          {onChooseFromLibrary === undefined ? null : (
            <Pressable
              testID="slot-choose"
              accessibilityRole="button"
              accessibilityLabel="Choose from Meal Library"
              onPress={onChooseFromLibrary}
              style={({ pressed }) => [styles.choose, pressed && styles.pressed]}
            >
              <Text variant="subhead" color="accent" bold>
                Choose from Meal Library
              </Text>
            </Pressable>
          )}
          <Pressable
            testID="slot-clear"
            accessibilityRole="button"
            accessibilityLabel="Clear"
            onPress={clear}
            style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
          >
            {/* Terracotta carries text only in bold (N13). */}
            <Text variant="subhead" color="accent" bold>
              Clear
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // SlotRow's layout, so the icon and label stay put when the slot opens.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  body: { flex: 1, gap: 6 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderWidth: 1,
    fontSize: 17,
  },
  // Wraps at large text sizes rather than clipping (N12).
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  // Shrinks so its label wraps inside the footer at 2× text rather than running past it (N12).
  choose: {
    minHeight: 44,
    minWidth: 44,
    flexShrink: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  clear: {
    minHeight: 44,
    minWidth: 44,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
