// Limits, starter tags and copy for the Meal Library (design §3.1).

/** The database's limits, in characters (K21, R47.2, R47.3). */
export const LIMITS = { name: 100, description: 300, ingredients: 2000, tag: 30 } as const;

/** The characters-left counter shows once fewer than this remain (R42.3). */
export const COUNTER_FROM = { name: 20, description: 50, ingredients: 50 } as const;

/**
 * What `private.add_starter_tags` creates (R43.8). The database owns them; tests and the seed
 * check this list.
 */
export const STARTER_TAGS = [
  'Quick & Easy',
  'Family Favorite',
  'High Protein',
  'Breakfast',
  'Lunch',
  'Dinner',
  'Meal Prep',
] as const;

export const COPY = {
  title: 'Meal Library', // R40.2
  libraryButton: 'Library', // R40.1
  search: 'Search meals', // R41.1
  filter: 'Filter by tags', // R41.2
  clearFilters: 'Clear filters', // R41.7
  addMeal: 'Add meal', // R40.6
  addNewMeal: '+ Add new meal', // R45.8
  choose: 'Choose from Meal Library', // R45.1
  emptyTitle: 'No saved meals yet', // R40.9
  emptyBody: 'Save the meals you make often, then choose them when you plan the week.',
  noMatch: 'No meals match', // R41.8
  loadError: "Couldn't load meals", // R40.10
  justSaved: 'Just saved', // DD55
  saved: 'Meal saved', // R42.9
  deleted: 'Meal deleted', // R44.3
  nameRequired: 'Enter a meal name', // R42.5
  tooLong: (max: number) => `Shorten this to ${max} characters`, // design §3.2
  fieldRejected: "This couldn't be saved. Check it and try again.", // R42.10, DD58
  offline: "You're offline. Try again when you're connected", // R46.3
  saveError: "Couldn't save this meal", // R42.10
  deleteError: "Couldn't delete this meal", // R44.4
  deletedElsewhere: 'This meal was deleted on another device', // R46.7
  saveAsNew: 'Save as new meal', // R46.7
  discardTitle: 'Discard changes?', // R42.12
  deleteTitle: (name: string) => `Delete “${name}”?`, // R44.2
  deleteBody: "It's removed from the library. Meals already planned won't change.", // R44.2
} as const;
