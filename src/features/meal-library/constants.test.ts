import { ENTRY_MAX } from '@/features/meals/constants';

import { COPY, COUNTER_FROM, LIMITS, STARTER_TAGS } from './constants';
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
  it("U-LDOM-01 lists the seven starter tags in the migration's order", () => {
    expect(STARTER_TAGS).toEqual([
      'Quick & Easy',
      'Family Favorite',
      'High Protein',
      'Breakfast',
      'Lunch',
      'Dinner',
      'Meal Prep',
    ]);
  });

  it('U-LDOM-01 holds clean tag names within the limit, each with its own key', () => {
    for (const name of STARTER_TAGS) {
      expect(cleanTagName(name)).toBe(name);
      expect(charLength(name)).toBeLessThanOrEqual(LIMITS.tag);
    }
    expect(new Set(STARTER_TAGS.map(tagKey)).size).toBe(STARTER_TAGS.length);
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
      emptyTitle: 'No saved meals yet',
      noMatch: 'No meals match',
      loadError: "Couldn't load meals",
      saved: 'Meal saved',
      deleted: 'Meal deleted',
      nameRequired: 'Enter a meal name',
      offline: "You're offline. Try again when you're connected",
      deletedElsewhere: 'This meal was deleted on another device',
      saveAsNew: 'Save as new meal',
      discardTitle: 'Discard changes?',
    });
  });

  it('names the meal in the delete confirmation (R44.2)', () => {
    expect(COPY.deleteTitle('Tacos')).toBe('Delete “Tacos”?');
  });
});
