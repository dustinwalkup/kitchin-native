// The only file allowed to hold colour literals (R16.7). Components read these tokens.

// The warm-minimal palette (specs/redesign/design.md §2, which supersedes the desert palette of R16.1).
// Two values moved from the brief for contrast: secondary text is darker than #707a7d, which is 3.9:1
// on ivory, so it reaches 4.5:1 on the sunken tone too, and sage is deeper than #7e9a80, so a white
// check on it clears 3:1 with room to spare. TEXT_PAIRS limits where each colour may carry text.
const palette = {
  ivory: '#f8f1e9', // the page
  surface: '#fffefc', // rows, groups and sheets
  ink: '#29363b', // deep charcoal
  terracotta: '#d96e4d', // the one accent
  sage: '#6b8a6e', // completion: checked boxes and progress
  ochre: '#b8862e', // the lunch icon
  slate: '#5f7f86', // the dinner icon
} as const;

const light = {
  // Surfaces
  screen: palette.ivory,
  background: palette.surface,
  sunken: '#f0e8de', // a search field or segmented control's track, set into the page
  // Text
  ink: palette.ink,
  inkMuted: '#5f696c', // secondary text, checked items, empty states
  inkDisabled: '#bfc3c4', // the keyboard toolbar's disabled arrows
  onBrand: '#ffffff', // on terracotta only in bold (DD19)
  // Lines
  border: '#e9e2da', // dividers, and the soft edge of fields and chips
  controlBorder: '#8f867e', // a checkbox's outline, its only boundary (N13)
  // The accent: terracotta fills and icons, and `accentInk` for terracotta text at any weight
  accent: palette.terracotta,
  accentInk: '#a84d30',
  accentSoft: '#faebe6', // the blush of a selected chip, row or pill
  // Completion
  sage: palette.sage,
  sageInk: '#4a6a4e',
  sageSoft: '#eaefeb',
  destructive: '#b3382a',
  // Meal type glyphs, on white rows (DD32 as redesigned)
  breakfast: palette.terracotta,
  lunch: palette.ochre,
  dinner: palette.slate,
  radius: { sm: 8, base: 10, card: 14, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
} as const;

export type Theme = typeof light;

/** The name of a theme token that holds a single colour. */
export type ColourToken = { [K in keyof Theme]: Theme[K] extends string ? K : never }[keyof Theme];

// The app is light-only (R16.6). Dark stays equal to light until a dark palette is designed.
export const themes = { light, dark: light } as const;

/**
 * Tokens that are a palette colour at `alpha` over white, stored as opaque hex because React
 * Native has no `bg-primary/10` syntax. theme.test.ts recomputes each one.
 */
export const TINTS = {
  inkDisabled: { source: 'ink', alpha: 0.3 },
  accentSoft: { source: 'accent', alpha: 0.14 },
  sageSoft: { source: 'sage', alpha: 0.14 },
} as const satisfies { [K in keyof Theme]?: { source: keyof Theme; alpha: number } };

export interface TextPair {
  fg: string;
  bg: string;
  /** 4.5 allows any text. 3 allows only bold text, which iOS treats as large (DD19). */
  min: 3 | 4.5;
  bold?: true;
}

/** Every foreground and background that may carry text (N13). theme.test.ts measures each. */
export const TEXT_PAIRS: readonly TextPair[] = [
  { fg: light.ink, bg: light.background, min: 4.5 },
  { fg: light.ink, bg: light.screen, min: 4.5 },
  { fg: light.ink, bg: light.sunken, min: 4.5 },
  { fg: light.inkMuted, bg: light.background, min: 4.5 },
  { fg: light.inkMuted, bg: light.screen, min: 4.5 },
  // Search placeholders, neutral counts, the type pill, inactive segments and Reconnecting….
  { fg: light.inkMuted, bg: light.sunken, min: 4.5 },
  // Links, header actions, Today and the selected chip's label, at any weight.
  { fg: light.accentInk, bg: light.background, min: 4.5 },
  { fg: light.accentInk, bg: light.screen, min: 4.5 },
  { fg: light.accentInk, bg: light.accentSoft, min: 4.5 },
  // Tag pills.
  { fg: light.ink, bg: light.accentSoft, min: 4.5 },
  // Category counts.
  { fg: light.sageInk, bg: light.sageSoft, min: 4.5 },
  // Primary buttons, the add button's label and the progress percentage on white.
  { fg: light.onBrand, bg: light.accent, min: 3, bold: true },
  { fg: light.accent, bg: light.background, min: 3, bold: true },
  // The swipe Delete action, and errors.
  { fg: light.onBrand, bg: light.destructive, min: 4.5 },
  { fg: light.destructive, bg: light.background, min: 4.5 },
  { fg: light.destructive, bg: light.screen, min: 4.5 },
  // The offline banner, toasts, the DEV badge and the swipe Edit action.
  { fg: light.onBrand, bg: light.ink, min: 4.5 },
];

/**
 * Outlines that are a control's only visible boundary need 3:1 (N13): the checkbox. Text fields,
 * search and chips carry a visible label or placeholder, so their soft `border` edge is decorative
 * (specs/redesign/design.md DD-R4).
 */
export const BOUNDARY_PAIRS: readonly Pick<TextPair, 'fg' | 'bg'>[] = [
  { fg: light.controlBorder, bg: light.background },
  { fg: light.controlBorder, bg: light.screen },
];

/** Icon glyphs on their backgrounds. Icons need 3:1 (N13); theme.test.ts measures each. */
export const ICON_PAIRS: readonly Pick<TextPair, 'fg' | 'bg'>[] = [
  { fg: light.breakfast, bg: light.background },
  { fg: light.lunch, bg: light.background },
  { fg: light.dinner, bg: light.background },
  { fg: light.accent, bg: light.background }, // tab icons, glyphs on white
  { fg: light.accentInk, bg: light.screen }, // week arrows and Add to groceries, on the page
  { fg: light.onBrand, bg: light.sage }, // the checked checkbox's tick
  { fg: light.onBrand, bg: light.accent }, // the add button's plus
  { fg: light.inkMuted, bg: light.background }, // chevrons and the inactive tab icons
  { fg: light.inkMuted, bg: light.screen },
];
