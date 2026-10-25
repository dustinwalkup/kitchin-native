import { useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { useTheme } from '@/ui/use-theme';

import { QUANTITY_MAX } from '../domain';

export interface QuantityEditorProps {
  initial: string | null;
  /** The trimmed quantity, or null for an empty one, which clears it (R8.2). */
  onDone: (quantity: string | null) => void;
}

/**
 * An inline field for an item's quantity. Return saves, and so does leaving the field, for
 * example by tapping elsewhere or scrolling (R8.3).
 */
export function QuantityEditor({ initial, onDone }: QuantityEditorProps) {
  const theme = useTheme();
  const [text, setText] = useState(initial ?? '');
  const done = useRef(false);

  // Return blurs the field as well, so this runs for both; only the first one saves.
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(text.trim() || null);
  };

  return (
    <TextInput
      testID="quantity-editor"
      accessibilityLabel="Quantity"
      placeholder="Quantity"
      placeholderTextColor={theme.inkMuted}
      value={text}
      onChangeText={setText}
      onSubmitEditing={finish}
      onBlur={finish}
      autoFocus
      selectTextOnFocus
      returnKeyType="done"
      // UTF-16 units, so never more than the database's 50 characters (R8.2).
      maxLength={QUANTITY_MAX}
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={[
        styles.input,
        {
          backgroundColor: theme.background,
          borderColor: theme.accent,
          borderRadius: theme.radius.base,
          color: theme.ink,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: '40%',
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    fontSize: 15,
  },
});
