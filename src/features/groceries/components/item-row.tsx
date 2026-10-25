import { memo, useEffect, useEffectEvent, useRef, useState } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { CheckboxMark } from '@/ui/checkbox';
import { QuantityStepper } from '@/ui/quantity-stepper';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { type GroceryItem, isSteppable, stepQuantity } from '../domain';
import { QuantityEditor } from './quantity-editor';

export interface ItemRowProps {
  item: GroceryItem;
  /** The section's first and last rows round the top and bottom of its surface. */
  first: boolean;
  last: boolean;
  // The screen's mutation hooks, called once there rather than in every row (N3).
  onSetChecked: (v: { id: string; isChecked: boolean }) => void;
  onSetQuantity: (v: { id: string; quantity: string | null }) => void;
  onDelete: (v: { id: string }) => void;
  /** Opens the edit sheet for the item's name, category and quantity. */
  onEdit: (id: string) => void;
}

/** What VoiceOver reads for a row, for example "Milk, 1 gallon, not checked" (N10). */
export function itemLabel({ name, quantity, isChecked }: GroceryItem): string {
  return [name, quantity, isChecked ? 'checked' : 'not checked'].filter(Boolean).join(', ');
}

/** Quick taps on − and + gather here, and save once the member pauses. */
export const STEP_SAVE_DELAY_MS = 600;

/**
 * A checkbox, the full name and the quantity (R4.5), on a white surface with hairline dividers. A
 * checked item is struck through and muted as well as ticked, so colour is never the only sign
 * (R4.6).
 *
 * Tapping the row checks or unchecks it (§3.4). A quantity that starts with a count gets − and +
 * (specs/redesign/design.md §4.1); any other quantity is a button that opens an inline editor
 * (R8.1). Swiping left reveals Edit and Delete, with no confirmation for Delete (R9.1, DD11).
 */
export const ItemRow = memo(function ItemRow({
  item,
  first,
  last,
  onSetChecked,
  onSetQuantity,
  onDelete,
  onEdit,
}: ItemRowProps) {
  const theme = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  const [editing, setEditing] = useState(false);
  const { id, isChecked } = item;
  const steps = useQuantitySteps(item, onSetQuantity);

  // The intended state, never a toggle, so a repeated tap changes nothing further (R7.3).
  const check = () => onSetChecked({ id, isChecked: !isChecked });
  const remove = () => onDelete({ id });
  const edit = () => {
    swipeable.current?.close();
    onEdit(id);
  };
  const saveQuantity = (quantity: string | null) => {
    setEditing(false);
    if (quantity !== item.quantity) onSetQuantity({ id, quantity });
  };

  const stepper = !isChecked && isSteppable(steps.quantity);

  // VoiceOver reaches the quantity, Edit and Delete through these, as the row is one element (N10).
  const actions = [
    ...(stepper
      ? [
          { name: 'increment', label: 'Increase quantity' },
          { name: 'decrement', label: 'Decrease quantity' },
        ]
      : [{ name: 'editQuantity', label: 'Edit quantity' }]),
    { name: 'edit', label: 'Edit item' },
    { name: 'delete', label: 'Delete' },
  ];

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    switch (nativeEvent.actionName) {
      case 'increment':
        return steps.step(1);
      case 'decrement':
        return steps.step(-1);
      case 'editQuantity':
        return setEditing(true);
      case 'edit':
        return edit();
      case 'delete':
        return remove();
    }
  };

  const radius = theme.radius.card;

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      // The surface's edge stays put and clips the row as it slides over the actions.
      containerStyle={[
        styles.surface,
        { backgroundColor: theme.background },
        first && { borderTopLeftRadius: radius, borderTopRightRadius: radius },
        last && { borderBottomLeftRadius: radius, borderBottomRightRadius: radius },
      ]}
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={() => (
        <View style={styles.actions}>
          <SwipeAction testID="item-edit" label="Edit" colour="ink" onPress={edit} />
          <SwipeAction testID="item-delete" label="Delete" colour="destructive" onPress={remove} />
        </View>
      )}
    >
      <Pressable
        testID="item-row"
        // While the quantity is being edited, VoiceOver needs to reach the field inside.
        accessible={!editing}
        accessibilityRole="button"
        accessibilityLabel={itemLabel({ ...item, quantity: steps.quantity })}
        accessibilityActions={actions}
        onAccessibilityAction={onAccessibilityAction}
        onPress={check}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.sunken : theme.background },
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
        ) : stepper ? (
          <QuantityStepper
            testID="quantity-stepper"
            accessible={false}
            label={`${item.name} quantity`}
            value={steps.quantity!}
            canDecrement={stepQuantity(steps.quantity, -1) !== undefined}
            canIncrement={stepQuantity(steps.quantity, 1) !== undefined}
            onDecrement={() => steps.step(-1)}
            onIncrement={() => steps.step(1)}
          />
        ) : item.quantity !== null ? (
          <QuantityButton quantity={item.quantity} onPress={() => setEditing(true)} />
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
});

/**
 * The quantity the row shows while − and + are tapped. Each tap steps from what's on screen, at
 * once, and the last value saves after a short pause, so quick taps never step from a value that's
 * still on its way to the server (specs/redesign/design.md §4.1). The pending value saves when the
 * row unmounts too. Once it's saved, the row follows the item again, including an undo.
 */
function useQuantitySteps(
  item: GroceryItem,
  onSetQuantity: (v: { id: string; quantity: string | null }) => void,
) {
  const [pending, setPending] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ id: item.id, pending, onSetQuantity });
  useEffect(() => {
    latest.current = { id: item.id, pending, onSetQuantity };
  });

  function flush() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const { id, pending: value, onSetQuantity: save } = latest.current;
    if (value !== null) save({ id, quantity: value });
  }

  // The item's quantity changing after a save, or by an undo, ends the pending value.
  useEffect(() => {
    if (timer.current === null) setPending(null);
  }, [item.quantity]);

  const flushFromEffect = useEffectEvent(flush);
  useEffect(() => () => flushFromEffect(), []);

  const quantity = pending ?? item.quantity;

  return {
    quantity,
    step(delta: 1 | -1) {
      const next = stepQuantity(quantity, delta);
      if (next === undefined) return;
      setPending(next);
      latest.current.pending = next;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush();
      }, STEP_SAVE_DELAY_MS);
    },
  };
}

/** A quantity that isn't a count, such as "1 bunch", as a target of at least 44 pt (N11). */
function QuantityButton({ quantity, onPress }: { quantity: string; onPress: () => void }) {
  return (
    <Pressable
      testID="quantity-button"
      accessibilityRole="button"
      accessibilityLabel="Edit quantity"
      onPress={onPress}
      style={({ pressed }) => [styles.quantity, pressed && styles.pressed]}
    >
      <Text variant="subhead" color="inkMuted" style={styles.quantityText}>
        {quantity}
      </Text>
    </Pressable>
  );
}

/** Revealed by swiping left. VoiceOver uses the row's actions instead (N10). */
function SwipeAction({
  testID,
  label,
  colour,
  onPress,
}: {
  testID: string;
  label: string;
  colour: 'ink' | 'destructive';
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={onPress}
      style={[styles.action, { backgroundColor: theme[colour] }]}
    >
      <Text variant="subhead" color="onBrand">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: { marginHorizontal: 16, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 50,
    paddingVertical: 3,
    paddingLeft: 6,
    paddingRight: 10,
  },
  // Starts under the name, as iOS list separators do.
  separator: {
    position: 'absolute',
    top: 0,
    left: 54,
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
    paddingHorizontal: 6,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  quantityText: { textAlign: 'right' },
  pressed: { opacity: 0.6 },
  actions: { flexDirection: 'row' },
  action: { width: 76, alignItems: 'center', justifyContent: 'center' },
});
