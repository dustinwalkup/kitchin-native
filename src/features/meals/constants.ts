// Labels, order and day accents from kitchin-app/src/lib/constants.ts `MEAL_TYPES` and `DAYS`
// (design §3.3.1). The legacy icons and colour classes become SF Symbols and theme tokens (DD32).
import type { SFSymbol } from 'expo-symbols';

import type { ColourToken } from '@/ui/theme';

/** A meal type, as stored in `meal_entries.meal_type` (R38.3). */
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface MealTypeInfo {
  key: MealType;
  label: string;
  symbol: SFSymbol;
  /** The icon's colour, on `tint`. Each pair passes 3:1 (DD32, N13). */
  glyph: ColourToken;
  tint: ColourToken;
}

/** Every meal type, in the fixed slot order (R30.2, R36.2). */
export const MEAL_TYPES: readonly MealTypeInfo[] = [
  {
    key: 'breakfast',
    label: 'Breakfast',
    symbol: 'cup.and.saucer.fill',
    glyph: 'accent',
    tint: 'accentSoft',
  },
  { key: 'lunch', label: 'Lunch', symbol: 'sun.max.fill', glyph: 'ink', tint: 'secondarySoft' },
  { key: 'dinner', label: 'Dinner', symbol: 'moon.fill', glyph: 'primary', tint: 'primarySoft' },
];

/** Each day's accent edge, Monday first (R36.3). Decorative, so not contrast-checked (R36.4). */
export const DAY_ACCENTS: readonly ColourToken[] = [
  'primary',
  'ink',
  'cactus',
  'secondary',
  'tertiary',
  'sand',
  'accent',
];

/** Monday first. The static parts of day and slot test IDs, which never contain meal text (R26.7). */
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** The database's limit on `meal_entries.body`, in characters (R32.5, R38.3). */
export const ENTRY_MAX = 500;

/** The characters-left counter shows once fewer than this remain (R32.5). */
export const COUNTER_FROM = 50;

export const COPY = {
  loadError: "Couldn't load meals", // R30.10
  saveError: "Couldn't save that meal", // R35.5
  placeholder: (label: string) => `Add ${label.toLowerCase()}`, // R30.4
  today: 'Today', // R30.6
  addToGroceries: 'Add to groceries', // R37.1
} as const;
