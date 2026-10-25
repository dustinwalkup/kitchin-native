// Limits, starter tags and copy for the Meal Library (design §3.1).

/** The database's limits, in characters (K21, R47.2, R47.3). */
export const LIMITS = { name: 100, description: 300, ingredients: 2000, tag: 30 } as const;

/** The characters-left counter shows once fewer than this remain (R42.3). */
export const COUNTER_FROM = { name: 20, description: 50, ingredients: 50 } as const;

/**
 * What `private.add_starter_tags` creates (R43.8, as redesigned: the meal type has its own field, so
 * Breakfast, Lunch and Dinner are no longer tags). The database owns them; tests and the seed check
 * this list.
 */
export const STARTER_TAGS = [
  'Quick & Easy',
  'Family Favorite',
  'High Protein',
  'Meal Prep',
] as const;

/**
 * Tag names that are meal types. Households provisioned before the redesign have these as starter
 * tags; the migration copied them into each meal's type where it could, and the app no longer lists
 * them as tags, so a type is never shown twice (specs/redesign/design.md DD-R7). Their rows stay.
 */
export const MEAL_TYPE_TAG_KEYS: ReadonlySet<string> = new Set(['breakfast', 'lunch', 'dinner']);

/** The tag the library's Favorites shortcut filters by, when the household has it (DD-R8). */
export const FAVORITE_TAG_KEY = 'family favorite';

/** The meal-images Storage bucket (design §6.4). */
export const IMAGE_BUCKET = 'meal-images';

/** A photo's longest side once resized, and its JPEG quality: sharp on a phone, well under 1 MB. */
export const IMAGE_MAX_SIDE = 1200;
export const IMAGE_QUALITY = 0.75;

/** How long a signed photo URL lasts, and how long before that the app signs a fresh one. */
export const IMAGE_URL_SECONDS = 60 * 60;
export const IMAGE_URL_REFRESH_MS = 45 * 60 * 1000;

export const COPY = {
  title: 'Meal Library', // R40.2
  tabLabel: 'Library', // R40.1
  search: 'Search meals', // R41.1
  addPhoto: 'Add photo',
  changePhoto: 'Change photo',
  removePhoto: 'Remove photo',
  takePhoto: 'Take photo',
  choosePhoto: 'Choose from library',
  photoError: "Couldn't add that photo. Try another.",
  photoPermission: 'Allow camera access in Settings to take a photo.',
  mealType: 'Meal type',
  recentlyUsed: 'Recently used',
  allMeals: 'All',
  typeTagReserved: "That's a meal type. Choose it under Meal type.",
  filter: 'Filter by tags', // R41.2
  clearFilters: 'Clear filters', // R41.7
  addMeal: 'Add meal', // R40.6
  addNewMeal: '+ Add new meal', // R45.8
  choose: 'Choose from Meal Library', // R45.1
  emptyTitle: 'No meals yet', // R40.9
  emptyBody: 'Save the meals you make often, then choose them when you plan the week.',
  noMatch: 'No matching meals', // R41.8
  noMatchBody: 'Try another search, or clear the filters.',
  loadError: "Couldn't load meals", // R40.10
  justSaved: 'Just saved', // DD55
  saved: 'Meal saved', // R42.9
  deleted: 'Meal deleted', // R44.3
  nameRequired: 'Enter a meal name', // R42.5
  tooLong: (max: number) => `Shorten this to ${max} characters`, // design §3.2
  fieldRejected: "This couldn't be saved. Check it and try again.", // R42.10, DD58
  offline: "You're offline. Try again when you're connected", // R46.3
  forbidden: "You don't have access to that", // R14.3
  saveError: "Couldn't save this meal", // R42.10
  deleteError: "Couldn't delete this meal", // R44.4
  deletedElsewhere: 'This meal was deleted on another device', // R46.7
  saveAsNew: 'Save as new meal', // R46.7
  discardTitle: 'Discard changes?', // R42.12
  deleteTitle: (name: string) => `Delete “${name}”?`, // R44.2
  deleteBody: "It's removed from the library. Meals already planned won't change.", // R44.2
} as const;
