import type { MealType } from '@/features/meals/constants';

// Values one screen leaves for the next (design §3.6, DD51). Route params never carry household
// content, so the name and type to start a new meal with, and the meal just saved, pass through here
// instead. The plan sheet saves a chosen meal itself, so no pick is handed back to Meals any more
// (specs/redesign/design.md §5.4). They live in memory only and never reach storage, routes or reports
// (R26.4).

/** One value left for another screen. `read` doesn't consume it; the reader clears what it applied. */
export interface Handoff<T> {
  set(value: T): void;
  read(): { id: number; value: T } | null;
  clear(): void;
}

// Shared by every hand-off and never reset, so an `id` is never reused. A reader remembers the last
// `id` it applied and ignores a repeat, so a development double-invoke or a second focus event
// can't apply a value twice.
let lastId = 0;

function createHandoff<T>(): Handoff<T> {
  let entry: { id: number; value: T } | null = null;
  return {
    set(value) {
      lastId += 1;
      entry = { id: lastId, value };
    },
    read: () => entry,
    clear() {
      entry = null;
    },
  };
}

/** The search text to start a new meal's name with. Set or cleared before `/meal-form` opens (R42.6). */
export const newMealName = createHandoff<string>();

/** The type to start a new meal with: the slot's, when the plan sheet adds one (DD-R6). */
export const newMealType = createHandoff<MealType>();

/** The meal the form just saved or deleted, for the screen it returns to (R42.9, R44.3, DD55). */
export const lastSaved = createHandoff<{ mealId: string; kind: 'saved' | 'deleted' }>();
