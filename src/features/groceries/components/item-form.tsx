import {
  type ComponentRef,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/ui/chip';
import { SectionHeader } from '@/ui/group';
import { QuantityStepper } from '@/ui/quantity-stepper';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme } from '@/ui/use-theme';

import { CATEGORIES, type CategoryKey } from '../constants';
import {
  findOpenItemNamed,
  type GroceryItem,
  QUANTITY_MAX,
  quickAddChips,
  stepQuantity,
  suggestCategory,
  validateItemInput,
} from '../domain';
import { CategoryGrid } from './category-grid';

export interface NewItem {
  name: string;
  category: CategoryKey;
  quantity: string | null;
}

export interface ItemFormHandle {
  /** Checks the fields and, if they can be saved, calls `onSubmit`. The sheet's header button calls it. */
  submit(): void;
}

export interface ItemFormProps {
  /** The list as loaded, for the duplicate check (R5.6). */
  items: GroceryItem[];
  /** An item being edited: the fields start from it, and its own name isn't a duplicate. */
  editing?: GroceryItem;
  onSubmit: (item: NewItem) => void;
  /** A quick-add chip adds its item at once (R6.3). Add only. */
  onQuickAdd?: (item: NewItem) => void;
  /** Until the list has loaded, nothing can be added. */
  disabled?: boolean;
  /** Whether the header's Add or Save can be pressed, as the fields change. */
  onCanSubmitChange?: (canSubmit: boolean) => void;
  ref?: Ref<ItemFormHandle>;
}

/**
 * The add and edit sheets' fields (R5.1, specs/redesign/design.md §4.2): Name, a quantity with − and
 * + around a field that also takes a unit, the categories as tiles, and, when adding, quick-add
 * chips. After each add the fields clear and Name takes focus again, ready for the next item (DD10).
 */
export function ItemForm({
  items,
  editing,
  onSubmit,
  onQuickAdd,
  disabled = false,
  onCanSubmitChange,
  ref,
}: ItemFormProps) {
  const theme = useTheme();
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState(editing?.name ?? '');
  const [quantity, setQuantity] = useState(editing?.quantity ?? '');
  // Null until the member taps a category; until then a new item's follows the name (R5.2).
  const [picked, setPicked] = useState<CategoryKey | null>(editing?.category ?? null);
  const [tried, setTried] = useState(false);

  const category = picked ?? suggestCategory(name);
  const input = validateItemInput({ name, quantity });
  // An open item with the same name, in any category, can't be added again (R5.6). Renaming an item
  // to its own name isn't a duplicate.
  const duplicate = findOpenItemNamed(
    items.filter((item) => item.id !== editing?.id),
    name,
  );
  const duplicateMessage = duplicate ? `${duplicate.name} is already on the list.` : null;
  // A field over its limit is flagged as it's typed; an empty name only once Add is tried (R5.4).
  const problem = !input.ok && (tried || name.trim() !== '') ? input : null;
  const canSubmit = !disabled && duplicate === undefined;

  useEffect(() => onCanSubmitChange?.(canSubmit), [canSubmit, onCanSubmitChange]);

  // The message also explains, to VoiceOver, why Add is disabled.
  useEffect(() => {
    if (duplicateMessage) AccessibilityInfo.announceForAccessibility(duplicateMessage);
  }, [duplicateMessage]);

  function submit() {
    if (!canSubmit) return;
    if (!input.ok) {
      setTried(true);
      AccessibilityInfo.announceForAccessibility(input.message);
      return;
    }
    // validateItemInput trims both fields and turns an empty quantity into null (R5.3).
    onSubmit({ name: input.name, category, quantity: input.quantity });
    if (editing) return;
    setName('');
    setQuantity('');
    setPicked(null);
    setTried(false);
    nameRef.current?.focus();
  }

  useImperativeHandle(ref, () => ({ submit }));

  const step = (delta: 1 | -1) => {
    const next = stepQuantity(quantity.trim() === '' ? null : quantity.trim(), delta);
    if (next !== undefined) setQuantity(next);
  };
  const current = quantity.trim() === '' ? null : quantity.trim();
  const quantityError = problem?.field === 'quantity' ? problem.message : null;

  const chips = onQuickAdd ? quickAddChips(items, { query: name, category: picked }) : [];
  const chipsTitle =
    name.trim() !== ''
      ? 'Suggestions'
      : picked !== null
        ? `Quick add · ${CATEGORIES.find((c) => c.key === picked)!.label}`
        : 'Quick add';

  return (
    <View style={styles.form}>
      <TextField
        ref={nameRef}
        testID="item-form-name"
        label="Name"
        placeholder="e.g. Milk, Bananas, Chicken…"
        value={name}
        onChangeText={setName}
        error={problem?.field === 'name' ? problem.message : null}
        hint={
          // Not an error: the item is on the list already (R5.6).
          duplicateMessage ? (
            <Text variant="footnote" color="accentInk" weight="medium">
              {duplicateMessage}
            </Text>
          ) : undefined
        }
        autoFocus={!editing}
        autoCapitalize="words"
        enablesReturnKeyAutomatically
        returnKeyType={editing ? 'done' : 'go'}
        // Return adds the item and keeps the keyboard up for the next one.
        submitBehavior={editing ? 'blurAndSubmit' : 'submit'}
        onSubmitEditing={submit}
      />

      {/* Until the list loads, no chip can say whether its item is on the list (R6.2). Right under
          the name, so the suggestions stay above the keyboard as the member types. */}
      {onQuickAdd && !disabled && chips.length > 0 ? (
        <View testID="quick-add" style={styles.quickAdd}>
          <SectionHeader title={chipsTitle} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chips}
            style={styles.chipRow}
          >
            {chips.map((chip) => (
              <Chip
                key={chip.name}
                testID="quick-add-chip"
                label={chip.name}
                disabled={chip.disabled}
                onPress={() =>
                  onQuickAdd({ name: chip.name, category: chip.category, quantity: null })
                }
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.field}>
        <View style={styles.quantityRow}>
          <Text variant="subhead" weight="semibold" style={styles.flex}>
            Quantity
          </Text>
          <QuantityStepper
            testID="item-form-quantity"
            label="Quantity"
            value={current ?? '1'}
            canDecrement={stepQuantity(current, -1) !== undefined && current !== null}
            canIncrement={stepQuantity(current, 1) !== undefined}
            onDecrement={() => step(-1)}
            onIncrement={() => step(1)}
          >
            <TextInput
              testID="item-form-quantity-field"
              accessibilityLabel="Quantity"
              accessibilityHint="A number, or a number with a unit, such as 2 lbs"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="1"
              placeholderTextColor={theme.inkMuted}
              // UTF-16 units, so never more than the database's 50 characters (R8.2).
              maxLength={QUANTITY_MAX}
              // Return adds from here too, as from the name (R5.1, DD10).
              returnKeyType={editing ? 'done' : 'go'}
              submitBehavior={editing ? 'blurAndSubmit' : 'submit'}
              onSubmitEditing={submit}
              allowFontScaling
              maxFontSizeMultiplier={2}
              style={[styles.quantityInput, { color: theme.ink }]}
            />
          </QuantityStepper>
        </View>
        {quantityError ? (
          <Text variant="footnote" color="destructive" weight="semibold">
            {quantityError}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text variant="subhead" weight="semibold">
          Category
        </Text>
        <CategoryGrid selected={category} onSelect={setPicked} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 22 },
  field: { gap: 10 },
  flex: { flex: 1 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quantityInput: {
    minWidth: 56,
    maxWidth: 140,
    minHeight: 34,
    paddingHorizontal: 6,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickAdd: { gap: 8, marginTop: -8 },
  // Full width, past the form's side padding, so the row scrolls from edge to edge.
  chipRow: { marginHorizontal: -16 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 5 },
});
