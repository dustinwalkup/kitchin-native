import { useState } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { CheckboxMark } from '@/ui/checkbox';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import type { GroceryItem } from '../domain';
import { QuantityEditor } from './quantity-editor';

export interface ItemRowProps {
  item: GroceryItem;
  /** The section's first and last rows round the top and bottom of its card (R16.2). */
  first: boolean;
  last: boolean;
  // The screen's mutation hooks, called once there rather than in every row (N3).
  onSetChecked: (v: { id: string; isChecked: boolean }) => void;
  onSetQuantity: (v: { id: string; quantity: string | null }) => void;
  onDelete: (v: { id: string }) => void;
}

/** What VoiceOver reads for a row, for example "Milk, 1 gallon, not checked" (N10). */
export function itemLabel({ name, quantity, isChecked }: GroceryItem): string {
  return [name, quantity, isChecked ? 'checked' : 'not checked'].filter(Boolean).join(', ');
}

// VoiceOver reaches the quantity and Delete through these, as the row is one element (N10).
const ACCESSIBILITY_ACTIONS = [
  { name: 'editQuantity', label: 'Edit quantity' },
  { name: 'delete', label: 'Delete' },
];

/**
 * A checkbox, the full name and the quantity (R4.5). A checked item is struck through and muted
 * as well as ticked, so colour is never the only sign (R4.6).
 *
 * Tapping the row checks or unchecks it (§3.4); the quantity is its own button, which opens an
 * inline editor (R8.1); swiping left reveals Delete, with no confirmation (R9.1, DD11).
 */
export function ItemRow({
  item,
  first,
  last,
  onSetChecked,
  onSetQuantity,
  onDelete,
}: ItemRowProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const { id, isChecked } = item;

  // The intended state, never a toggle, so a repeated tap changes nothing further (R7.3).
  const check = () => onSetChecked({ id, isChecked: !isChecked });
  const remove = () => onDelete({ id });
  const saveQuantity = (quantity: string | null) => {
    setEditing(false);
    if (quantity !== item.quantity) onSetQuantity({ id, quantity });
  };

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'editQuantity') setEditing(true);
    if (nativeEvent.actionName === 'delete') remove();
  };

  return (
    <ReanimatedSwipeable
      // The card's edge stays put and clips the row as it slides over Delete.
      containerStyle={[
        styles.card,
        { borderColor: theme.tertiary, borderRadius: theme.radius.card },
        !first && styles.notFirst,
        !last && styles.notLast,
      ]}
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={() => <DeleteAction onPress={remove} />}
    >
      <Pressable
        testID="item-row"
        // While the quantity is being edited, VoiceOver needs to reach the field inside.
        accessible={!editing}
        accessibilityRole="button"
        accessibilityLabel={itemLabel(item)}
        accessibilityActions={ACCESSIBILITY_ACTIONS}
        onAccessibilityAction={onAccessibilityAction}
        onPress={check}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.screen : theme.background },
        ]}
      >
        {first ? null : <View style={[styles.separator, { backgroundColor: theme.border }]} />}
        <View style={styles.checkbox}>
          <CheckboxMark checked={isChecked} />
        </View>
        {/* No line limit: long names wrap (R4.5, N12). */}
        <Text
          color={isChecked ? 'inkMuted' : 'ink'}
          style={[styles.name, isChecked && styles.struck]}
        >
          {item.name}
        </Text>
        {editing ? (
          <QuantityEditor initial={item.quantity} onDone={saveQuantity} />
        ) : (
          <QuantityButton quantity={item.quantity} onPress={() => setEditing(true)} />
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

/** The quantity, or a small "＋" to add one, as a target of at least 44 pt (N11). */
function QuantityButton({ quantity, onPress }: { quantity: string | null; onPress: () => void }) {
  return (
    <Pressable
      testID="quantity-button"
      accessibilityRole="button"
      accessibilityLabel="Edit quantity"
      onPress={onPress}
      style={({ pressed }) => [styles.quantity, pressed && styles.pressed]}
    >
      <Text
        variant={quantity === null ? 'body' : 'subhead'}
        color="inkMuted"
        style={styles.quantityText}
      >
        {quantity ?? '＋'}
      </Text>
    </Pressable>
  );
}

/** Revealed by swiping left. VoiceOver uses the row's Delete action instead (N10). */
function DeleteAction({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      testID="item-delete"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={onPress}
      style={[styles.delete, { backgroundColor: theme.destructive }]}
    >
      <Text variant="subhead" color="onBrand">
        Delete
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, borderWidth: 1 },
  // Rows in the middle of a card have square corners and no top or bottom edge.
  notFirst: { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  notLast: { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 52,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 8,
  },
  // Starts under the name, as iOS list separators do.
  separator: {
    position: 'absolute',
    top: 0,
    left: 48,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  checkbox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, paddingVertical: 8 },
  struck: { textDecorationLine: 'line-through' },
  quantity: {
    flexShrink: 1,
    maxWidth: '40%',
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  quantityText: { textAlign: 'right' },
  pressed: { opacity: 0.6 },
  delete: { width: 88, alignItems: 'center', justifyContent: 'center' },
});
