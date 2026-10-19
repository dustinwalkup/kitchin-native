import { useRouter } from 'expo-router';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import { AddItemForm, type NewItem } from '@/features/groceries/components/add-item-form';
import { QuickAddChips } from '@/features/groceries/components/quick-add-chips';
import { quickAddGroups } from '@/features/groceries/domain';
import { useAddItem, useGroceryList } from '@/features/groceries/hooks';
import { ToastProvider } from '@/lib/toast';
import { FormScrollView } from '@/ui/form-scroll-view';
import { KeyboardToolbar } from '@/ui/keyboard-toolbar';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/**
 * The add-item form sheet (§3.4, DD10). It stays open, so several items can go in one after
 * another. The sheet covers the root's toasts, so it shows its own, such as a failed add, at the
 * top where the keyboard can't hide them. It covers the root's keyboard toolbar too, so it mounts
 * its own, last so it paints on top, outside the Screen's bottom safe-area padding.
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

  // The item shows on the list at once (R5.5); the sheet is in front of it, so VoiceOver says so.
  const add = (item: NewItem) => {
    addItem(item);
    AccessibilityInfo.announceForAccessibility(`Added ${item.name}`);
  };

  return (
    <Screen edges={['bottom']}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header">
          Add item
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={() => router.back()}
          style={styles.done}
        >
          <Text variant="headline">Done</Text>
        </Pressable>
      </View>
      <FormScrollView
        contentContainerStyle={styles.content}
        // Chips and Add take the first tap while the keyboard is up.
        keyboardShouldPersistTaps="handled"
      >
        <AddItemForm items={items} onAdd={add} disabled={!ready} />
        {/* Until the list loads, no chip can say whether its item is on the list (R6.2). */}
        {ready ? (
          <QuickAddChips
            groups={quickAddGroups(items)}
            onAdd={({ name, category }) => add({ name, category, quantity: null })}
          />
        ) : null}
      </FormScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingLeft: 16,
    paddingRight: 4,
  },
  done: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center' },
  content: { padding: 16, gap: 32 },
});
