import { render, screen } from '@testing-library/react-native';

import { KeyboardToolbar } from './keyboard-toolbar';
import { themes } from './theme';

const { light } = themes;

type ToolbarTheme = Record<'light' | 'dark', Record<string, string>>;

// Under Jest the library's mock renders the toolbar as a plain View, so its props are readable.
const toolbarTheme = () =>
  (screen.toJSON() as unknown as { props: { theme: ToolbarTheme } }).props.theme;

describe('KeyboardToolbar', () => {
  it('draws ink arrows and Done on white, with greyed arrows when there is no field to move to', async () => {
    await render(<KeyboardToolbar />);

    const colours = {
      primary: light.ink,
      disabled: light.inkDisabled,
      background: light.background,
      ripple: light.border,
    };
    expect(toolbarTheme()).toEqual({ light: colours, dark: colours });
  });

  it('gives the library a six-digit hex background, which it appends an opacity to', async () => {
    await render(<KeyboardToolbar />);

    expect(toolbarTheme().light.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(toolbarTheme().dark.background).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
