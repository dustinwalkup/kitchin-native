import type { MealType } from '@/features/meals/constants';
import type { IsoDate } from '@/lib/calendar';

// Values one screen leaves for the next (design §3.6, DD51). Route params never carry household
// content, so the name to start a new meal with, the meal just saved and the meal chosen for a slot
// pass through here instead. They live in memory only and never reach storage, routes or reports
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

/** The meal the form just saved or deleted, for the screen it returns to (R42.9, R44.3, DD55). */
export const lastSaved = createHandoff<{ mealId: string; kind: 'saved' | 'deleted' }>();

/** The meal the picker chose for a slot, for Meals to save when it regains focus (R45.3). */
export const mealPick = createHandoff<{ date: IsoDate; mealType: MealType; text: string }>();
