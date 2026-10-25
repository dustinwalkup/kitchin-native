// Pure grocery rules (design §3.5.1, N17): no React, React Native, Supabase or TanStack imports.
import type { Tables } from '@/types/database';

import { CATEGORIES, COMMON_ITEMS, type CategoryKey, POPULAR_ITEMS } from './constants';

export interface GroceryItem {
  id: string;
  listId: string;
  name: string;
  category: CategoryKey;
  quantity: string | null;
  isChecked: boolean;
  checkedAt: string | null;
  createdAt: string;
}

/** A `grocery_items` row as `api.ts` selects it (design §3.5.2). `parseItemRow` checks it at runtime. */
export type GroceryItemRow = Pick<
  Tables<'grocery_items'>,
  'id' | 'list_id' | 'name' | 'category' | 'quantity' | 'is_checked' | 'checked_at' | 'created_at'
>;

export interface Section {
  category: CategoryKey;
  openCount: number;
  items: GroceryItem[];
}

export interface Progress {
  checked: number;
  total: number;
  percent: number | null;
}

export interface QuickAddChip {
  name: string;
  category: CategoryKey;
  /** An open item already has this name (R6.2). */
  disabled: boolean;
}

export type ItemInputResult =
  | { ok: true; name: string; quantity: string | null }
  | { ok: false; field: 'name' | 'quantity'; message: string };

export type ParsedItemRow =
  | { ok: true; item: GroceryItem; unknownCategory: boolean }
  | { ok: false; id: string | null; field: keyof GroceryItemRow };

// The database's CHECK limits on grocery_items (R5.4, R8.2, R21.2).
const NAME_MAX = 200;
export const QUANTITY_MAX = 50;

/** What counts as the same name: the database's `lower(name)` on an already trimmed name (DD16). */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Length in code points, which is what Postgres `char_length` counts, so an emoji is 1, not 2. */
export function charLength(s: string): number {
  return Array.from(s).length;
}

/** Trims both fields and checks them against the database limits; an empty quantity is null (R5.3, R5.4, R8.2). */
export function validateItemInput(input: { name: string; quantity: string }): ItemInputResult {
  const name = input.name.trim();
  if (name === '') return { ok: false, field: 'name', message: 'Enter a name.' };
  if (charLength(name) > NAME_MAX) {
    return {
      ok: false,
      field: 'name',
      message: `Keep the name to ${NAME_MAX} characters or fewer.`,
    };
  }

  const quantity = input.quantity.trim();
  if (charLength(quantity) > QUANTITY_MAX) {
    return {
      ok: false,
      field: 'quantity',
      message: `Keep the quantity to ${QUANTITY_MAX} characters or fewer.`,
    };
  }

  return { ok: true, name, quantity: quantity === '' ? null : quantity };
}

const COMMON_ITEM_CATEGORIES = new Map(
  CATEGORIES.flatMap(({ key }) =>
    COMMON_ITEMS[key].map((name) => [normalizeName(name), key] as const),
  ),
);

/** The common item's category when the name matches one, otherwise Other (R5.2). */
export function suggestCategory(name: string): CategoryKey {
  return COMMON_ITEM_CATEGORIES.get(normalizeName(name)) ?? 'other';
}

function openNames(items: GroceryItem[]): Set<string> {
  return new Set(items.filter((i) => !i.isChecked).map((i) => normalizeName(i.name)));
}

/** Whether an open item, in any category, already has this normalized name (R5.6, R5.7). */
export function hasOpenItemNamed(items: GroceryItem[], name: string): boolean {
  return openNames(items).has(normalizeName(name));
}

/** The open item that `hasOpenItemNamed` finds, so a message can use the name as it's listed. */
export function findOpenItemNamed(items: GroceryItem[], name: string): GroceryItem | undefined {
  const normalized = normalizeName(name);
  return items.find((i) => !i.isChecked && normalizeName(i.name) === normalized);
}

/** A section as the list draws it: its rows, or none while collapsed. */
export interface VisibleSection extends Section {
  data: GroceryItem[];
  collapsed: boolean;
}

/**
 * The sections the list draws (specs/redesign/design.md §4.1). Hiding checked items leaves them out
 * of the rows, and a section whose items are all checked goes too; a collapsed section keeps its
 * header with no rows. Counts and progress still come from every item, so neither changes.
 */
export function visibleSections(
  sections: Section[],
  { hideChecked, collapsed }: { hideChecked: boolean; collapsed: ReadonlySet<CategoryKey> },
): VisibleSection[] {
  return sections.flatMap((section) => {
    const shown = hideChecked ? section.items.filter((i) => !i.isChecked) : section.items;
    if (shown.length === 0) return [];
    const isCollapsed = collapsed.has(section.category);
    return [{ ...section, data: isCollapsed ? [] : shown, collapsed: isCollapsed }];
  });
}

// Open before checked, then oldest first, then by id so the order is stable (R4.4). createdAt values
// are compared as strings: in PostgREST's ISO format that's time order, whatever the number of
// fractional digits, because '+' sorts before '.' and both sort before the digits.
function compareItems(a: GroceryItem, b: GroceryItem): number {
  if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** One section per category that has items, in the fixed order (R4.1–R4.4). */
export function buildSections(items: GroceryItem[]): Section[] {
  return CATEGORIES.flatMap(({ key }) => {
    const sectionItems = items.filter((i) => i.category === key).sort(compareItems);
    if (sectionItems.length === 0) return [];
    const openCount = sectionItems.filter((i) => !i.isChecked).length;
    return [{ category: key, openCount, items: sectionItems }];
  });
}

/** Checked out of total, and `round(checked ÷ total × 100)`; no percentage for an empty list (R4.7, R4.8). */
export function progress(items: GroceryItem[]): Progress {
  const checked = items.filter((i) => i.isChecked).length;
  const total = items.length;
  return { checked, total, percent: total === 0 ? null : Math.round((checked / total) * 100) };
}

/**
 * Which checked items Uncheck all reopens and which it leaves checked. Only one open item may have a
 * name (R5.6), so an item stays checked while an open item has its name, and of several checked
 * items with one name only the newest reopens (R10.7).
 */
export function planUncheckAll(items: GroceryItem[]): { uncheckIds: string[]; keepIds: string[] } {
  const taken = openNames(items);
  const uncheckIds: string[] = [];
  const keepIds: string[] = [];
  // Newest first, so the newest of each name takes it.
  const checked = items.filter((i) => i.isChecked).sort((a, b) => compareItems(b, a));
  for (const item of checked) {
    const name = normalizeName(item.name);
    if (taken.has(name)) {
      keepIds.push(item.id);
    } else {
      taken.add(name);
      uncheckIds.push(item.id);
    }
  }
  return { uncheckIds, keepIds };
}

// The common items in catalogue order, each with its category.
const CATALOGUE = CATEGORIES.flatMap(({ key }) =>
  COMMON_ITEMS[key].map((name) => ({ name, category: key, key: normalizeName(name) })),
);

/** How many suggestions a typed name gets, so the chips stay one or two rows above the keyboard. */
export const SUGGESTION_LIMIT = 8;

/**
 * The add sheet's quick-add chips (R6.1 as redesigned, specs/redesign/design.md §4.2). While a name
 * is typed, the common items that contain it, those that start with it first. Otherwise the picked
 * category's common items, or with none picked the popular staples. A chip is disabled while an open
 * item has its name (R6.2).
 */
export function quickAddChips(
  items: GroceryItem[],
  { query, category }: { query: string; category: CategoryKey | null },
): QuickAddChip[] {
  const open = openNames(items);
  const typed = normalizeName(query);
  let entries: typeof CATALOGUE;
  if (typed !== '') {
    const matches = CATALOGUE.filter((entry) => entry.key.includes(typed));
    entries = [
      ...matches.filter((entry) => entry.key.startsWith(typed)),
      ...matches.filter((entry) => !entry.key.startsWith(typed)),
    ].slice(0, SUGGESTION_LIMIT);
  } else if (category !== null) {
    entries = CATALOGUE.filter((entry) => entry.category === category);
  } else {
    const popular = new Set(POPULAR_ITEMS.map(normalizeName));
    entries = CATALOGUE.filter((entry) => popular.has(entry.key));
  }
  return entries.map(({ name, category: key }) => ({
    name,
    category: key,
    disabled: open.has(normalizeName(name)),
  }));
}

// A whole number at the start, not part of a decimal, fraction or range: "2", "2 lbs", "12 pack".
const LEADING_COUNT = /^(\d{1,3})(?![\d.,/-])(.*)$/s;

/** Quantities stop at 999, so a step never adds a digit past what the row has room for. */
export const STEP_MAX = 999;

/**
 * The quantity one step up or down (specs/redesign/design.md §4.1). Only a leading whole number
 * moves, so "2 lbs" becomes "3 lbs" and the unit stays as typed. No quantity counts as one, so + makes
 * it "2". Undefined when the quantity can't step that way: below 1, past `STEP_MAX`, or text with no
 * leading count, such as "a bunch" or "1.5 kg", which only the editor changes.
 */
export function stepQuantity(quantity: string | null, delta: 1 | -1): string | undefined {
  const match = LEADING_COUNT.exec(quantity ?? '1');
  if (match === null) return undefined;
  const next = Number(match[1]) + delta;
  if (next < 1 || next > STEP_MAX) return undefined;
  return `${next}${match[2]}`;
}

/** Whether a row shows − and + for its quantity: it has one, and it starts with a count. */
export function isSteppable(quantity: string | null): boolean {
  return quantity !== null && LEADING_COUNT.test(quantity);
}

const CATEGORY_KEYS = new Set<string>(CATEGORIES.map((c) => c.key));

function isCategoryKey(value: string): value is CategoryKey {
  return CATEGORY_KEYS.has(value);
}

const isString = (v: unknown) => typeof v === 'string';
const isStringOrNull = (v: unknown) => v === null || typeof v === 'string';

// The backend's types are a promise, not a guarantee, so each field is checked as it arrives (R14.8).
const ROW_CHECKS: [keyof GroceryItemRow, (v: unknown) => boolean][] = [
  ['id', isString],
  ['list_id', isString],
  ['name', isString],
  ['category', isString],
  ['quantity', isStringOrNull],
  ['is_checked', (v) => typeof v === 'boolean'],
  ['checked_at', isStringOrNull],
  ['created_at', isString],
];

/**
 * Maps a row to a `GroceryItem`. An unknown category is shown under Other and flagged (R14.7); a row
 * with a missing or mistyped field is invalid, naming the first such field (R14.8).
 */
export function parseItemRow(row: GroceryItemRow): ParsedItemRow {
  const invalid = ROW_CHECKS.find(([field, check]) => !check(row[field]));
  if (invalid) return { ok: false, id: isString(row.id) ? row.id : null, field: invalid[0] };

  const unknownCategory = !isCategoryKey(row.category);
  return {
    ok: true,
    unknownCategory,
    item: {
      id: row.id,
      listId: row.list_id,
      name: row.name,
      category: isCategoryKey(row.category) ? row.category : 'other',
      quantity: row.quantity,
      isChecked: row.is_checked,
      checkedAt: row.checked_at,
      createdAt: row.created_at,
    },
  };
}
