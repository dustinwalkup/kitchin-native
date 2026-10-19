import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, type TextInput, View } from 'react-native';

import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

import type { CategoryKey } from '../constants';
import { findOpenItemNamed, type GroceryItem, suggestCategory, validateItemInput } from '../domain';
import { CategoryChips } from './category-chips';

export interface NewItem {
  name: string;
  category: CategoryKey;
  quantity: string | null;
}

export interface AddItemFormProps {
  /** The list as loaded, for the duplicate check (R5.6). */
  items: GroceryItem[];
  onAdd: (item: NewItem) => void;
  /** Until the list has loaded, nothing can be added. */
  disabled?: boolean;
}

/**
 * Name, category and an optional quantity (R5.1). After each Add the fields clear and Name takes
 * focus again, ready for the next item (DD10).
 */
export function AddItemForm({ items, onAdd, disabled = false }: AddItemFormProps) {
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  // Null until the member taps a category; until then it follows the name (R5.2).
  const [picked, setPicked] = useState<CategoryKey | null>(null);
  const [tried, setTried] = useState(false);

  const category = picked ?? suggestCategory(name);
  const input = validateItemInput({ name, quantity });
  // An open item with the same name, in any category, can't be added again (R5.6).
  const duplicate = findOpenItemNamed(items, name);
  const duplicateMessage = duplicate ? `${duplicate.name} is already on the list.` : null;
  // A field over its limit is flagged as it's typed; an empty name only once Add is tried (R5.4).
  const problem = !input.ok && (tried || name.trim() !== '') ? input : null;
  const canAdd = !disabled && duplicate === undefined;

  // The message also explains, to VoiceOver, why Add is disabled.
  useEffect(() => {
    if (duplicateMessage) AccessibilityInfo.announceForAccessibility(duplicateMessage);
  }, [duplicateMessage]);

  function submit() {
    if (!canAdd) return;
    if (!input.ok) {
      setTried(true);
      AccessibilityInfo.announceForAccessibility(input.message);
      return;
    }
    // validateItemInput trims both fields and turns an empty quantity into null (R5.3).
    onAdd({ name: input.name, category, quantity: input.quantity });
    setName('');
    setQuantity('');
    setPicked(null);
    setTried(false);
    nameRef.current?.focus();
  }

  return (
    <View style={styles.form}>
      <TextField
        ref={nameRef}
        label="Name"
        value={name}
        onChangeText={setName}
        error={problem?.field === 'name' ? problem.message : null}
        autoFocus
        enablesReturnKeyAutomatically
        // Return adds the item and keeps the keyboard up for the next one.
        submitBehavior="submit"
        onSubmitEditing={submit}
      />
      <CategoryChips selected={category} onSelect={setPicked} />
      <TextField
        label="Quantity (optional)"
        value={quantity}
        onChangeText={setQuantity}
        error={problem?.field === 'quantity' ? problem.message : null}
        submitBehavior="submit"
        onSubmitEditing={submit}
      />
      <Button label="Add" onPress={submit} disabled={!canAdd} />
      {/* Not an error: the item is on the list already (R5.6). */}
      {duplicateMessage ? <Text variant="subhead">{duplicateMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
