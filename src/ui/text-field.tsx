import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

// ComponentProps includes `ref`, so a screen can move focus to the next field.
export type TextFieldProps = Omit<
  ComponentProps<typeof TextInput>,
  'style' | 'placeholderTextColor' | 'allowFontScaling' | 'maxFontSizeMultiplier'
> & {
  /** Shown above the field and read by VoiceOver (N10). */
  label: string;
  /** A muted word after the label, such as "Optional". */
  labelNote?: string;
  error?: string | null;
  /** Helper text below the field, such as a characters-left counter. Replaced by `error`. */
  hint?: ReactNode;
};

/**
 * A labelled field: the label above, then a white field with a soft edge, which turns red with the
 * error below it. The label always shows, so the edge can be quiet (specs/redesign/design.md DD-R4).
 */
export function TextField({ label, labelNote, error, hint, multiline, ...rest }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      {/* The input carries the label for VoiceOver, so the visible copy is hidden from it. */}
      <Text
        variant="subhead"
        weight="semibold"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
        {labelNote ? (
          <Text variant="subhead" color="inkMuted">
            {'  '}
            {labelNote}
          </Text>
        ) : null}
      </Text>
      <TextInput
        {...rest}
        multiline={multiline}
        // "Description (optional)": the note is part of the field's name for VoiceOver (N10).
        accessibilityLabel={labelNote ? `${label} (${labelNote.toLowerCase()})` : label}
        allowFontScaling
        maxFontSizeMultiplier={2}
        placeholderTextColor={theme.inkMuted}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            backgroundColor: theme.background,
            borderColor: error ? theme.destructive : theme.border,
            borderRadius: theme.radius.base,
            color: theme.ink,
          },
        ]}
      />
      {error ? (
        <Text variant="footnote" color="destructive" weight="semibold">
          {error}
        </Text>
      ) : (
        hint
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    fontSize: 17,
  },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
});
