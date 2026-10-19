import type { CategoryKey } from '@/features/groceries/constants';

// The only file allowed to hold colour literals (R16.7). Components read these tokens.

// The legacy desert palette, copied exactly from SPEC §4.6 (R16.1). Never change a value to fix
// contrast (N13): TEXT_PAIRS limits where each colour may carry text instead.
const palette = {
  primary: '#3d8b82', // desert teal
  secondary: '#f2a6b3', // sunset blush
  tertiary: '#aabba1', // sagebrush
  accent: '#d16c48', // terracotta clay
  sand: '#eed6c4', // pueblo sand
  cactus: '#ce5a67', // cactus flower
  ink: '#2b3a42', // night horizon
} as const;

interface BadgePair {
  bg: string;
  fg: string;
}

const light = {
  ...palette,
  background: '#ffffff',
  screen: '#faf3ed',
  text: '#0a0a0a',
  border: '#e5e5e5',
  destructive: '#e7000b',
  inkMuted: '#606b71', // secondary text, checked items, empty states (DD19)
  controlBorder: '#80898e', // input and checkbox outlines
  onBrand: '#ffffff', // only with fontWeight '700' (DD19)
  primarySoft: '#ecf3f3',
  secondarySoft: '#fcedf0',
  accentSoft: '#faf0ed',
  cactusSoft: '#f5dee1',
  // Tailwind 100 backgrounds with 800 text (R16.4).
  category: {
    produce: { bg: '#dcfce7', fg: '#166534' },
    meat: { bg: '#fee2e2', fg: '#991b1b' },
    dairy: { bg: '#dbeafe', fg: '#1e40af' },
    pantry: { bg: '#fef9c3', fg: '#854d0e' },
    frozen: { bg: '#cffafe', fg: '#155e75' },
    bakery: { bg: '#ffedd5', fg: '#9a3412' },
    other: { bg: '#f3f4f6', fg: '#1f2937' },
  } satisfies Record<CategoryKey, BadgePair>,
  radius: { base: 10, card: 14 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
} as const;

export type Theme = typeof light;

/** The name of a theme token that holds a single colour. */
export type ColourToken = { [K in keyof Theme]: Theme[K] extends string ? K : never }[keyof Theme];

// The MVP is light-only (R16.6). Dark stays equal to light until a dark palette is designed.
export const themes = { light, dark: light } as const;

/**
 * Tokens that are a palette colour at `alpha` over white, stored as opaque hex because React
 * Native has no `bg-primary/10` syntax. theme.test.ts recomputes each one.
 */
export const TINTS = {
  screen: { source: 'sand', alpha: 0.3 },
  inkMuted: { source: 'ink', alpha: 0.75 },
  controlBorder: { source: 'ink', alpha: 0.6 },
  primarySoft: { source: 'primary', alpha: 0.1 },
  secondarySoft: { source: 'secondary', alpha: 0.2 },
  accentSoft: { source: 'accent', alpha: 0.1 },
  cactusSoft: { source: 'cactus', alpha: 0.2 },
} as const satisfies { [K in keyof Theme]?: { source: keyof typeof palette; alpha: number } };

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
  { fg: light.text, bg: light.screen, min: 4.5 },
  { fg: light.inkMuted, bg: light.background, min: 4.5 },
  { fg: light.inkMuted, bg: light.screen, min: 4.5 },
  // Logo and the checked checkbox's icon.
  { fg: light.onBrand, bg: light.primary, min: 3, bold: true },
  // Primary buttons and selected chips.
  { fg: light.onBrand, bg: light.cactus, min: 3, bold: true },
  // Reserved for Meals.
  { fg: light.onBrand, bg: light.accent, min: 3, bold: true },
  // The swipe Delete action.
  { fg: light.onBrand, bg: light.destructive, min: 4.5 },
  // The offline banner, toasts and the DEV badge.
  { fg: light.onBrand, bg: light.ink, min: 4.5 },
  // TextField errors. 4.34:1 on screen, so error text is always bold.
  { fg: light.destructive, bg: light.background, min: 3, bold: true },
  { fg: light.destructive, bg: light.screen, min: 3, bold: true },
  // Progress percentage and the active tab label.
  { fg: light.cactus, bg: light.screen, min: 3, bold: true },
  { fg: light.cactus, bg: light.background, min: 3, bold: true },
  { fg: light.primary, bg: light.screen, min: 3, bold: true },
  ...Object.values(light.category).map(({ fg, bg }) => ({ fg, bg, min: 4.5 as const })),
];

/**
 * Outlines that are a control's only visible boundary need 3:1 (N13). `tertiary` card borders
 * (2.03:1) are decorative and never a control's only boundary.
 */
export const BOUNDARY_PAIRS: readonly Pick<TextPair, 'fg' | 'bg'>[] = [
  { fg: light.controlBorder, bg: light.background },
  { fg: light.controlBorder, bg: light.screen },
];
