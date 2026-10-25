import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import {
  ItemForm,
  type ItemFormHandle,
  type NewItem,
} from '@/features/groceries/components/item-form';
import { useAddItem, useGroceryList } from '@/features/groceries/hooks';
import { ToastProvider } from '@/lib/toast';
import { FormScrollView } from '@/ui/form-scroll-view';
import { KeyboardToolbar } from '@/ui/keyboard-toolbar';
import { Screen } from '@/ui/screen';
import { SheetHeader } from '@/ui/sheet-header';
import { Text } from '@/ui/text';

/** How long "Added Milk" stays under the header. */
export const ADDED_NOTE_MS = 2500;

/**
 * The add-item form sheet (§3.4, DD10, specs/redesign/design.md §4.2). It stays open, so several
 * items can go in one after another, and says each one was added just under its header. The sheet
 * covers the root's toasts, so it shows its own, such as a failed add, at the top where the keyboard
 * can't hide them. It covers the root's keyboard toolbar too, so it mounts its own, last so it paints
 * on top, outside the Screen's bottom safe-area padding.
 */
export default function AddItem() {
  return (
    <>
      <ToastProvider placement="top">
        <AddItemSheet />
      </ToastProvider>
      <KeyboardToolbar />
    </>
  );
}

function AddItemSheet() {
  const router = useRouter();
  const { items, status } = useGroceryList();
  const addItem = useAddItem();
  const ready = status === 'ready';
  const form = useRef<ItemFormHandle>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [added, setAdded] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (added === null) return;
    const timer = setTimeout(() => setAdded(null), ADDED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [added]);

  // The item shows on the list at once (R5.5); the sheet is in front of it, so it says so.
  const add = (item: NewItem) => {
    addItem(item);
    setAdded((current) => ({ id: (current?.id ?? 0) + 1, name: item.name }));
    AccessibilityInfo.announceForAccessibility(`Added ${item.name}`);
  };

  return (
    <Screen edges={['bottom']}>
      <SheetHeader
        title="Add item"
        left={{ label: 'Done', onPress: () => router.back(), testID: 'add-item-done' }}
        right={{
          label: 'Add',
          onPress: () => form.current?.submit(),
          disabled: !ready || !canSubmit,
          testID: 'add-item-submit',
        }}
      />
      <View
        style={styles.note}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {added ? (
          <Text testID="added-note" variant="footnote" color="sageInk" weight="semibold">
            ✓ Added {added.name}
          </Text>
        ) : null}
      </View>
      <FormScrollView
        contentContainerStyle={styles.content}
        // Chips and tiles take the first tap while the keyboard is up.
        keyboardShouldPersistTaps="handled"
      >
        <ItemForm
          ref={form}
          items={items}
          onSubmit={add}
          onQuickAdd={add}
          disabled={!ready}
          onCanSubmitChange={setCanSubmit}
        />
      </FormScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { minHeight: 18, alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
});
