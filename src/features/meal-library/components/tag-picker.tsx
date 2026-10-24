import { useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

import { LIMITS } from '../constants';
import {
  addTypedTag,
  clampTo,
  compareNames,
  type FormValues,
  maxLengthFor,
  oneLine,
  type Tag,
  type TagChoice,
  tagKey,
} from '../domain';
import { TagChip } from './tag-chip';

export interface TagPickerProps {
  /** Every household tag, in alphabetical order (R43.10). */
  tags: Tag[];
  values: FormValues;
  onChange: (values: FormValues) => void;
  /** The database rejected a new tag's name (R42.10, DD58). */
  error?: string | null;
}

interface PickerChip {
  key: string;
  /** A tag's ID, or `new-<n>` for a tag this form will create. Never the name (R26.7). */
  id: string;
  name: string;
  selected: boolean;
  toggle: () => void;
}

/**
 * The meal form's tags (§3.7): every household tag as a chip, and the new tags added in this form,
 * selected, in one alphabetical list (R43.1, R43.4, R43.10). New tag opens a field for a name. A
 * name whose key is already a tag, or already added here, selects that tag instead, without an
 * error (R43.5). Nothing is created until the meal is saved, so deselecting a new tag removes it
 * (R43.7).
 */
export function TagPicker({ tags, values, onChange, error }: TagPickerProps) {
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');

  const without = (choice: TagChoice) => values.tags.filter((other) => other !== choice);
  const select = (choice: TagChoice) => onChange({ ...values, tags: [...values.tags, choice] });
  const deselect = (choice: TagChoice) => onChange({ ...values, tags: without(choice) });

  const existing = tags.map((tag): PickerChip => {
    const choice = values.tags.find((c) => c.kind === 'existing' && c.id === tag.id);
    return {
      key: tag.id,
      id: tag.id,
      name: tag.name,
      selected: choice !== undefined,
      toggle: () => (choice ? deselect(choice) : select({ kind: 'existing', id: tag.id })),
    };
  });
  const created = values.tags.flatMap((choice, i): PickerChip[] =>
    choice.kind === 'new'
      ? [
          {
            key: `new:${tagKey(choice.name)}`,
            id: `new-${i}`,
            name: choice.name,
            selected: true,
            toggle: () => deselect(choice),
          },
        ]
      : [],
  );
  const chips = [...existing, ...created].sort(compareNames);

  // The name VoiceOver hears after Add: the tag that's now selected, as it's spelled (R43.5).
  function selectedName(next: FormValues): string | undefined {
    const key = tagKey(typed);
    for (const choice of next.tags) {
      if (choice.kind === 'new' && tagKey(choice.name) === key) return choice.name;
      const tag = choice.kind === 'existing' ? tags.find((t) => t.id === choice.id) : undefined;
      if (tag?.key === key) return tag.name;
    }
    return undefined;
  }

  function add() {
    const { values: next, result } = addTypedTag(values, tags, typed);
    setTyped('');
    setAdding(false);
    // An empty name adds nothing (R43.6).
    if (result === 'empty') return;
    if (result !== 'already-selected') onChange(next);
    const name = selectedName(next);
    if (name !== undefined) {
      AccessibilityInfo.announceForAccessibility(
        result === 'added' ? `Added ${name}` : `Selected ${name}`,
      );
    }
  }

  return (
    <View style={styles.picker}>
      <Text variant="subhead" bold>
        Tags
      </Text>
      <View style={styles.chips}>
        {chips.map((chip) => (
          <TagChip
            key={chip.key}
            id={chip.id}
            name={chip.name}
            selected={chip.selected}
            onPress={chip.toggle}
          />
        ))}
        {adding ? null : (
          <Chip
            testID="tag-picker-new"
            label="＋ New tag"
            accessibilityLabel="New tag"
            tone="accent"
            onPress={() => setAdding(true)}
          />
        )}
      </View>
      {adding ? (
        <View style={styles.add}>
          <View style={styles.field}>
            <TextField
              testID="tag-picker-field"
              label="New tag"
              value={typed}
              // One line, kept to the tag limit (R43.3).
              onChangeText={(text) => setTyped(clampTo(oneLine(text), LIMITS.tag))}
              maxLength={maxLengthFor(typed, LIMITS.tag)}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={add}
            />
          </View>
          <Button label="Add" variant="secondary" tone="accent" onPress={add} />
        </View>
      ) : null}
      {error ? (
        <Text variant="footnote" color="destructive" bold>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Wraps at large text sizes, so Add moves below the field rather than squeezing it (N12).
  add: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8, paddingTop: 6 },
  field: { flexGrow: 1, minWidth: 200 },
});
