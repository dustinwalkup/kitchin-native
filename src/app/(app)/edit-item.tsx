import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Alert, StyleSheet, View } from 'react-native';

import {
  ItemForm,
  type ItemFormHandle,
  type NewItem,
} from '@/features/groceries/components/item-form';
import type { GroceryItem } from '@/features/groceries/domain';
import { useDeleteItem, useEditItem, useGroceryList } from '@/features/groceries/hooks';
import { ToastProvider } from '@/lib/toast';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { FormScrollView } from '@/ui/form-scroll-view';
import { KeyboardToolbar } from '@/ui/keyboard-toolbar';
import { Screen } from '@/ui/screen';
import { SheetHeader } from '@/ui/sheet-header';

/**
 * Editing an item's name, category and quantity, or deleting it (specs/redesign/design.md §4.3). A
 * form sheet over Groceries, opened from the row's swipe or its VoiceOver action. Only the item's ID
 * travels in the route (DD51). The change shows on the list at once, as every grocery change does
 * (R12.1).
 */
export default function EditItem() {
  return (
    <>
      <ToastProvider placement="top">
        <EditItemSheet />
      </ToastProvider>
      <KeyboardToolbar />
    </>
  );
}

function EditItemSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { items, status } = useGroceryList();
  // The item as the sheet opened, once the list has loaded. A change from the other phone doesn't
  // reach the open form.
  const now = items.find((i) => i.id === id);
  const [item, setItem] = useState(now);
  if (item === undefined && now !== undefined) setItem(now);

  if (item === undefined) {
    return (
      <Screen edges={['bottom']}>
        <SheetHeader title="Edit item" left={{ label: 'Close', onPress: () => router.back() }} />
        {status === 'ready' ? (
          <EmptyState
            testID="edit-item-missing"
            emoji="🧺"
            title="This item isn't on the list any more"
          >
            <Button label="Close" onPress={() => router.back()} />
          </EmptyState>
        ) : null}
      </Screen>
    );
  }

  return <ItemEditor item={item} items={items} />;
}

function ItemEditor({ item, items }: { item: GroceryItem; items: GroceryItem[] }) {
  const router = useRouter();
  const editItem = useEditItem();
  const deleteItem = useDeleteItem();
  const form = useRef<ItemFormHandle>(null);
  const [canSubmit, setCanSubmit] = useState(true);
  const before = { name: item.name, category: item.category, quantity: item.quantity };

  const save = (after: NewItem) => {
    const changed =
      after.name !== before.name ||
      after.category !== before.category ||
      after.quantity !== before.quantity;
    if (changed) editItem({ id: item.id, before, after });
    router.back();
  };

  // As the swipe's Delete does, but asked first: the sheet's button is easy to reach by mistake.
  const confirmDelete = () =>
    Alert.alert(`Delete ${item.name}?`, "It'll be removed from the list.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteItem({ id: item.id });
          AccessibilityInfo.announceForAccessibility(`Deleted ${item.name}`);
          router.back();
        },
      },
    ]);

  return (
    <Screen edges={['bottom']}>
      <SheetHeader
        title="Edit item"
        left={{ label: 'Cancel', onPress: () => router.back(), testID: 'edit-item-cancel' }}
        right={{
          label: 'Save',
          onPress: () => form.current?.submit(),
          disabled: !canSubmit,
          testID: 'edit-item-save',
        }}
      />
      <FormScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ItemForm
          ref={form}
          items={items}
          editing={item}
          onSubmit={save}
          onCanSubmitChange={setCanSubmit}
        />
        <View style={styles.delete}>
          <Button
            testID="edit-item-delete"
            label="Delete item"
            variant="text"
            destructive
            onPress={confirmDelete}
          />
        </View>
      </FormScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  delete: { alignItems: 'center', marginTop: 24 },
});
