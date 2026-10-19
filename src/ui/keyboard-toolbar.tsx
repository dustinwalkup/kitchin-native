import {
  KEYBOARD_HAS_ROUNDED_CORNERS,
  KeyboardToolbar as LibraryKeyboardToolbar,
} from 'react-native-keyboard-controller';

import { type Theme, themes } from './theme';

/**
 * What the toolbar adds above the keyboard: its 42 pt bar (the library's KEYBOARD_TOOLBAR_HEIGHT,
 * which it doesn't export), floated a further 11 pt up on iOS 26's rounded keyboards.
 */
export const KEYBOARD_TOOLBAR_SPACE = 42 + (KEYBOARD_HAS_ROUNDED_CORNERS ? 11 : 0);

// Ink for the arrows and Done, so the bar reads as keyboard chrome rather than a call to action.
const colours = (theme: Theme) => ({
  primary: theme.ink,
  disabled: theme.inkDisabled,
  // The library appends an opacity suffix, so this must stay a six-digit hex.
  background: theme.background,
  ripple: theme.border, // Android only
});

// The library picks a scheme from the keyboard's own appearance, so it takes both.
const TOOLBAR_THEME = { light: colours(themes.light), dark: colours(themes.dark) };

/**
 * The bar above the keyboard: ‹ › step between fields and Done closes the keyboard, which a
 * multi-line field's Return can't do. It needs `KeyboardProvider` above it (the root layout).
 *
 * It pins itself to the bottom of its parent, so mount it as the last child of a view that reaches
 * the bottom of the screen. The root layout mounts one for every screen. A native sheet or modal
 * draws over the root, so one with text fields mounts its own (add-item).
 */
export function KeyboardToolbar() {
  return <LibraryKeyboardToolbar theme={TOOLBAR_THEME} />;
}
