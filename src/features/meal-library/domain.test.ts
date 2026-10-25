import { ENTRY_MAX } from '@/features/meals/constants';
import { makeLibraryMeal, makeLibraryTag, makeMealRow, makeTagRow } from '@/test/factories';

import { COPY, COUNTER_FROM, LIMITS } from './constants';
import {
  addTypedTag,
  buildLibrary,
  charactersLeft,
  charLength,
  clampTo,
  cleanTagName,
  compareNames,
  compareTags,
  constraintField,
  copiedText,
  filterMeals,
  foldForSearch,
  formValuesOf,
  imagePathOf,
  isDirty,
  maxLengthFor,
  oneLine,
  planSave,
  recentMeals,
  tagKey,
  trimField,
  validateMeal,
  type CleanMeal,
  type FormValues,
  type ImageValue,
  type MealRow,
  type TagChoice,
  type TagRow,
} from './domain';

// What `\s` matches on the local database (Postgres 17, ICU en-US), which the library CHECKs and
// name_key use (§4.1). Meals finding 6 compared 19 code points; U+001C–U+001F and U+2007 were
// added for task 16.1. JavaScript's `\s` and trim() miss U+001C–U+001F and U+0085.
const POSTGRES_SPACES = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2007,
  0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];

const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
const SPACE_CASES = POSTGRES_SPACES.map((cp) => [hex(cp), String.fromCodePoint(cp)]);

describe('charLength', () => {
  it('U-LDOM-02 counts code points, as Postgres char_length does', () => {
    expect('🌮'.length).toBe(2); // UTF-16 code units, which is not what the database counts
    expect(charLength('🌮')).toBe(1);
    expect(charLength('Tacos')).toBe(5);
    expect(charLength('é'.repeat(100))).toBe(100);
    expect(charLength('e\u0301')).toBe(2); // a decomposed é is two code points to Postgres too
  });
});

describe('clampTo', () => {
  it('U-LDOM-02 keeps 100 of 101 ASCII characters', () => {
    expect(clampTo('x'.repeat(101), LIMITS.name)).toBe('x'.repeat(100));
  });

  it('U-LDOM-02 keeps 2,000 of 2,001 emoji, with no lone surrogate', () => {
    const clamped = clampTo('🌮'.repeat(2001), LIMITS.ingredients);
    expect(clamped).toBe('🌮'.repeat(2000));
    expect(clamped.isWellFormed()).toBe(true);
  });

  it('U-LDOM-02 leaves text at or under the limit unchanged', () => {
    expect(clampTo('', LIMITS.tag)).toBe('');
    expect(clampTo('x'.repeat(30), LIMITS.tag)).toBe('x'.repeat(30));
    expect(clampTo('🌮'.repeat(30), LIMITS.tag)).toBe('🌮'.repeat(30));
  });
});

describe('maxLengthFor', () => {
  it.each([
    ['empty text', '', 100],
    ['99 ASCII characters', 'x'.repeat(99), 100],
    ['99 emoji (198 UTF-16 units)', '🌮'.repeat(99), 199],
    ['100 ASCII characters', 'x'.repeat(100), 100],
    ['100 emoji', '🌮'.repeat(100), 200],
  ])('U-LDOM-03 for %s under the name limit is %i', (_, text, maxLength) => {
    expect(maxLengthFor(text, LIMITS.name)).toBe(maxLength);
  });
});

describe.each(Object.entries(LIMITS))('pasted text over the %s limit of %i', (_, max) => {
  it.each([
    ['ASCII', 'x'],
    ['emoji', '🌮'],
  ])('U-LDOM-02 U-LDOM-03 keeps the first characters of %s and leaves no room for more', (_, c) => {
    const clamped = clampTo(c.repeat(max + 10), max);
    expect(clamped).toBe(c.repeat(max));
    expect(maxLengthFor(clamped, max)).toBe(clamped.length);
  });
});

describe('charactersLeft', () => {
  it.each<[keyof typeof COUNTER_FROM, number, number | null]>([
    ['name', 0, null],
    ['name', 80, null],
    ['name', 81, 19],
    ['name', 100, 0],
    ['description', 250, null],
    ['description', 251, 49],
    ['description', 300, 0],
    ['ingredients', 1950, null],
    ['ingredients', 1951, 49],
  ])('U-LDOM-04 %s at %i characters is %p', (field, length, left) => {
    expect(charactersLeft('x'.repeat(length), LIMITS[field], COUNTER_FROM[field])).toBe(left);
  });

  it('U-LDOM-04 counts emoji as one character each', () => {
    expect(charactersLeft('🌮'.repeat(81), LIMITS.name, COUNTER_FROM.name)).toBe(19);
  });
});

describe('trimField', () => {
  it.each(SPACE_CASES)(
    'U-LDOM-05 strips %s, which Postgres treats as space, at either end',
    (_, c) => {
      expect(trimField(`${c}${c}Tacos${c}`)).toBe('Tacos');
    },
  );

  it('U-LDOM-05 strips everything trim() strips', () => {
    for (const text of ['', '   ', ' Tacos ', '\nChili\nCornbread\n', ' Pho\u3000', '\ufeffSoup']) {
      expect(trimField(text)).toBe(text.trim());
    }
  });

  it('U-LDOM-05 keeps U+180E and U+200B, which neither treats as space', () => {
    expect(trimField('\u180eTacos\u200b')).toBe('\u180eTacos\u200b');
  });

  it('U-LDOM-05 keeps whitespace inside the text', () => {
    expect(trimField(' \u0085\tChili\u0085\n\u001fCornbread \u0085 ')).toBe(
      'Chili\u0085\n\u001fCornbread',
    );
  });
});

describe('oneLine', () => {
  it.each([
    ['CR', '\r'],
    ['LF', '\n'],
    ['CR LF', '\r\n'],
    ['U+0085', '\u0085'],
    ['U+2028', '\u2028'],
    ['U+2029', '\u2029'],
  ])('U-LDOM-05 turns %s into one space', (_, lineBreak) => {
    expect(oneLine(`Chili${lineBreak}Cornbread`)).toBe('Chili Cornbread');
  });

  it('U-LDOM-05 turns each line break of pasted text into its own space', () => {
    const pasted = 'Chili\r\n\r\nCornbread\n\u2028Salad\r';
    expect(oneLine(pasted)).toBe('Chili  Cornbread  Salad ');
    expect(oneLine(pasted)).not.toMatch(/[\n\r\u0085\u2028\u2029]/);
  });

  it('U-LDOM-05 leaves one-line text alone, including tabs', () => {
    expect(oneLine('Tacos\tal pastor')).toBe('Tacos\tal pastor');
  });
});

// Names and the name_key Postgres computed for each on the local database (finding 1).
const POSTGRES_KEYS = [
  ['quick  &  EASY', 'quick & easy'],
  ['Quick & Easy', 'quick & easy'],
  ['Quick & easy', 'quick & easy'],
  ['Taco Night', 'taco night'],
  ['TACO   night', 'taco night'],
  ['Taco\tNight', 'taco night'],
  ['ÉCLAIR  Night', 'éclair night'],
];

describe('cleanTagName and tagKey', () => {
  it('U-LDOM-06 trims and turns each whitespace run into one space, keeping the spelling', () => {
    expect(cleanTagName(' quick  &  EASY ')).toBe('quick & EASY');
    expect(cleanTagName('Taco\tNight')).toBe('Taco Night');
    expect(cleanTagName('\u0085Taco\r\nNight\u0085')).toBe('Taco Night');
  });

  it.each(POSTGRES_KEYS)('U-LDOM-06 keys %j as %j, as name_key does', (name, key) => {
    expect(tagKey(name)).toBe(key);
  });

  it.each(SPACE_CASES)(
    "U-LDOM-06 collapses a run of %s, as name_key's \\s+ does, leaving one plain space",
    (_, c) => {
      expect(cleanTagName(`Taco${c}${c}Night`)).toBe('Taco Night');
      expect(tagKey(`Taco${c}${c}Night`)).toBe('taco night');
    },
  );

  it('U-LDOM-06 gives a cleaned name the same key, so name_key matches what the app sent', () => {
    for (const [name, key] of POSTGRES_KEYS) {
      expect(tagKey(cleanTagName(name))).toBe(key);
    }
  });
});

describe('foldForSearch', () => {
  it.each([
    ['Jalapeño', 'jalapeno'],
    ['Crème Brûlée', 'creme brulee'],
    ['Jalapen\u0303o', 'jalapeno'], // already decomposed, as some pasted text is
    ['ÉCLAIR', 'eclair'],
    ['  TACO\u0085', 'taco'],
  ])('U-LDOM-07 folds %j to %j', (text, folded) => {
    expect(foldForSearch(text)).toBe(folded);
  });

  it('U-LDOM-07 lets "JALA" match "Jalapeño"', () => {
    expect(foldForSearch('Jalapeño')).toContain(foldForSearch('JALA'));
  });

  it('U-LDOM-07 lower-cases only, without throwing, if normalize is missing', () => {
    const normalize = Object.getOwnPropertyDescriptor(String.prototype, 'normalize');
    Reflect.deleteProperty(String.prototype, 'normalize');
    try {
      expect(''.normalize).toBeUndefined();
      expect(foldForSearch(' Jalapeño ')).toBe('jalapeño');
    } finally {
      // eslint-disable-next-line no-extend-native -- puts back the original, deleted above
      Object.defineProperty(String.prototype, 'normalize', normalize as PropertyDescriptor);
    }
    expect(foldForSearch('Jalapeño')).toBe('jalapeno');
  });
});

describe('filterMeals', () => {
  const tacos = makeLibraryMeal({
    id: 'tacos',
    name: 'Chicken tacos',
    tagIds: ['dinner', 'quick'],
  });
  const stew = makeLibraryMeal({
    id: 'stew',
    name: 'Beef stew',
    description: 'Leftover tacos',
    tagIds: ['dinner'],
  });
  const poppers = makeLibraryMeal({ id: 'poppers', name: 'Jalapeño poppers' });
  const meals = [stew, tacos, poppers];
  const noTags = new Set<string>();
  const tags = (...ids: string[]) => new Set(ids);

  it.each([
    ['jala', [poppers]],
    ['JALA', [poppers]],
    ['jalapeño', [poppers]],
    ['ken ta', [tacos]],
    ['e', [stew, tacos, poppers]],
    ['pizza', []],
  ])('U-LDOM-08 searching %j shows only the meals that contain it', (query, expected) => {
    expect(filterMeals(meals, { query, tagIds: noTags })).toEqual(expected);
  });

  it('DD-R9 searches the description too', () => {
    expect(filterMeals(meals, { query: 'LEFTOVER', tagIds: noTags })).toEqual([stew]);
  });

  it('DD-R9 lists meals whose names match before those that match only in their details', () => {
    // Beef stew comes first in the list, but only its description says tacos.
    expect(filterMeals(meals, { query: '  TACO ', tagIds: noTags })).toEqual([tacos, stew]);
  });

  it('DD-R9 searches ingredients and tag names, through the detail key', () => {
    const chili = makeLibraryMeal({
      id: 'chili',
      name: 'Chili',
      ingredients: 'Kidney beans\nCumin',
      detailKey: foldForSearch('Kidney beans\nCumin\nFixture Taco Night'),
    });
    expect(filterMeals([chili], { query: 'cumin', tagIds: noTags })).toEqual([chili]);
    expect(filterMeals([chili], { query: 'taco night', tagIds: noTags })).toEqual([chili]);
    expect(filterMeals([chili], { query: 'rice', tagIds: noTags })).toEqual([]);
  });

  it.each(['', '   '])('U-LDOM-08 shows every meal for the search %j with no tags', (query) => {
    expect(filterMeals(meals, { query, tagIds: noTags })).toEqual(meals);
  });

  it('U-LDOM-09 shows only meals that have every selected tag', () => {
    expect(filterMeals(meals, { query: '', tagIds: tags('dinner', 'quick') })).toEqual([tacos]);
    expect(filterMeals(meals, { query: '', tagIds: tags('dinner') })).toEqual([stew, tacos]);
    expect(filterMeals(meals, { query: '', tagIds: tags('breakfast') })).toEqual([]);
  });

  it('U-LDOM-10 needs a meal to match the search and have every selected tag', () => {
    expect(filterMeals(meals, { query: 'beef', tagIds: tags('dinner') })).toEqual([stew]);
    expect(filterMeals(meals, { query: 'beef', tagIds: tags('dinner', 'quick') })).toEqual([]);
    expect(filterMeals(meals, { query: 'jala', tagIds: tags('dinner') })).toEqual([]);
    expect(filterMeals(meals, { query: 'TACOS', tagIds: tags('quick') })).toEqual([tacos]);
  });

  describe('by meal type (DD-R6)', () => {
    const pancakes = makeLibraryMeal({ id: 'pancakes', name: 'Pancakes', mealType: 'breakfast' });
    const lasagna = makeLibraryMeal({
      id: 'lasagna',
      name: 'Lasagna',
      mealType: 'dinner',
      tagIds: ['quick'],
    });
    const soup = makeLibraryMeal({ id: 'soup', name: 'Tomato soup', mealType: 'dinner' });
    const typed = [pancakes, lasagna, soup, poppers];

    it('shows every meal, typed or not, for no type', () => {
      expect(filterMeals(typed, { query: '', tagIds: noTags })).toEqual(typed);
      expect(filterMeals(typed, { query: '', tagIds: noTags, mealType: null })).toEqual(typed);
    });

    it('shows only the meals of the chosen type', () => {
      expect(filterMeals(typed, { query: '', tagIds: noTags, mealType: 'dinner' })).toEqual([
        lasagna,
        soup,
      ]);
      expect(filterMeals(typed, { query: '', tagIds: noTags, mealType: 'breakfast' })).toEqual([
        pancakes,
      ]);
      expect(filterMeals(typed, { query: '', tagIds: noTags, mealType: 'lunch' })).toEqual([]);
    });

    it('combines the type with the search and the tags', () => {
      expect(filterMeals(typed, { query: 'soup', tagIds: noTags, mealType: 'dinner' })).toEqual([
        soup,
      ]);
      expect(filterMeals(typed, { query: '', tagIds: tags('quick'), mealType: 'dinner' })).toEqual([
        lasagna,
      ]);
      expect(filterMeals(typed, { query: 'pancakes', tagIds: noTags, mealType: 'dinner' })).toEqual(
        [],
      );
    });
  });
});

describe('recentMeals', () => {
  const meals = ['a', 'b', 'c', 'd'].map((id) => makeLibraryMeal({ id, name: `Meal ${id}` }));
  const [a, b, c, d] = meals;

  it('DD-R10 keeps the order of the planned links, newest first', () => {
    expect(recentMeals(meals, ['c', 'a', 'd'])).toEqual([c, a, d]);
  });

  it('DD-R10 lists a meal planned more than once only once, where it was newest', () => {
    expect(recentMeals(meals, ['b', 'c', 'b', 'c', 'a'])).toEqual([b, c, a]);
  });

  it('DD-R10 skips meals that have been deleted since', () => {
    expect(recentMeals(meals, ['gone', 'd', 'also-gone', 'b'])).toEqual([d, b]);
  });

  it('DD-R10 stops at the limit, eight by default', () => {
    const many = Array.from({ length: 10 }, (_, i) => makeLibraryMeal({ id: `m${i}` }));
    const ids = many.map((meal) => meal.id);
    expect(recentMeals(many, ids)).toEqual(many.slice(0, 8));
    expect(recentMeals(meals, ['d', 'c', 'b', 'a'], 2)).toEqual([d, c]);
  });

  it('DD-R10 is empty with nothing planned from the library', () => {
    expect(recentMeals(meals, [])).toEqual([]);
    expect(recentMeals([], ['a'])).toEqual([]);
  });
});

describe('compareNames', () => {
  const named = (name: string, id = name) => ({ name, id });
  const sortedNames = (...items: { name: string; id: string }[]) =>
    items.sort(compareNames).map((item) => item.name);

  it('U-LDOM-11 sorts alphabetically, ignoring case and accents', () => {
    expect(sortedNames(named('Eggs'), named('éclair'), named('Banana'), named('apple'))).toEqual([
      'apple',
      'Banana',
      'éclair',
      'Eggs',
    ]);
  });

  it('U-LDOM-11 puts "Soup 2" before "Soup 10"', () => {
    expect(sortedNames(named('Soup 10'), named('Soup 2'))).toEqual(['Soup 2', 'Soup 10']);
  });

  // The first name gets the lower ID, so an ID tie-break would order them the other way.
  it.each([
    ['tacos', 'Tacos', ['Tacos', 'tacos']],
    ['éclair', 'eclair', ['eclair', 'éclair']],
  ])(
    'U-LDOM-11 orders %j and %j by exact text before ID, whichever comes first',
    (first, second, expected) => {
      const a = named(first, 'meal-1');
      const b = named(second, 'meal-2');
      expect(sortedNames(a, b)).toEqual(expected);
      expect(sortedNames(b, a)).toEqual(expected);
    },
  );

  it('U-LDOM-11 orders identical names by ID', () => {
    const first = named('Tacos', 'meal-1');
    const second = named('Tacos', 'meal-2');
    expect([second, first].sort(compareNames)).toEqual([first, second]);
    expect(compareNames(first, { ...first })).toBe(0);
  });
});

describe('compareTags', () => {
  const favourite = makeLibraryTag({ id: 'tag-fav', name: 'Family Favorite' });
  const sortedNames = (...tags: ReturnType<typeof makeLibraryTag>[]) =>
    tags.sort(compareTags).map((tag) => tag.name);

  it('DD-R8 puts Family Favorite first, and the rest in alphabetical order', () => {
    expect(
      sortedNames(
        makeLibraryTag({ id: 'tag-1', name: 'Quick & Easy' }),
        makeLibraryTag({ id: 'tag-2', name: 'Appetizer' }),
        favourite,
        makeLibraryTag({ id: 'tag-3', name: 'Meal Prep' }),
      ),
    ).toEqual(['Family Favorite', 'Appetizer', 'Meal Prep', 'Quick & Easy']);
  });

  it('DD-R8 knows Family Favorite by its key, whatever its spelling', () => {
    const spelled = makeLibraryTag({ id: 'tag-fav', name: 'family FAVORITE' });
    expect(sortedNames(makeLibraryTag({ id: 'tag-1', name: 'Appetizer' }), spelled)).toEqual([
      'family FAVORITE',
      'Appetizer',
    ]);
  });

  it('R43.10 orders tags by name when neither is Family Favorite', () => {
    const a = makeLibraryTag({ id: 'tag-2', name: 'Appetizer' });
    const b = makeLibraryTag({ id: 'tag-1', name: 'Brunch' });
    expect(compareTags(a, b)).toBeLessThan(0);
    expect(compareTags(b, a)).toBeGreaterThan(0);
    expect(compareTags(favourite, { ...favourite })).toBe(0);
  });
});

describe('copiedText', () => {
  it('U-LDOM-12 is the name alone when there is no description', () => {
    expect(copiedText({ name: 'Tacos', description: null })).toBe('Tacos');
  });

  it('U-LDOM-12 is the name, a line break and the description', () => {
    expect(copiedText({ name: 'Tacos', description: 'Beef, corn tortillas' })).toBe(
      'Tacos\nBeef, corn tortillas',
    );
  });

  it('U-LDOM-12 copies neither ingredients nor tags', () => {
    const stew = makeLibraryMeal({
      name: 'Beef stew',
      ingredients: 'Beef\nCarrots',
      tagIds: ['dinner'],
    });
    expect(copiedText(stew)).toBe('Beef stew');
  });

  it('U-LDOM-12 gives 401 characters at the limits, within ENTRY_MAX', () => {
    const text = copiedText({
      name: 'é'.repeat(LIMITS.name),
      description: '🌮'.repeat(LIMITS.description),
    });
    expect(charLength(text)).toBe(401);
    expect(charLength(text)).toBeLessThanOrEqual(ENTRY_MAX);
  });
});

describe('buildLibrary', () => {
  const EMPTY = { meals: [], tags: [], tagsById: new Map() };

  it("U-LDOM-13 maps rows to sorted meals and tags, with each meal's tags in name order", () => {
    // IDs run against the names, so neither ID nor link order can pass for name order.
    const tagRows = [
      makeTagRow({ id: 'tag-2', name: 'Quick & Easy' }),
      makeTagRow({ id: 'tag-1', name: 'Taco Night' }),
      makeTagRow({ id: 'tag-4', name: 'Family Favorite' }),
      makeTagRow({ id: 'tag-3', name: 'Appetizer' }),
    ];
    const mealRows = [
      makeMealRow({
        id: 'meal-1',
        name: 'Jalapeño poppers',
        meal_type: null,
        updated_at: '2026-10-19T13:00:00+00:00',
      }),
      makeMealRow({
        id: 'meal-2',
        name: 'Chicken tacos',
        description: 'Beef, corn tortillas',
        ingredients: 'Tortillas\nBeef',
        meal_type: 'dinner',
        image_path: 'household-1/photo.jpg',
        library_meal_tags: [
          { tag_id: 'tag-2' },
          { tag_id: 'tag-1' },
          { tag_id: 'tag-3' },
          { tag_id: 'tag-4' },
        ],
      }),
    ];

    const { library, reportKeys } = buildLibrary(mealRows, tagRows);

    // Family Favorite leads (DD-R8).
    expect(library.tags).toEqual([
      makeLibraryTag({ id: 'tag-4', name: 'Family Favorite' }),
      makeLibraryTag({ id: 'tag-3', name: 'Appetizer' }),
      makeLibraryTag({ id: 'tag-2', name: 'Quick & Easy' }),
      makeLibraryTag({ id: 'tag-1', name: 'Taco Night' }),
    ]);
    expect(library.meals).toEqual([
      {
        id: 'meal-2',
        name: 'Chicken tacos',
        description: 'Beef, corn tortillas',
        ingredients: 'Tortillas\nBeef',
        mealType: 'dinner',
        imagePath: 'household-1/photo.jpg',
        tagIds: ['tag-4', 'tag-3', 'tag-2', 'tag-1'],
        searchKey: 'chicken tacos',
        detailKey:
          'beef, corn tortillas\ntortillas\nbeef\nfamily favorite\nappetizer\nquick & easy\ntaco night',
        updatedAt: '2026-10-19T12:00:00+00:00',
      },
      {
        id: 'meal-1',
        name: 'Jalapeño poppers',
        description: null,
        ingredients: null,
        mealType: null,
        imagePath: null,
        tagIds: [],
        searchKey: 'jalapeno poppers',
        detailKey: '',
        updatedAt: '2026-10-19T13:00:00+00:00',
      },
    ]);
    expect(library.tagsById.size).toBe(4);
    expect(library.tagsById.get('tag-2')).toBe(library.tags[2]);
    expect(reportKeys).toEqual([]);
  });

  it("U-LDOM-13 takes each tag's key from name_key", () => {
    const { library } = buildLibrary(
      [],
      [makeTagRow({ name: 'Taco Night', name_key: 'fixture stored key' })],
    );
    expect(library.tags[0].key).toBe('fixture stored key');
  });

  it.each(['breakfast', 'lunch', 'dinner'] as const)(
    'reads the meal type %s (DD-R6)',
    (mealType) => {
      const { library, reportKeys } = buildLibrary([makeMealRow({ meal_type: mealType })], []);
      expect(library.meals[0].mealType).toBe(mealType);
      expect(reportKeys).toEqual([]);
    },
  );

  it('reads a meal type from a newer build as none, and reports it, keeping the meal', () => {
    const { library, reportKeys } = buildLibrary(
      [makeMealRow({ id: 'meal-brunch', meal_type: 'brunch' }), makeMealRow({ id: 'meal-2' })],
      [],
    );
    expect(library.meals.map((m) => [m.id, m.mealType])).toEqual([
      ['meal-2', null],
      ['meal-brunch', null],
    ]);
    expect(reportKeys).toEqual(['unknown_meal_type:meal-brunch']);
  });

  it('DD-R7 neither lists the legacy Breakfast, Lunch and Dinner tags nor keeps them on meals', () => {
    const { library, reportKeys } = buildLibrary(
      [
        makeMealRow({
          meal_type: 'dinner',
          library_meal_tags: [{ tag_id: 'tag-dinner' }, { tag_id: 'tag-quick' }],
        }),
      ],
      [
        makeTagRow({ id: 'tag-breakfast', name: 'Breakfast' }),
        makeTagRow({ id: 'tag-lunch', name: 'LUNCH' }),
        makeTagRow({ id: 'tag-dinner', name: 'Dinner' }),
        makeTagRow({ id: 'tag-quick', name: 'Quick & Easy' }),
      ],
    );

    expect(library.tags.map((t) => t.id)).toEqual(['tag-quick']);
    expect(library.tagsById.has('tag-dinner')).toBe(false);
    expect(library.meals[0].tagIds).toEqual(['tag-quick']);
    // Nor does the search find a meal by the hidden tag's name.
    expect(library.meals[0].detailKey).toBe('quick & easy');
    expect(reportKeys).toEqual([]);
  });

  it("U-LDOM-13 drops a link to a tag it doesn't have, without reporting it", () => {
    const { library, reportKeys } = buildLibrary(
      [makeMealRow({ library_meal_tags: [{ tag_id: 'tag-new' }, { tag_id: 'tag-1' }] })],
      [makeTagRow({ id: 'tag-1' })],
    );
    expect(library.meals[0].tagIds).toEqual(['tag-1']);
    expect(reportKeys).toEqual([]);
  });

  it('U-LDOM-13 is empty for no rows', () => {
    expect(buildLibrary([], [])).toEqual({ library: EMPTY, reportKeys: [] });
  });

  it.each([
    ['name', { name: null }],
    ['name', { name: '' }],
    ['description', { description: 42 }],
    ['description', { description: '' }],
    ['ingredients', { ingredients: ['Beef'] }],
    ['meal_type', { meal_type: 7 }],
    ['image_path', { image_path: '' }],
    ['image_path', { image_path: 42 }],
    ['updated_at', { updated_at: null }],
    ['library_meal_tags', { library_meal_tags: null }],
    ['library_meal_tags', { library_meal_tags: [{ tag_id: 7 }] }],
    ['library_meal_tags', { library_meal_tags: [null] }],
  ])('U-LDOM-14 leaves out a meal with a bad %s, naming it', (field, overrides) => {
    const bad = { ...makeMealRow({ id: 'meal-bad', name: 'Lasagna' }), ...overrides } as MealRow;
    const good = makeMealRow({ id: 'meal-good' });

    const { library, reportKeys } = buildLibrary([bad, good], []);

    expect(library.meals.map((m) => m.id)).toEqual(['meal-good']);
    expect(reportKeys).toEqual([`invalid_library_row:library_meals:meal-bad:${field}`]);
  });

  it('U-LDOM-14 leaves out a meal without library_meal_tags', () => {
    const { library_meal_tags: _, ...row } = makeMealRow({ id: 'meal-bad' });
    expect(buildLibrary([row as MealRow], [])).toEqual({
      library: EMPTY,
      reportKeys: ['invalid_library_row:library_meals:meal-bad:library_meal_tags'],
    });
  });

  it.each([
    ['name', { name: '' }],
    ['name', { name: null }],
    ['name_key', { name_key: null }],
  ])('U-LDOM-14 leaves out a tag with a bad %s, naming it', (field, overrides) => {
    const bad = { ...makeTagRow({ id: 'tag-bad' }), ...overrides } as TagRow;
    const good = makeTagRow({ id: 'tag-good', name: 'Meal Prep' });

    const { library, reportKeys } = buildLibrary([], [bad, good]);

    expect(library.tags.map((t) => t.id)).toEqual(['tag-good']);
    expect(reportKeys).toEqual([`invalid_library_row:library_tags:tag-bad:${field}`]);
  });

  it('U-LDOM-14 reports a row with no ID as null, and drops links to a tag it left out', () => {
    const { library, reportKeys } = buildLibrary(
      [
        makeMealRow({ library_meal_tags: [{ tag_id: 'tag-bad' }, { tag_id: 'tag-1' }] }),
        makeMealRow({ id: null as unknown as string }),
      ],
      [makeTagRow({ id: 'tag-bad', name: '' }), makeTagRow({ id: 'tag-1' })],
    );

    expect(library.tags.map((t) => t.id)).toEqual(['tag-1']);
    expect(library.meals.map((m) => [m.id, m.tagIds])).toEqual([['meal-1', ['tag-1']]]);
    expect(reportKeys).toEqual([
      'invalid_library_row:library_tags:tag-bad:name',
      'invalid_library_row:library_meals:null:id',
    ]);
  });
});

const dinner: TagChoice = { kind: 'existing', id: 'tag-dinner' };
const quick: TagChoice = { kind: 'existing', id: 'tag-quick' };
const lunch: TagChoice = { kind: 'existing', id: 'tag-lunch' };
const tacoNight: TagChoice = { kind: 'new', name: 'Fixture Taco Night' };

describe('formValuesOf', () => {
  it('U-LDOM-15 starts a new meal empty', () => {
    expect(formValuesOf(null)).toEqual({
      name: '',
      description: '',
      ingredients: '',
      mealType: null,
      image: { kind: 'none' },
      tags: [],
    });
  });

  it('U-LDOM-15 starts a new meal with the trimmed search text as its name', () => {
    expect(formValuesOf(null, '  lasag ')).toEqual({
      name: 'lasag',
      description: '',
      ingredients: '',
      mealType: null,
      image: { kind: 'none' },
      tags: [],
    });
    expect(formValuesOf(null, '   ').name).toBe('');
  });

  it("DD-R6 starts a new meal from a slot with the slot's type", () => {
    expect(formValuesOf(null, undefined, 'lunch')).toMatchObject({ name: '', mealType: 'lunch' });
    expect(formValuesOf(null, 'Soup', 'dinner')).toMatchObject({
      name: 'Soup',
      mealType: 'dinner',
    });
  });

  it('U-LDOM-15 keeps the search text to what the name field accepts', () => {
    expect(formValuesOf(null, 'Chili\nCornbread').name).toBe('Chili Cornbread');
    expect(formValuesOf(null, 'x'.repeat(150)).name).toBe('x'.repeat(LIMITS.name));
  });

  it('U-LDOM-15 starts an edit from the meal, with none as empty and its tags selected', () => {
    const meal = makeLibraryMeal({
      name: 'Chicken tacos',
      description: 'Beef, corn tortillas',
      ingredients: null,
      tagIds: ['tag-dinner', 'tag-quick'],
    });
    // The search text is for new meals only, so an old hand-off can't rename the meal.
    expect(formValuesOf(meal, 'lasag')).toEqual({
      name: 'Chicken tacos',
      description: 'Beef, corn tortillas',
      ingredients: '',
      mealType: null,
      image: { kind: 'none' },
      tags: [dinner, quick],
    });
    expect(formValuesOf(makeLibraryMeal({ description: null, ingredients: 'Beef' }))).toEqual({
      name: 'Tacos',
      description: '',
      ingredients: 'Beef',
      mealType: null,
      image: { kind: 'none' },
      tags: [],
    });
  });

  it("starts an edit with the meal's own type and stored photo, ignoring a slot's type", () => {
    const meal = makeLibraryMeal({ mealType: 'breakfast', imagePath: 'household-1/a.jpg' });
    expect(formValuesOf(meal, undefined, 'dinner')).toMatchObject({
      mealType: 'breakfast',
      image: { kind: 'stored', path: 'household-1/a.jpg' },
    });
  });
});

describe('addTypedTag', () => {
  const householdTags = [
    makeLibraryTag({ id: 'tag-dinner', name: 'Taco Tuesday' }),
    makeLibraryTag({ id: 'tag-quick', name: 'Quick & Easy' }),
  ];
  const start = formValuesOf(null, 'Tacos');

  it('U-LDOM-16 adds a new name as a selected new tag, cleaned', () => {
    expect(addTypedTag(start, householdTags, '  Fixture   Taco Night ')).toEqual({
      values: { ...start, tags: [tacoNight] },
      result: 'added',
    });
    expect(start.tags).toEqual([]);
  });

  it.each([' taco tuesday ', 'TACO TUESDAY'])(
    'U-LDOM-16 selects the household tag for %j instead of adding one',
    (typed) => {
      expect(addTypedTag(start, householdTags, typed)).toEqual({
        values: { ...start, tags: [dinner] },
        result: 'selected-existing',
      });
    },
  );

  it('U-LDOM-16 selects Quick & Easy for " quick & EASY" (edge case 3)', () => {
    expect(addTypedTag(start, householdTags, ' quick  &  EASY').values.tags).toEqual([quick]);
  });

  it('U-LDOM-16 changes nothing for a household tag already selected', () => {
    const selected = addTypedTag(start, householdTags, 'Taco Tuesday').values;
    expect(addTypedTag(selected, householdTags, 'Taco Tuesday')).toEqual({
      values: selected,
      result: 'already-selected',
    });
  });

  it('U-LDOM-16 adds no second new tag with the key of one added in this form', () => {
    const added = addTypedTag(start, householdTags, 'Fixture Taco Night').values;
    expect(addTypedTag(added, householdTags, 'FIXTURE taco night')).toEqual({
      values: added,
      result: 'already-selected',
    });
  });

  it('U-LDOM-16 still counts a new tag as selected once the household has it too', () => {
    // The other member created it meanwhile, and the library has refetched.
    const added = addTypedTag(start, householdTags, 'Fixture Taco Night').values;
    const refetched = [
      ...householdTags,
      makeLibraryTag({ id: 'tag-taco', name: 'Fixture Taco Night' }),
    ];
    expect(addTypedTag(added, refetched, 'fixture taco night')).toEqual({
      values: added,
      result: 'already-selected',
    });
  });

  it.each([' Dinner ', 'BREAKFAST', 'lunch', 'Lunch\n'])(
    'DD-R7 adds nothing for the meal type %j, and says it is one',
    (typed) => {
      expect(addTypedTag(start, householdTags, typed)).toEqual({
        values: start,
        result: 'meal-type',
      });
    },
  );

  it('DD-R7 refuses a meal type even when the household still has the legacy tag', () => {
    const legacy = [makeLibraryTag({ id: 'tag-legacy', name: 'Dinner' })];
    expect(addTypedTag(start, legacy, 'dinner').result).toBe('meal-type');
  });

  it.each(['', '   ', '\n\t'])('U-LDOM-16 adds nothing for %j', (typed) => {
    expect(addTypedTag(start, householdTags, typed)).toEqual({ values: start, result: 'empty' });
  });

  it('U-LDOM-16 keeps the first 30 characters of a pasted name, trimmed', () => {
    expect(addTypedTag(start, [], 'x'.repeat(40)).values.tags).toEqual([
      { kind: 'new', name: 'x'.repeat(LIMITS.tag) },
    ]);
    expect(addTypedTag(start, [], `${'x'.repeat(29)} and more`).values.tags).toEqual([
      { kind: 'new', name: 'x'.repeat(29) },
    ]);
  });
});

describe('isDirty', () => {
  const meal = makeLibraryMeal({
    name: 'Chicken tacos',
    description: 'Beef',
    tagIds: ['tag-dinner', 'tag-quick'],
  });
  const initial = formValuesOf(meal);

  it('U-LDOM-17 is false for unchanged values', () => {
    expect(isDirty(initial, { ...initial, tags: [...initial.tags] })).toBe(false);
    expect(isDirty(formValuesOf(null), formValuesOf(null))).toBe(false);
  });

  it.each<[string, Partial<FormValues>]>([
    ['the name', { name: 'Fish tacos' }],
    ['the description', { description: 'Fish' }],
    ['the description, emptied', { description: '' }],
    ['the ingredients', { ingredients: 'Tortillas' }],
    ['the meal type', { mealType: 'dinner' }],
    ['the photo, picked', { image: { kind: 'picked', uri: 'file:///a.jpg', path: 'h/a.jpg' } }],
  ])('U-LDOM-17 is true after a change to %s', (_, change) => {
    expect(isDirty(initial, { ...initial, ...change })).toBe(true);
  });

  it.each<[string, TagChoice[]]>([
    ['one added', [dinner, quick, lunch]],
    ['one removed', [quick]],
    ['one swapped for a new tag', [dinner, tacoNight]],
  ])('U-LDOM-17 is true with %s', (_, tags) => {
    expect(isDirty(initial, { ...initial, tags })).toBe(true);
  });

  it('U-LDOM-17 is false for a tag added then removed, or tags reselected in another order', () => {
    const added = addTypedTag(initial, [], 'Fixture Taco Night').values;
    expect(isDirty(initial, added)).toBe(true);
    expect(isDirty(initial, { ...added, tags: added.tags.filter((t) => t.kind !== 'new') })).toBe(
      false,
    );
    expect(isDirty(initial, { ...initial, tags: [quick, dinner] })).toBe(false);
  });

  it('is true after the meal type is cleared, or the photo removed or replaced', () => {
    const stored = formValuesOf(
      makeLibraryMeal({ mealType: 'lunch', imagePath: 'household-1/old.jpg' }),
    );
    expect(isDirty(stored, { ...stored, mealType: null })).toBe(true);
    expect(isDirty(stored, { ...stored, image: { kind: 'none' } })).toBe(true);
    expect(
      isDirty(stored, {
        ...stored,
        image: { kind: 'picked', uri: 'file:///new.jpg', path: 'household-1/new.jpg' },
      }),
    ).toBe(true);
    expect(
      isDirty(stored, { ...stored, image: { kind: 'stored', path: 'household-1/old.jpg' } }),
    ).toBe(false);
  });

  it('U-LDOM-17 ignores whitespace that saving trims', () => {
    expect(isDirty(initial, { ...initial, name: ' Chicken tacos ', description: 'Beef\n' })).toBe(
      false,
    );
  });
});

describe('validateMeal', () => {
  const values = (overrides: Partial<FormValues> = {}): FormValues => ({
    ...formValuesOf(null, 'Lasagna'),
    ...overrides,
  });

  it('U-LDOM-18 trims every field and saves empty optional fields as none', () => {
    expect(
      validateMeal(
        values({ name: '  Lasagna ', description: '\nBeef and ricotta\n', ingredients: '   ' }),
      ),
    ).toEqual({
      ok: true,
      meal: {
        name: 'Lasagna',
        description: 'Beef and ricotta',
        ingredients: null,
        mealType: null,
        imagePath: null,
        tags: [],
      },
    });
    expect(validateMeal(values())).toEqual({
      ok: true,
      meal: {
        name: 'Lasagna',
        description: null,
        ingredients: null,
        mealType: null,
        imagePath: null,
        tags: [],
      },
    });
  });

  it.each<[string, ImageValue, string | null]>([
    ['no photo', { kind: 'none' }, null],
    ['a stored photo', { kind: 'stored', path: 'household-1/old.jpg' }, 'household-1/old.jpg'],
    [
      'a picked photo',
      { kind: 'picked', uri: 'file:///new.jpg', path: 'household-1/new.jpg' },
      'household-1/new.jpg',
    ],
  ])('keeps the meal type, and saves %s as its Storage key', (_, image, imagePath) => {
    expect(validateMeal(values({ mealType: 'breakfast', image }))).toMatchObject({
      ok: true,
      meal: { mealType: 'breakfast', imagePath },
    });
  });

  it('U-LDOM-18 keeps line breaks inside the description and ingredients, and the tags', () => {
    const tags = [dinner, tacoNight];
    expect(
      validateMeal(
        values({
          description: 'Beef\nand ricotta',
          ingredients: '1 lb beef\r\n1 box noodles',
          tags,
        }),
      ),
    ).toEqual({
      ok: true,
      meal: {
        name: 'Lasagna',
        description: 'Beef\nand ricotta',
        ingredients: '1 lb beef\r\n1 box noodles',
        mealType: null,
        imagePath: null,
        tags,
      },
    });
  });

  it('U-LDOM-18 makes the name one line', () => {
    expect(validateMeal(values({ name: 'Beef\r\nstew\n' }))).toMatchObject({
      ok: true,
      meal: { name: 'Beef stew' },
    });
  });

  it.each(['', '   ', '\n'])('U-LDOM-18 rejects the name %j with "Enter a meal name"', (name) => {
    expect(validateMeal(values({ name }))).toEqual({
      ok: false,
      field: 'name',
      message: 'Enter a meal name',
    });
  });

  it.each([
    ['name', LIMITS.name],
    ['description', LIMITS.description],
    ['ingredients', LIMITS.ingredients],
  ] as const)(
    'U-LDOM-18 rejects a %s over %i characters, counted as Postgres does',
    (field, max) => {
      expect(validateMeal(values({ [field]: 'x'.repeat(max + 1) }))).toEqual({
        ok: false,
        field,
        message: `Shorten this to ${max} characters`,
      });
      expect(validateMeal(values({ [field]: '🌮'.repeat(max) })).ok).toBe(true);
    },
  );
});

describe('planSave', () => {
  const base = makeLibraryMeal({
    id: 'meal-1',
    name: 'Chicken tacos',
    description: 'Beef',
    ingredients: null,
    tagIds: ['tag-dinner', 'tag-quick'],
  });
  const unchanged: CleanMeal = {
    name: 'Chicken tacos',
    description: 'Beef',
    ingredients: null,
    mealType: null,
    imagePath: null,
    tags: [dinner, quick],
  };

  it("U-LDOM-19 upserts a new meal with every field and the form's ID, adding every tag", () => {
    const meal: CleanMeal = {
      name: 'Lasagna',
      description: 'Beef and ricotta',
      ingredients: null,
      mealType: 'dinner',
      imagePath: 'household-1/new.jpg',
      tags: [dinner, tacoNight],
    };
    expect(planSave(null, meal, 'meal-new')).toEqual({
      newTags: ['Fixture Taco Night'],
      meal: {
        kind: 'upsert',
        row: {
          id: 'meal-new',
          name: 'Lasagna',
          description: 'Beef and ricotta',
          ingredients: null,
          mealType: 'dinner',
          imagePath: 'household-1/new.jpg',
        },
      },
      addTags: [dinner, tacoNight],
      removeTagIds: [],
    });
  });

  it('U-LDOM-19 upserts every field of an existing meal saved as new, with base null', () => {
    expect(planSave(null, { ...unchanged, tags: [] }, 'meal-new')).toEqual({
      newTags: [],
      meal: {
        kind: 'upsert',
        row: {
          id: 'meal-new',
          name: 'Chicken tacos',
          description: 'Beef',
          ingredients: null,
          mealType: null,
          imagePath: null,
        },
      },
      addTags: [],
      removeTagIds: [],
    });
  });

  it('U-LDOM-20 updates only the description when only it changed', () => {
    expect(planSave(base, { ...unchanged, description: 'Fish' }, 'meal-1')).toEqual({
      newTags: [],
      meal: { kind: 'update', id: 'meal-1', changes: { description: 'Fish' } },
      addTags: [],
      removeTagIds: [],
    });
  });

  it('U-LDOM-20 sends every changed field, including one emptied to none', () => {
    const meal = { ...unchanged, name: 'Fish tacos', description: null, ingredients: 'Fish' };
    expect(planSave(base, meal, 'meal-1')?.meal).toEqual({
      kind: 'update',
      id: 'meal-1',
      changes: { name: 'Fish tacos', description: null, ingredients: 'Fish' },
    });
  });

  it('updates only the meal type when only it changed, including to none', () => {
    expect(planSave(base, { ...unchanged, mealType: 'lunch' }, 'meal-1')?.meal).toEqual({
      kind: 'update',
      id: 'meal-1',
      changes: { mealType: 'lunch' },
    });
    const typed = { ...base, mealType: 'lunch' as const };
    expect(planSave(typed, unchanged, 'meal-1')?.meal).toEqual({
      kind: 'update',
      id: 'meal-1',
      changes: { mealType: null },
    });
  });

  it('updates only the photo when it was added, replaced or removed', () => {
    expect(planSave(base, { ...unchanged, imagePath: 'household-1/new.jpg' }, 'meal-1')).toEqual({
      newTags: [],
      meal: { kind: 'update', id: 'meal-1', changes: { imagePath: 'household-1/new.jpg' } },
      addTags: [],
      removeTagIds: [],
    });
    const withPhoto = { ...base, imagePath: 'household-1/old.jpg' };
    expect(planSave(withPhoto, unchanged, 'meal-1')?.meal).toEqual({
      kind: 'update',
      id: 'meal-1',
      changes: { imagePath: null },
    });
    expect(
      planSave(withPhoto, { ...unchanged, imagePath: 'household-1/old.jpg' }, 'meal-1'),
    ).toBeNull();
  });

  it('U-LDOM-21 checks an edit of tags only, adding and removing just those', () => {
    expect(planSave(base, { ...unchanged, tags: [quick, tacoNight, lunch] }, 'meal-1')).toEqual({
      newTags: ['Fixture Taco Night'],
      meal: { kind: 'check', id: 'meal-1' },
      addTags: [tacoNight, lunch],
      removeTagIds: ['tag-dinner'],
    });
  });

  it('U-LDOM-21 sends changed fields and changed tags together', () => {
    expect(planSave(base, { ...unchanged, name: 'Fish tacos', tags: [dinner] }, 'meal-1')).toEqual({
      newTags: [],
      meal: { kind: 'update', id: 'meal-1', changes: { name: 'Fish tacos' } },
      addTags: [],
      removeTagIds: ['tag-quick'],
    });
  });

  it('U-LDOM-22 is null for an unchanged edit, whatever order the tags were selected in', () => {
    expect(planSave(base, unchanged, 'meal-1')).toBeNull();
    expect(planSave(base, { ...unchanged, tags: [quick, dinner] }, 'meal-1')).toBeNull();
  });

  it('U-LDOM-23 sends new tags whose keys repeat once, in the first spelling', () => {
    const repeated: TagChoice = { kind: 'new', name: 'FIXTURE taco night' };
    const plan = planSave(
      null,
      { ...unchanged, tags: [tacoNight, repeated, dinner, dinner] },
      'meal-new',
    );
    expect(plan?.newTags).toEqual(['Fixture Taco Night']);
    expect(plan?.addTags).toEqual([tacoNight, dinner]);
  });

  it('U-LDOM-23 never sends a typed tag that matches a household tag as a new tag', () => {
    const household = [makeLibraryTag({ id: 'tag-dinner', name: 'Taco Tuesday' })];
    const { values } = addTypedTag(formValuesOf(null, 'Lasagna'), household, ' taco TUESDAY ');
    const validated = validateMeal(values);
    if (!validated.ok) throw new Error(validated.message);

    expect(planSave(null, validated.meal, 'meal-new')).toMatchObject({
      newTags: [],
      addTags: [dinner],
    });
  });

  it('U-LDOM-24 never removes a tag the other member added after the form opened', () => {
    // The other member added Lunch meanwhile. `base` is the meal as the form opened it, without
    // Lunch, and this member removed only Quick & Easy.
    expect(planSave(base, { ...unchanged, tags: [dinner] }, 'meal-1')).toEqual({
      newTags: [],
      meal: { kind: 'check', id: 'meal-1' },
      addTags: [],
      removeTagIds: ['tag-quick'],
    });
  });

  it('U-LDOM-24 never sends a field only the other member changed', () => {
    // The other member changed the description meanwhile. This member changed only the name, so
    // the description in the form is still the one `base` has.
    expect(planSave(base, { ...unchanged, name: 'Fish tacos' }, 'meal-1')?.meal).toEqual({
      kind: 'update',
      id: 'meal-1',
      changes: { name: 'Fish tacos' },
    });
  });
});

describe('constraintField', () => {
  it.each([
    ['library_meals_name_check', 'name'],
    ['library_meals_description_check', 'description'],
    ['library_meals_ingredients_check', 'ingredients'],
    ['library_meals_image_path_check', 'image'],
    ['library_tags_name_check', 'tags'],
  ])('U-LDOM-25 maps %s to %s', (constraint, field) => {
    expect(constraintField(constraint)).toBe(field);
  });

  it.each([
    undefined,
    '',
    'library_tags_one_per_name',
    'meal_entries_body_check',
    'toString',
    'constructor',
  ])('U-LDOM-25 maps %p to null', (constraint) => {
    expect(constraintField(constraint)).toBeNull();
  });
});

describe('imagePathOf', () => {
  it('is none without a photo, and the Storage key of a stored or picked one', () => {
    expect(imagePathOf({ kind: 'none' })).toBeNull();
    expect(imagePathOf({ kind: 'stored', path: 'household-1/a.jpg' })).toBe('household-1/a.jpg');
    expect(imagePathOf({ kind: 'picked', uri: 'file:///b.jpg', path: 'household-1/b.jpg' })).toBe(
      'household-1/b.jpg',
    );
  });
});

describe('COPY.tooLong', () => {
  it('U-LDOM-18 names the limit', () => {
    expect(COPY.tooLong(100)).toBe('Shorten this to 100 characters');
  });
});
