import type { ComponentProps } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { KEYBOARD_TOOLBAR_SPACE } from './keyboard-toolbar';
import { themes } from './theme';

export type FormScrollViewProps = ComponentProps<typeof KeyboardAwareScrollView>;

// The library scrolls the caret, not the field, `bottomOffset` above the keyboard. This covers the
// field's padding and border below the caret, and leaves a gap above the toolbar.
const FIELD_CLEARANCE = themes.light.space.xl + themes.light.space.md;

/**
 * The scroll view for any screen with text fields. When the keyboard opens, it scrolls the focused
 * field, or a multi-line field's caret as the member types, to sit just above the keyboard toolbar.
 * `automaticallyAdjustKeyboardInsets` clears only the keyboard, which leaves the field under the
 * toolbar. The extra space lets the last field on the screen scroll clear of the toolbar too.
 *
 * A list can use it through `renderScrollComponent`.
 */
export function FormScrollView(props: FormScrollViewProps) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={KEYBOARD_TOOLBAR_SPACE + FIELD_CLEARANCE}
      extraKeyboardSpace={KEYBOARD_TOOLBAR_SPACE}
      {...props}
    />
  );
}
