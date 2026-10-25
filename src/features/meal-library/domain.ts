// Pure library rules (design §3.2, N28): no React, React Native, Supabase or TanStack imports.
// charLength, clampTo, trimField and the counter rule repeat the meals helpers instead of importing
// across features.
import type { MealType } from '@/features/meals/constants';
import type { Tables } from '@/types/database';

import { COPY, FAVORITE_TAG_KEY, LIMITS, MEAL_TYPE_TAG_KEYS } from './constants';

export interface Tag {
  id: string;
  name: string;
  /** The normalized name, as `name_key` stores it (DD44). */
  key: string;
}

export interface Meal {
  id: string;
  name: string;
  description: string | null;
  ingredients: string | null;
  /** Breakfast, lunch or dinner, or none for a meal saved without one (specs/redesign DD-R6). */
  mealType: MealType | null;
  /** The photo's Storage key, or none (design §6.4). */
  imagePath: string | null;
  /** In alphabetical order of tag name (R40.4). */
  tagIds: string[];
  /** `foldForSearch(name)`, computed once per load (N25). */
  searchKey: string;
  /** The description, ingredients and tag names folded the same way, for the wider search (DD-R9). */
  detailKey: string;
  updatedAt: string;
}

export interface Library {
  meals: Meal[];
  tags: Tag[];
  tagsById: ReadonlyMap<string, Tag>;
}

// Rows as `api.ts` selects them (design §3.2). `buildLibrary` checks them at runtime (R14.8).
export type MealRow = Pick<
  Tables<'library_meals'>,
  'id' | 'name' | 'description' | 'ingredients' | 'meal_type' | 'image_path' | 'updated_at'
> & { library_meal_tags: Pick<Tables<'library_meal_tags'>, 'tag_id'>[] };

export type TagRow = Pick<Tables<'library_tags'>, 'id' | 'name' | 'name_key'>;

type RowCheck<Row> = [field: keyof Row & string, valid: (value: unknown) => boolean];

const isString = (v: unknown): v is string => typeof v === 'string';
const isText = (v: unknown) => isString(v) && v !== '';
// The CHECKs allow null or text, never an empty string (R47.2).
const isOptionalText = (v: unknown) => v === null || isText(v);
const isOptionalString = (v: unknown) => v === null || isString(v);
const isLink = (v: unknown) =>
  typeof v === 'object' && v !== null && isString((v as { tag_id?: unknown }).tag_id);

// The backend's types are a promise, not a guarantee, so each field is checked as it arrives
// (R14.8).
const TAG_CHECKS: RowCheck<TagRow>[] = [
  ['id', isString],
  ['name', isText],
  ['name_key', isText],
];

const MEAL_CHECKS: RowCheck<MealRow>[] = [
  ['id', isString],
  ['name', isText],
  ['description', isOptionalText],
  ['ingredients', isOptionalText],
  ['meal_type', isOptionalString],
  ['image_path', isOptionalText],
  ['updated_at', isString],
  ['library_meal_tags', (v) => Array.isArray(v) && v.every(isLink)],
];

const MEAL_TYPE_KEYS: ReadonlySet<string> = new Set<MealType>(['breakfast', 'lunch', 'dinner']);

const isMealType = (v: string | null): v is MealType => v !== null && MEAL_TYPE_KEYS.has(v);

/**
 * The library from its rows (R40.3). A row that breaks the app's expectations is left out and
 * named in `reportKeys` by table, ID and field (R46.9). A link to a tag this load doesn't have is
 * dropped, since a tag created moments ago arrives with the next refetch. Both lists are sorted
 * (R40.4). The legacy Breakfast, Lunch and Dinner tags aren't listed: a meal's type has its own field
 * now (DD-R7). A meal type from a newer build reads as none, and is reported, so the meal still shows.
 */
export function buildLibrary(
  mealRows: MealRow[],
  tagRows: TagRow[],
): { library: Library; reportKeys: string[] } {
  const reportKeys: string[] = [];
  function valid<Row extends { id: unknown }>(table: string, rows: Row[], checks: RowCheck<Row>[]) {
    return rows.filter((row) => {
      const invalid = checks.find(([field, check]) => !check(row[field]));
      if (invalid) {
        reportKeys.push(
          `invalid_library_row:${table}:${isString(row.id) ? row.id : null}:${invalid[0]}`,
        );
      }
      return !invalid;
    });
  }

  const tags: Tag[] = valid('library_tags', tagRows, TAG_CHECKS)
    .filter((row) => !MEAL_TYPE_TAG_KEYS.has(row.name_key))
    .map((row) => ({ id: row.id, name: row.name, key: row.name_key }))
    .sort(compareTags);
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

  const meals: Meal[] = valid('library_meals', mealRows, MEAL_CHECKS)
    .map((row) => {
      if (row.meal_type !== null && !isMealType(row.meal_type)) {
        reportKeys.push(`unknown_meal_type:${row.id}`);
      }
      const mealTags = row.library_meal_tags
        .flatMap(({ tag_id }) => tagsById.get(tag_id) ?? [])
        .sort(compareTags);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        ingredients: row.ingredients,
        mealType: isMealType(row.meal_type) ? row.meal_type : null,
        imagePath: row.image_path,
        tagIds: mealTags.map((tag) => tag.id),
        searchKey: foldForSearch(row.name),
        detailKey: foldForSearch(
          [row.description, row.ingredients, ...mealTags.map((tag) => tag.name)]
            .filter(Boolean)
            .join('\n'),
        ),
        updatedAt: row.updated_at,
      };
    })
    .sort(compareNames);

  return { library: { meals, tags, tagsById }, reportKeys };
}

/** Length in code points, which is what Postgres `char_length` counts, so an emoji is 1, not 2. */
export function charLength(s: string): number {
  return Array.from(s).length;
}

/**
 * The first `max` code points (R42.3). Hermes has no `Intl.Segmenter`, so at the limit this may
 * split an emoji made of several code points, as meals accepts.
 */
export function clampTo(s: string, max: number): string {
  // A string can't have more code points than UTF-16 units, so short text needs no count.
  if (s.length <= max) return s;
  const codePoints = Array.from(s);
  return codePoints.length <= max ? s : codePoints.slice(0, max).join('');
}

/**
 * A field's `maxLength` (DD56). Native input counts UTF-16 units, so the limit is the text's own
 * units plus the characters it has left, recomputed on each change.
 */
export function maxLengthFor(s: string, max: number): number {
  return s.length + (max - charLength(s));
}

/** Characters left before `max`, or `null` while `from` or more remain (R42.3). */
export function charactersLeft(s: string, max: number, from: number): number | null {
  const left = max - charLength(s);
  return left < from ? left : null;
}

// Postgres's `\s`, which the library CHECKs and `name_key` use, is ICU's on the local database. It
// matches everything JavaScript's `\s` (the set trim() strips) does except U+FEFF, plus U+0085
// (meals finding 6) and U+001C–U+001F, which task 16.1 measured.
const EDGE_SPACE = /^[\s\u001c-\u001f\u0085]+|[\s\u001c-\u001f\u0085]+$/g;
const SPACE_RUN = /[\s\u001c-\u001f\u0085]+/g;
// The line breaks the name and tag CHECKs reject (§4.1). CR LF is one break.
const LINE_BREAK = /\r\n|[\r\n\u0085\u2028\u2029]/g;

/** Trims as the database's CHECKs require (R42.4, R47.2). */
export function trimField(s: string): string {
  return s.replace(EDGE_SPACE, '');
}

/** Turns each line break into a space, for the one-line name (R42.2). */
export function oneLine(s: string): string {
  return s.replace(LINE_BREAK, ' ');
}

/**
 * A typed tag name as it's saved (R43.3): trimmed, with each whitespace run one space. That leaves
 * nothing for `name_key`'s `regexp_replace` to change, so the key of the saved name is `tagKey`.
 */
export function cleanTagName(s: string): string {
  return trimField(s).replace(SPACE_RUN, ' ');
}

/** The normalized tag name, as the database's `name_key` computes it (R43.5, DD44, finding 1). */
export function tagKey(s: string): string {
  return cleanTagName(s).toLowerCase();
}

// The combining marks that NFD splits off accented letters (DD54).
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Text folded for search: accents removed, lower case and trimmed (R41.1, DD54). Hermes normalizes
 * through CoreFoundation (finding 2). An engine without `normalize` gets case-only matching
 * instead of an error (OI-22).
 */
export function foldForSearch(s: string): string {
  const unaccented =
    typeof s.normalize === 'function' ? s.normalize('NFD').replace(COMBINING_MARKS, '') : s;
  return trimField(unaccented.toLowerCase());
}

// One collator for all ordering (DD54): the device's language, ignoring case and accents, with
// numbers compared by value. Hermes collates through Foundation (finding 2).
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Alphabetical order (R40.4, K25). Names the collator treats as equal fall back to their exact
 * text, then to ID, so the order never changes between loads.
 */
export function compareNames(
  a: { name: string; id: string },
  b: { name: string; id: string },
): number {
  return collator.compare(a.name, b.name) || byCodeUnits(a.name, b.name) || byCodeUnits(a.id, b.id);
}

/**
 * Tags in alphabetical order (R43.10), except Family Favorite, which leads: it's the household's
 * shortcut to its favourites (specs/redesign DD-R8).
 */
export function compareTags(a: Tag, b: Tag): number {
  const favourite = Number(b.key === FAVORITE_TAG_KEY) - Number(a.key === FAVORITE_TAG_KEY);
  return favourite || compareNames(a, b);
}

export interface MealFilters {
  query: string;
  tagIds: ReadonlySet<string>;
  /** One type, or null for every meal, typed or not. */
  mealType?: MealType | null;
}

/**
 * The meals that match the search, have every selected tag and are of the selected type (R41.1,
 * R41.4–R41.6, K23 as widened by DD-R9). The search looks in the name first, then the description,
 * ingredients and tag names: meals whose names match come first, each run alphabetical. An empty
 * search matches every meal.
 */
export function filterMeals(
  meals: Meal[],
  { query, tagIds, mealType = null }: MealFilters,
): Meal[] {
  const search = foldForSearch(query);
  const required = [...tagIds];
  const candidates = meals.filter(
    (meal) =>
      (mealType === null || meal.mealType === mealType) &&
      required.every((id) => meal.tagIds.includes(id)),
  );
  if (search === '') return candidates;
  const byName = candidates.filter((meal) => meal.searchKey.includes(search));
  const byDetail = candidates.filter(
    (meal) => !meal.searchKey.includes(search) && meal.detailKey.includes(search),
  );
  return [...byName, ...byDetail];
}

/**
 * The library meals most recently planned, newest first, from the planned meals' links (DD-R10).
 * `recentIds` comes newest first and may repeat or name meals that have since been deleted.
 */
export function recentMeals(meals: Meal[], recentIds: string[], limit = 8): Meal[] {
  const byId = new Map(meals.map((meal) => [meal.id, meal]));
  const seen = new Set<string>();
  const recent: Meal[] = [];
  for (const id of recentIds) {
    const meal = byId.get(id);
    if (meal === undefined || seen.has(id)) continue;
    seen.add(id);
    recent.push(meal);
    if (recent.length === limit) break;
  }
  return recent;
}

/**
 * What choosing a meal puts in a slot: the name, then any description on the next line (R45.4,
 * K20). At most 401 characters, inside meals' `ENTRY_MAX` (K21).
 */
export function copiedText({ name, description }: Pick<Meal, 'name' | 'description'>): string {
  return description === null ? name : `${name}\n${description}`;
}

/** A tag chosen in the form: a household tag, or a new one that saving creates (R43.7). */
export type TagChoice = { kind: 'existing'; id: string } | { kind: 'new'; name: string };

/**
 * The form's photo: none, the one the meal has stored, or one just picked on the phone. A picked
 * photo's Storage key is made when it's picked, so a retried save uploads to the same key (DD46).
 */
export type ImageValue =
  | { kind: 'none' }
  | { kind: 'stored'; path: string }
  | { kind: 'picked'; uri: string; path: string };

/** The meal form's fields, as the member typed them. */
export interface FormValues {
  name: string;
  description: string;
  ingredients: string;
  mealType: MealType | null;
  image: ImageValue;
  tags: TagChoice[];
}

export type FormField = 'name' | 'description' | 'ingredients' | 'tags' | 'image';

/** A meal as it's saved: trimmed, with an empty description or ingredients as none (R42.4). */
export interface CleanMeal {
  name: string;
  description: string | null;
  ingredients: string | null;
  mealType: MealType | null;
  imagePath: string | null;
  tags: TagChoice[];
}

/** The Storage key a form's photo saves as, or none. */
export function imagePathOf(image: ImageValue): string | null {
  return image.kind === 'none' ? null : image.path;
}

type MealFields = Omit<CleanMeal, 'tags'>;

/** The writes that save a meal, in this order. Each is safe to repeat (DD46, R46.4). */
export interface SavePlan {
  /** Clean names, one per key, since one upsert can't touch a row twice (finding 1). */
  newTags: string[];
  meal:
    | { kind: 'upsert'; row: { id: string } & MealFields } // a new meal, or Save as new meal
    | { kind: 'update'; id: string; changes: Partial<MealFields> }
    | { kind: 'check'; id: string }; // an edit that changes only tags
  addTags: TagChoice[];
  removeTagIds: string[];
}

// A new tag is known by its key, so two spellings of one name are one tag (R43.5).
const choiceKey = (choice: TagChoice) =>
  choice.kind === 'existing' ? `existing:${choice.id}` : `new:${tagKey(choice.name)}`;

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The name as its CHECK requires: one line and trimmed (R42.2, R42.4). */
const cleanName = (s: string) => trimField(oneLine(s));

/**
 * Where the form starts (R42.6, R42.7). A new meal starts from the trimmed search text, kept to
 * what the name field accepts. An edit starts from the meal with its tags selected, and ignores
 * the search text.
 */
export function formValuesOf(
  meal: Meal | null,
  prefill?: string,
  prefillType: MealType | null = null,
): FormValues {
  if (meal === null) {
    const name = clampTo(cleanName(prefill ?? ''), LIMITS.name);
    return {
      name,
      description: '',
      ingredients: '',
      mealType: prefillType,
      image: { kind: 'none' },
      tags: [],
    };
  }
  return {
    name: meal.name,
    description: meal.description ?? '',
    ingredients: meal.ingredients ?? '',
    mealType: meal.mealType,
    image: meal.imagePath === null ? { kind: 'none' } : { kind: 'stored', path: meal.imagePath },
    tags: meal.tagIds.map((id) => ({ kind: 'existing', id })),
  };
}

/**
 * Adds a typed tag name to the form (R43.4–R43.6), cleaned and kept to the tag limit. A name
 * whose key matches a tag already chosen, or a household tag, selects that tag instead, without
 * an error. The chosen tags are checked first, so a new tag the other member has since created
 * isn't selected twice. Nothing is created until the meal is saved (R43.7).
 */
export function addTypedTag(
  values: FormValues,
  tags: Tag[],
  typed: string,
): {
  values: FormValues;
  result: 'added' | 'selected-existing' | 'already-selected' | 'empty' | 'meal-type';
} {
  const name = cleanTagName(clampTo(typed, LIMITS.tag));
  if (name === '') return { values, result: 'empty' };

  const key = tagKey(name);
  // Breakfast, Lunch and Dinner are the meal type, not tags (DD-R7).
  if (MEAL_TYPE_TAG_KEYS.has(key)) return { values, result: 'meal-type' };
  const keyOf = (choice: TagChoice) =>
    choice.kind === 'new' ? tagKey(choice.name) : tags.find((tag) => tag.id === choice.id)?.key;
  if (values.tags.some((choice) => keyOf(choice) === key)) {
    return { values, result: 'already-selected' };
  }

  const existing = tags.find((tag) => tag.key === key);
  const choice: TagChoice = existing
    ? { kind: 'existing', id: existing.id }
    : { kind: 'new', name };
  return {
    values: { ...values, tags: [...values.tags, choice] },
    result: existing ? 'selected-existing' : 'added',
  };
}

/**
 * Whether the member has changed anything since the form opened (R42.12). Whitespace that saving
 * trims doesn't count, and nor does the order tags were selected in.
 */
export function isDirty(initial: FormValues, current: FormValues): boolean {
  const before = new Set(initial.tags.map(choiceKey));
  const after = new Set(current.tags.map(choiceKey));
  return (
    cleanName(initial.name) !== cleanName(current.name) ||
    trimField(initial.description) !== trimField(current.description) ||
    trimField(initial.ingredients) !== trimField(current.ingredients) ||
    initial.mealType !== current.mealType ||
    imagePathOf(initial.image) !== imagePathOf(current.image) ||
    before.size !== after.size ||
    [...after].some((key) => !before.has(key))
  );
}

/**
 * The meal to save, or the first field that can't be saved (R42.4, R42.5). Every field is trimmed
 * and the name made one line. An empty description or ingredients is saved as none.
 */
export function validateMeal(
  v: FormValues,
): { ok: true; meal: CleanMeal } | { ok: false; field: FormField; message: string } {
  const name = cleanName(v.name);
  if (name === '') return { ok: false, field: 'name', message: COPY.nameRequired };

  const description = trimField(v.description);
  const ingredients = trimField(v.ingredients);
  const fields = [
    ['name', name],
    ['description', description],
    ['ingredients', ingredients],
  ] as const;
  const tooLong = fields.find(([field, value]) => charLength(value) > LIMITS[field]);
  if (tooLong) {
    const [field] = tooLong;
    return { ok: false, field, message: COPY.tooLong(LIMITS[field]) };
  }

  return {
    ok: true,
    meal: {
      name,
      description: description || null,
      ingredients: ingredients || null,
      mealType: v.mealType,
      imagePath: imagePathOf(v.image),
      tags: v.tags,
    },
  };
}

/**
 * What saving `meal` writes (DD46). `base` is the meal as it was when the form opened. With no
 * `base`, a new meal or Save as new meal, every field and tag is written under `mealId`. An edit
 * sends only the fields and tags that differ from `base`, so a change the other member made
 * meanwhile is never written back over (R46.5, as meals DD27). Null when an edit changes nothing
 * (R42.11).
 */
export function planSave(base: Meal | null, meal: CleanMeal, mealId: string): SavePlan | null {
  const { tags, ...fields } = meal;
  const chosen = uniqueBy(tags, choiceKey);
  const newTags = chosen.flatMap((choice) => (choice.kind === 'new' ? [choice.name] : []));

  if (base === null) {
    return {
      newTags,
      meal: { kind: 'upsert', row: { id: mealId, ...fields } },
      addTags: chosen,
      removeTagIds: [],
    };
  }

  const changes: Partial<MealFields> = {
    ...(fields.name !== base.name && { name: fields.name }),
    ...(fields.description !== base.description && { description: fields.description }),
    ...(fields.ingredients !== base.ingredients && { ingredients: fields.ingredients }),
    ...(fields.mealType !== base.mealType && { mealType: fields.mealType }),
    ...(fields.imagePath !== base.imagePath && { imagePath: fields.imagePath }),
  };
  const before = new Set(base.tagIds);
  const kept = new Set(chosen.flatMap((choice) => (choice.kind === 'existing' ? [choice.id] : [])));
  const addTags = chosen.filter((choice) => choice.kind === 'new' || !before.has(choice.id));
  const removeTagIds = base.tagIds.filter((id) => !kept.has(id));

  const fieldsChanged = Object.keys(changes).length > 0;
  if (!fieldsChanged && addTags.length === 0 && removeTagIds.length === 0) return null;
  return {
    newTags,
    meal: fieldsChanged ? { kind: 'update', id: mealId, changes } : { kind: 'check', id: mealId },
    addTags,
    removeTagIds,
  };
}

// The named CHECKs (§4.1) and the field whose value each rejects (DD58).
const CONSTRAINT_FIELDS = new Map<string, FormField>([
  ['library_meals_name_check', 'name'],
  ['library_meals_description_check', 'description'],
  ['library_meals_ingredients_check', 'ingredients'],
  ['library_meals_image_path_check', 'image'],
  ['library_tags_name_check', 'tags'],
]);

/** The form field a rejected value came from, from the CHECK that rejected it (R42.10, DD58). */
export function constraintField(constraint: string | undefined): FormField | null {
  return constraint === undefined ? null : (CONSTRAINT_FIELDS.get(constraint) ?? null);
}
