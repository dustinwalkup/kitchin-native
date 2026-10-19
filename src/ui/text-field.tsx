import type { ComponentProps } from 'react';
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
  error?: string | null;
};

export function TextField({ label, error, ...rest }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      {/* The input carries the label for VoiceOver, so the visible copy is hidden from it. */}
      <Text variant="subhead" bold accessibilityElementsHidden>
        {label}
      </Text>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        allowFontScaling
        maxFontSizeMultiplier={2}
        placeholderTextColor={theme.inkMuted}
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            borderColor: error ? theme.destructive : theme.controlBorder,
            borderRadius: theme.radius.base,
            color: theme.ink,
          },
        ]}
      />
      {error ? (
        <Text variant="footnote" color="destructive" bold>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    fontSize: 17,
  },
});
