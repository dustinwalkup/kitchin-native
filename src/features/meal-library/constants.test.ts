import { ENTRY_MAX } from '@/features/meals/constants';

import {
  COPY,
  COUNTER_FROM,
  FAVORITE_TAG_KEY,
  IMAGE_BUCKET,
  IMAGE_MAX_SIDE,
  IMAGE_QUALITY,
  IMAGE_URL_REFRESH_MS,
  IMAGE_URL_SECONDS,
  LIMITS,
  MEAL_TYPE_TAG_KEYS,
  STARTER_TAGS,
} from './constants';
import { charLength, cleanTagName, tagKey } from './domain';

describe('limits', () => {
  it('U-LDOM-01 matches the database limits, with counters below 20, 50 and 50 left', () => {
    expect(LIMITS).toEqual({ name: 100, description: 300, ingredients: 2000, tag: 30 });
    expect(COUNTER_FROM).toEqual({ name: 20, description: 50, ingredients: 50 });
  });

  it('U-LDOM-01 fits a full name, a line break and a full description in a slot (K21)', () => {
    expect(LIMITS.name + 1 + LIMITS.description).toBeLessThanOrEqual(ENTRY_MAX);
  });
});

describe('STARTER_TAGS', () => {
  it("U-LDOM-01 lists the four starter tags in the migration's order", () => {
    expect(STARTER_TAGS).toEqual(['Quick & Easy', 'Family Favorite', 'High Protein', 'Meal Prep']);
  });

  it('U-LDOM-01 holds clean tag names within the limit, each with its own key', () => {
    for (const name of STARTER_TAGS) {
      expect(cleanTagName(name)).toBe(name);
      expect(charLength(name)).toBeLessThanOrEqual(LIMITS.tag);
    }
    expect(new Set(STARTER_TAGS.map(tagKey)).size).toBe(STARTER_TAGS.length);
  });

  it('DD-R7 holds no meal type, and DD-R8 holds the favourites tag', () => {
    const keys = STARTER_TAGS.map(tagKey);
    expect(keys.filter((key) => MEAL_TYPE_TAG_KEYS.has(key))).toEqual([]);
    expect(keys).toContain(FAVORITE_TAG_KEY);
  });
});

describe('MEAL_TYPE_TAG_KEYS', () => {
  it('DD-R7 names the three legacy type tags by key', () => {
    expect([...MEAL_TYPE_TAG_KEYS]).toEqual(['breakfast', 'lunch', 'dinner']);
    for (const key of MEAL_TYPE_TAG_KEYS) expect(tagKey(key)).toBe(key);
  });
});

describe('photos', () => {
  it('design §6.5 resizes to 1200 px at JPEG 75% in the meal-images bucket', () => {
    expect(IMAGE_BUCKET).toBe('meal-images');
    expect(IMAGE_MAX_SIDE).toBe(1200);
    expect(IMAGE_QUALITY).toBe(0.75);
  });

  it('design §6.5 signs URLs for an hour and signs afresh before they expire', () => {
    expect(IMAGE_URL_SECONDS).toBe(3600);
    expect(IMAGE_URL_REFRESH_MS).toBe(45 * 60 * 1000);
    expect(IMAGE_URL_REFRESH_MS).toBeLessThan(IMAGE_URL_SECONDS * 1000);
  });
});

describe('COPY', () => {
  it('has the wording the requirements give', () => {
    expect(COPY).toMatchObject({
      title: 'Meal Library',
      tabLabel: 'Library',
      search: 'Search meals',
      filter: 'Filter by tags',
      clearFilters: 'Clear filters',
      addMeal: 'Add meal',
      addNewMeal: '+ Add new meal',
      choose: 'Choose from Meal Library',
      emptyTitle: 'No meals yet',
      noMatch: 'No matching meals',
      noMatchBody: 'Try another search, or clear the filters.',
      loadError: "Couldn't load meals",
      saved: 'Meal saved',
      deleted: 'Meal deleted',
      nameRequired: 'Enter a meal name',
      offline: "You're offline. Try again when you're connected",
      deletedElsewhere: 'This meal was deleted on another device',
      saveAsNew: 'Save as new meal',
      discardTitle: 'Discard changes?',
      addPhoto: 'Add photo',
      changePhoto: 'Change photo',
      removePhoto: 'Remove photo',
      takePhoto: 'Take photo',
      choosePhoto: 'Choose from library',
      mealType: 'Meal type',
      recentlyUsed: 'Recently used',
      allMeals: 'All',
      typeTagReserved: "That's a meal type. Choose it under Meal type.",
    });
  });

  it('names the meal in the delete confirmation (R44.2)', () => {
    expect(COPY.deleteTitle('Tacos')).toBe('Delete “Tacos”?');
  });
});
