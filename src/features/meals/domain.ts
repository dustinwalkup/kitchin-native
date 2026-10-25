// Pure meal rules (design §3.3.2, N23): no React, React Native, Supabase or TanStack imports.
import { parseIsoDate, weekDates, weekday, type IsoDate } from '@/lib/calendar';
import type { Tables } from '@/types/database';

import { COUNTER_FROM, ENTRY_MAX, MEAL_TYPES, type MealType } from './constants';

export interface MealEntry {
  id: string;
  date: IsoDate;
  mealType: MealType;
  body: string;
  /**
   * The library meal the text was chosen from, or null for text typed in. The text is the entry's
   * own copy, so the library meal changing never changes it (K19, specs/redesign DD-R10).
   */
  libraryMealId: string | null;
  updatedAt: string;
}

/** A `meal_entries` row as `api.ts` selects it (design §3.3.3). `parseEntryRow` checks it at runtime. */
export type MealEntryRow = Pick<
  Tables<'meal_entries'>,
  'id' | 'meal_date' | 'meal_type' | 'body' | 'library_meal_id' | 'updated_at'
>;

export interface Slot {
  date: IsoDate;
  mealType: MealType;
  entry: MealEntry | null;
}

export interface Day {
  date: IsoDate;
  /** 0 = Monday (K10). */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  slots: Slot[];
  /** How many of the day's slots have an entry (R30.5). */
  planned: number;
}

export type ParsedEntryRow =
  { ok: true; entry: MealEntry } | { ok: false; id: string | null; field: keyof MealEntryRow };

export type SlotChange = { kind: 'none' } | { kind: 'save'; body: string } | { kind: 'clear' };

const slotKey = (date: string, mealType: MealType) => `${date}|${mealType}`;

/** Seven days from `weekStart`, each with a slot per meal type in the fixed order (R30.1, R30.2, R30.5). */
export function buildWeek(weekStart: IsoDate, entries: MealEntry[]): Day[] {
  // Entries outside the week have no slot to look them up, so they're ignored.
  const bySlot = new Map(entries.map((e) => [slotKey(e.date, e.mealType), e]));
  return weekDates(weekStart).map((date) => {
    const slots = MEAL_TYPES.map(({ key }) => ({
      date,
      mealType: key,
      entry: bySlot.get(slotKey(date, key)) ?? null,
    }));
    return {
      date,
      weekday: weekday(date),
      slots,
      planned: slots.filter((s) => s.entry !== null).length,
    };
  });
}

const MEAL_TYPE_KEYS = new Set<string>(MEAL_TYPES.map((t) => t.key));

const isString = (v: unknown) => typeof v === 'string';

// The backend's types are a promise, not a guarantee, so each field is checked as it arrives (R14.8).
// A meal type from a newer build fails here, so its entries are left out (R35.7).
const ROW_CHECKS: [keyof MealEntryRow, (v: unknown) => boolean][] = [
  ['id', isString],
  ['meal_date', (v) => isString(v) && parseIsoDate(v) !== null],
  ['meal_type', (v) => isString(v) && MEAL_TYPE_KEYS.has(v)],
  ['body', (v) => isString(v) && v !== ''],
  ['library_meal_id', (v) => v === null || isString(v)],
  ['updated_at', isString],
];

/** Maps a row to a `MealEntry`, or names the first missing or invalid field (R14.8, R35.7). */
export function parseEntryRow(row: MealEntryRow): ParsedEntryRow {
  const invalid = ROW_CHECKS.find(([field, check]) => !check(row[field]));
  if (invalid) return { ok: false, id: isString(row.id) ? row.id : null, field: invalid[0] };

  return {
    ok: true,
    entry: {
      id: row.id,
      date: row.meal_date as IsoDate,
      mealType: row.meal_type as MealType,
      body: row.body,
      libraryMealId: row.library_meal_id,
      updatedAt: row.updated_at,
    },
  };
}

/** Length in code points, which is what Postgres `char_length` counts, so an emoji is 1, not 2. */
export function charLength(s: string): number {
  return Array.from(s).length;
}

/**
 * The first `ENTRY_MAX` code points (R32.5, edge case 13). Hermes has no `Intl.Segmenter`, so at the
 * limit this may split an emoji made of several code points, which is accepted (design §3.3.2).
 */
export function clampEntry(text: string): string {
  // A string can't have more code points than UTF-16 units, so short text needs no count.
  if (text.length <= ENTRY_MAX) return text;
  const codePoints = Array.from(text);
  return codePoints.length <= ENTRY_MAX ? text : codePoints.slice(0, ENTRY_MAX).join('');
}

/** Characters left before the limit, or `null` while `COUNTER_FROM` or more remain (R32.5). */
export function charactersLeft(text: string): number | null {
  const left = ENTRY_MAX - charLength(text);
  return left < COUNTER_FROM ? left : null;
}

// `\s` is the set trim() strips. U+0085 is the one character that Postgres's `\s`, which the body
// CHECK uses, matches and trim() keeps (finding 6).
const EDGE_SPACE = /^[\s\u0085]+|[\s\u0085]+$/g;

/** Trims as the database's body CHECK requires (R32.4, R38.3). */
export function trimEntry(s: string): string {
  return s.replace(EDGE_SPACE, '');
}

/**
 * What to send when an editor commits. `base` is the slot's text when editing began, so a draft the
 * member didn't change never writes over the other member's newer save (R32.7, DD27).
 */
export function slotChange(base: string, draft: string): SlotChange {
  const body = trimEntry(draft);
  if (body === base) return { kind: 'none' };
  if (body === '') return { kind: 'clear' }; // R33.1
  return { kind: 'save', body };
}
