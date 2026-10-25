import { makeItem, makeRow } from '@/test/factories';

import { CATEGORIES, COMMON_ITEMS } from './constants';
import {
  buildSections,
  charLength,
  findOpenItemNamed,
  hasOpenItemNamed,
  isSteppable,
  normalizeName,
  parseItemRow,
  planUncheckAll,
  progress,
  quickAddChips,
  STEP_MAX,
  stepQuantity,
  SUGGESTION_LIMIT,
  suggestCategory,
  validateItemInput,
  visibleSections,
  type GroceryItemRow,
} from './domain';

describe('normalizeName', () => {
  it('U-DOM-03 trims and lower-cases', () => {
    expect(normalizeName('  Milk ')).toBe('milk');
  });
});

describe('charLength', () => {
  it('U-DOM-04 counts an emoji as one character, as Postgres char_length does', () => {
    expect('🥛'.length).toBe(2); // UTF-16 code units, which is not what the database counts
    expect(charLength('🥛')).toBe(1);
    expect(charLength('🥛'.repeat(200))).toBe(200);
    expect(charLength('Half & Half')).toBe(11);
  });
});

describe('validateItemInput', () => {
  it.each(['', '   '])('U-DOM-05 rejects the name %j', (name) => {
    expect(validateItemInput({ name, quantity: '' })).toEqual({
      ok: false,
      field: 'name',
      message: 'Enter a name.',
    });
  });

  it('U-DOM-05 accepts a 200-character name and rejects a 201-character one', () => {
    expect(validateItemInput({ name: 'x'.repeat(200), quantity: '' })).toMatchObject({ ok: true });
    expect(validateItemInput({ name: 'x'.repeat(201), quantity: '' })).toEqual({
      ok: false,
      field: 'name',
      message: 'Keep the name to 200 characters or fewer.',
    });
  });

  it('U-DOM-05 counts the name in characters, so 200 emoji are accepted', () => {
    expect(validateItemInput({ name: '🥕'.repeat(200), quantity: '' })).toMatchObject({ ok: true });
  });

  it('U-DOM-05 checks the length after trimming', () => {
    expect(validateItemInput({ name: ` ${'x'.repeat(200)} `, quantity: '' })).toMatchObject({
      ok: true,
    });
  });

  it('U-DOM-05 accepts a 50-character quantity and rejects a 51-character one', () => {
    expect(validateItemInput({ name: 'Rice', quantity: '1'.repeat(50) })).toMatchObject({
      ok: true,
    });
    expect(validateItemInput({ name: 'Rice', quantity: '1'.repeat(51) })).toEqual({
      ok: false,
      field: 'quantity',
      message: 'Keep the quantity to 50 characters or fewer.',
    });
  });

  it('U-DOM-05 trims the name and quantity, and turns an empty quantity into null', () => {
    expect(validateItemInput({ name: ' Rice ', quantity: '  2 ' })).toEqual({
      ok: true,
      name: 'Rice',
      quantity: '2',
    });
    expect(validateItemInput({ name: 'Rice', quantity: '' })).toEqual({
      ok: true,
      name: 'Rice',
      quantity: null,
    });
    expect(validateItemInput({ name: 'Rice', quantity: '   ' })).toMatchObject({ quantity: null });
  });

  it('reports the name before the quantity when both are invalid', () => {
    expect(validateItemInput({ name: '', quantity: '1'.repeat(51) })).toMatchObject({
      field: 'name',
    });
  });
});

describe('suggestCategory', () => {
  it.each([
    ['milk', 'dairy'],
    [' Bananas ', 'produce'],
    ['Half & Half', 'dairy'],
    ['FROZEN PIZZA', 'frozen'],
    ['kombucha', 'beverages'],
    ['Oat milk', 'beverages'],
    ['birthday candles', 'other'],
    ['', 'other'],
  ] as const)('U-DOM-06 suggests %j → %s', (name, category) => {
    expect(suggestCategory(name)).toBe(category);
  });

  it('U-DOM-06 suggests the right category for every common item', () => {
    for (const { key } of CATEGORIES) {
      for (const name of COMMON_ITEMS[key]) expect(suggestCategory(name)).toBe(key);
    }
  });
});

describe('hasOpenItemNamed', () => {
  it('U-DOM-10 matches an open item whatever the case and surrounding whitespace', () => {
    const items = [makeItem({ name: 'Milk' })];
    expect(hasOpenItemNamed(items, 'milk ')).toBe(true);
    expect(hasOpenItemNamed(items, '  MILK')).toBe(true);
  });

  it('U-DOM-10 ignores checked items, so a checked-only Milk does not match', () => {
    expect(hasOpenItemNamed([makeItem({ name: 'Milk', isChecked: true })], 'milk')).toBe(false);
  });

  it('U-DOM-10 matches the whole name, not a part of it', () => {
    expect(hasOpenItemNamed([makeItem({ name: 'Oat milk' })], 'milk')).toBe(false);
  });

  it('U-DOM-10 matches in any category', () => {
    expect(hasOpenItemNamed([makeItem({ name: 'Milk', category: 'other' })], 'Milk')).toBe(true);
  });
});

describe('findOpenItemNamed', () => {
  it('U-DOM-10 returns the open item with that name, as it is listed', () => {
    const milk = makeItem({ id: 'milk', name: 'Milk' });
    const items = [makeItem({ id: 'old-milk', name: 'Milk', isChecked: true }), milk];
    expect(findOpenItemNamed(items, ' milk ')).toBe(milk);
  });

  it('U-DOM-10 returns nothing when only checked items, or other names, match', () => {
    const items = [makeItem({ name: 'Milk', isChecked: true }), makeItem({ name: 'Oat milk' })];
    expect(findOpenItemNamed(items, 'milk')).toBeUndefined();
  });
});

describe('buildSections', () => {
  it('U-DOM-07 returns no sections for an empty list', () => {
    expect(buildSections([])).toEqual([]);
  });

  it('U-DOM-07 puts sections in the fixed order and hides empty ones', () => {
    const sections = buildSections([
      makeItem({ id: 'a', category: 'other' }),
      makeItem({ id: 'b', category: 'produce' }),
      makeItem({ id: 'c', category: 'bakery' }),
      makeItem({ id: 'd', category: 'dairy' }),
    ]);
    expect(sections.map((s) => s.category)).toEqual(['produce', 'dairy', 'bakery', 'other']);
  });

  it('U-DOM-07 orders open items first, then oldest first, then by id', () => {
    const sections = buildSections([
      makeItem({ id: 'checked-old', isChecked: true, createdAt: '2026-10-18T09:00:00+00:00' }),
      makeItem({ id: 'open-new', createdAt: '2026-10-18T12:00:00+00:00' }),
      makeItem({ id: 'open-tie-b', createdAt: '2026-10-18T10:00:00+00:00' }),
      makeItem({ id: 'checked-new', isChecked: true, createdAt: '2026-10-18T11:00:00+00:00' }),
      makeItem({ id: 'open-tie-a', createdAt: '2026-10-18T10:00:00+00:00' }),
      makeItem({ id: 'open-old', createdAt: '2026-10-18T08:00:00+00:00' }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].items.map((i) => i.id)).toEqual([
      'open-old',
      'open-tie-a',
      'open-tie-b',
      'open-new',
      'checked-old',
      'checked-new',
    ]);
  });

  it('U-DOM-07 compares timestamps in time order, whatever their fractional digits', () => {
    // PostgREST trims trailing zeros, so the same column can have different lengths.
    const sections = buildSections([
      makeItem({ id: 'b', createdAt: '2026-10-18T10:00:00.5+00:00' }),
      makeItem({ id: 'c', createdAt: '2026-10-18T10:00:00.51+00:00' }),
      makeItem({ id: 'a', createdAt: '2026-10-18T10:00:00+00:00' }),
    ]);
    expect(sections[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('U-DOM-07 does not reorder the array it was given', () => {
    const items = [makeItem({ id: 'b' }), makeItem({ id: 'a' })];
    buildSections(items);
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('U-DOM-08 counts only open items in openCount', () => {
    const sections = buildSections([
      makeItem({ id: 'a', category: 'produce' }),
      makeItem({ id: 'b', category: 'produce' }),
      makeItem({ id: 'c', category: 'produce', isChecked: true }),
      makeItem({ id: 'd', category: 'pantry', isChecked: true }),
    ]);
    expect(sections.map(({ category, openCount }) => ({ category, openCount }))).toEqual([
      { category: 'produce', openCount: 2 },
      { category: 'pantry', openCount: 0 },
    ]);
  });
});

describe('progress', () => {
  const list = (checked: number, total: number) =>
    Array.from({ length: total }, (_, i) => makeItem({ id: `item-${i}`, isChecked: i < checked }));

  it('U-DOM-09 has no percentage for an empty list', () => {
    expect(progress([])).toEqual({ checked: 0, total: 0, percent: null });
  });

  it.each([
    [1, 3, 33],
    [2, 3, 67],
    [1, 8, 13],
    [0, 4, 0],
    [4, 4, 100],
  ])('U-DOM-09 %i of %i checked is %i%%', (checked, total, percent) => {
    expect(progress(list(checked, total))).toEqual({ checked, total, percent });
  });
});

describe('planUncheckAll', () => {
  it('U-DOM-15 reopens every checked item, and leaves open items alone', () => {
    const items = [
      makeItem({ id: 'eggs', name: 'Eggs' }),
      makeItem({ id: 'milk', name: 'Milk', isChecked: true }),
      makeItem({ id: 'rice', name: 'Rice', isChecked: true }),
    ];
    expect(planUncheckAll(items)).toEqual({ uncheckIds: ['rice', 'milk'], keepIds: [] });
  });

  it('U-DOM-15 keeps an item checked while an open item has its name, whatever the case', () => {
    const items = [
      makeItem({ id: 'milk', name: 'Milk' }),
      makeItem({ id: 'old-milk', name: ' milk', isChecked: true }),
    ];
    expect(planUncheckAll(items)).toEqual({ uncheckIds: [], keepIds: ['old-milk'] });
  });

  it('U-DOM-15 reopens only the newest of several checked items with one name', () => {
    const items = [
      makeItem({
        id: 'older',
        name: 'Milk',
        isChecked: true,
        createdAt: '2026-10-11T12:00:00+00:00',
      }),
      makeItem({
        id: 'newer',
        name: 'MILK',
        isChecked: true,
        createdAt: '2026-10-18T12:00:00+00:00',
      }),
    ];
    expect(planUncheckAll(items)).toEqual({ uncheckIds: ['newer'], keepIds: ['older'] });
  });

  it('U-DOM-15 has nothing to do for an empty list or one with nothing checked', () => {
    expect(planUncheckAll([])).toEqual({ uncheckIds: [], keepIds: [] });
    expect(planUncheckAll([makeItem()])).toEqual({ uncheckIds: [], keepIds: [] });
  });
});

describe('quickAddChips', () => {
  const names = (chips: ReturnType<typeof quickAddChips>) => chips.map((c) => c.name);
  const none = { query: '', category: null };

  it('U-DOM-11 offers the popular staples, in catalogue order, before a name or category', () => {
    const chips = quickAddChips([], none);
    expect(chips).toEqual([
      { name: 'Bananas', category: 'produce', disabled: false },
      { name: 'Apples', category: 'produce', disabled: false },
      { name: 'Spinach', category: 'produce', disabled: false },
      { name: 'Onions', category: 'produce', disabled: false },
      { name: 'Avocado', category: 'produce', disabled: false },
      { name: 'Chicken Breast', category: 'meat', disabled: false },
      { name: 'Milk', category: 'dairy', disabled: false },
      { name: 'Eggs', category: 'dairy', disabled: false },
      { name: 'Bread', category: 'bakery', disabled: false },
      { name: 'Coffee', category: 'beverages', disabled: false },
    ]);
  });

  it.each(CATEGORIES.map(({ key }) => key))(
    'U-DOM-11 offers every common %s item once that category is picked',
    (category) => {
      const chips = quickAddChips([], { query: '', category });
      expect(names(chips)).toEqual(COMMON_ITEMS[category]);
      expect(chips.every((c) => c.category === category)).toBe(true);
    },
  );

  it('U-DOM-11 suggests the common items containing a typed name, those starting with it first', () => {
    // Bell Peppers comes first in the catalogue, but Pepper starts with what was typed.
    expect(names(quickAddChips([], { query: 'pepper', category: null }))).toEqual([
      'Pepper',
      'Bell Peppers',
    ]);
    expect(quickAddChips([], { query: 'cream', category: null })).toEqual([
      { name: 'Cream', category: 'dairy', disabled: false },
      { name: 'Sour Cream', category: 'dairy', disabled: false },
      { name: 'Heavy Cream', category: 'dairy', disabled: false },
      { name: 'Ice Cream', category: 'frozen', disabled: false },
    ]);
  });

  it('U-DOM-11 matches a typed name whatever its case and surrounding spaces, over a picked category', () => {
    expect(names(quickAddChips([], { query: '  MILK ', category: 'bakery' }))).toEqual([
      'Milk',
      'Oat Milk',
    ]);
  });

  it('U-DOM-11 keeps typed suggestions to the limit, starts-with matches first', () => {
    const chips = quickAddChips([], { query: 'e', category: null });
    expect(chips).toHaveLength(SUGGESTION_LIMIT);
    expect(names(chips).slice(0, 2)).toEqual(['Eggs', 'English Muffins']);
  });

  it('U-DOM-11 suggests nothing for a name no common item contains', () => {
    expect(quickAddChips([], { query: 'kimchi', category: null })).toEqual([]);
  });

  it('U-DOM-11 disables a chip only while an open item has its name (R6.2)', () => {
    const items = [
      makeItem({ id: 'a', name: 'milk ' }),
      makeItem({ id: 'b', name: 'Eggs', isChecked: true }),
    ];
    const disabled = (query: string, category: (typeof CATEGORIES)[number]['key'] | null) =>
      quickAddChips(items, { query, category })
        .filter((c) => c.disabled)
        .map((c) => c.name);

    expect(disabled('', null)).toEqual(['Milk']);
    expect(disabled('', 'dairy')).toEqual(['Milk']);
    expect(disabled('mil', null)).toEqual(['Milk']);
  });
});

describe('stepQuantity', () => {
  it.each([
    ['2', 1, '3'],
    ['2', -1, '1'],
    ['2 lbs', 1, '3 lbs'],
    ['12 pack', -1, '11 pack'],
    ['9 cans', 1, '10 cans'],
    ['998', 1, '999'],
    ['2\nlarge', 1, '3\nlarge'],
  ] as const)('steps %j by %i to %j, keeping the unit as typed', (quantity, delta, next) => {
    expect(stepQuantity(quantity, delta)).toBe(next);
  });

  it('counts no quantity as one, so + makes it 2 and − does nothing', () => {
    expect(stepQuantity(null, 1)).toBe('2');
    expect(stepQuantity(null, -1)).toBeUndefined();
  });

  it(`stops at 1 and at ${STEP_MAX}`, () => {
    expect(stepQuantity('1', -1)).toBeUndefined();
    expect(stepQuantity('1 lb', -1)).toBeUndefined();
    expect(stepQuantity(String(STEP_MAX), 1)).toBeUndefined();
    expect(stepQuantity(String(STEP_MAX), -1)).toBe('998');
  });

  it.each(['a bunch', '1.5 kg', '1,000', '1/2 cup', '2-3', '1000', ' 2', ''])(
    "can't step %j, which only the editor changes",
    (quantity) => {
      expect(stepQuantity(quantity, 1)).toBeUndefined();
      expect(stepQuantity(quantity, -1)).toBeUndefined();
    },
  );
});

describe('isSteppable', () => {
  it.each(['1', '2 lbs', '12 pack', '999'])('is true for %j, which starts with a count', (q) => {
    expect(isSteppable(q)).toBe(true);
  });

  it.each([null, '', 'a bunch', '1.5 kg', '1/2 cup', '1000'])('is false for %j', (q) => {
    expect(isSteppable(q)).toBe(false);
  });
});

describe('visibleSections', () => {
  const ITEMS = [
    makeItem({ id: 'apples', category: 'produce' }),
    makeItem({ id: 'pears', category: 'produce', isChecked: true }),
    makeItem({ id: 'milk', category: 'dairy' }),
    makeItem({ id: 'peas', category: 'frozen', isChecked: true }),
  ];
  const sections = buildSections(ITEMS);
  const none = new Set<(typeof CATEGORIES)[number]['key']>();
  const shown = (visible: ReturnType<typeof visibleSections>) =>
    visible.map(({ category, collapsed, data }) => ({
      category,
      collapsed,
      ids: data.map((i) => i.id),
    }));

  it('draws every section and row while nothing is hidden or collapsed', () => {
    const visible = visibleSections(sections, { hideChecked: false, collapsed: none });

    expect(shown(visible)).toEqual([
      { category: 'produce', collapsed: false, ids: ['apples', 'pears'] },
      { category: 'dairy', collapsed: false, ids: ['milk'] },
      { category: 'frozen', collapsed: false, ids: ['peas'] },
    ]);
  });

  it('leaves out checked rows, and a section with nothing open, when checked items are hidden', () => {
    const visible = visibleSections(sections, { hideChecked: true, collapsed: none });

    expect(shown(visible)).toEqual([
      { category: 'produce', collapsed: false, ids: ['apples'] },
      { category: 'dairy', collapsed: false, ids: ['milk'] },
    ]);
    // The counts still come from every item.
    expect(visible[0]).toMatchObject({ openCount: 1, items: sections[0].items });
  });

  it('keeps a collapsed section heading with no rows', () => {
    const visible = visibleSections(sections, {
      hideChecked: false,
      collapsed: new Set(['produce']),
    });

    expect(shown(visible)).toEqual([
      { category: 'produce', collapsed: true, ids: [] },
      { category: 'dairy', collapsed: false, ids: ['milk'] },
      { category: 'frozen', collapsed: false, ids: ['peas'] },
    ]);
  });

  it('leaves out a collapsed section whose items are all hidden', () => {
    const visible = visibleSections(sections, {
      hideChecked: true,
      collapsed: new Set(['frozen', 'dairy']),
    });

    expect(shown(visible)).toEqual([
      { category: 'produce', collapsed: false, ids: ['apples'] },
      { category: 'dairy', collapsed: true, ids: [] },
    ]);
  });

  it('draws nothing for an empty list', () => {
    expect(visibleSections([], { hideChecked: true, collapsed: none })).toEqual([]);
  });
});

describe('parseItemRow', () => {
  it('U-DOM-14 maps a snake_case row to a camel-case GroceryItem', () => {
    const row = makeRow({
      id: 'item-7',
      list_id: 'list-2',
      name: 'Rice',
      category: 'pantry',
      quantity: '2 kg',
      is_checked: true,
      checked_at: '2026-10-18T12:30:00+00:00',
      created_at: '2026-10-18T12:00:00+00:00',
    });
    expect(parseItemRow(row)).toEqual({
      ok: true,
      unknownCategory: false,
      item: {
        id: 'item-7',
        listId: 'list-2',
        name: 'Rice',
        category: 'pantry',
        quantity: '2 kg',
        isChecked: true,
        checkedAt: '2026-10-18T12:30:00+00:00',
        createdAt: '2026-10-18T12:00:00+00:00',
      },
    });
  });

  it('U-DOM-12 shows an unknown category under Other and flags it', () => {
    expect(parseItemRow(makeRow({ category: 'snacks' }))).toMatchObject({
      ok: true,
      unknownCategory: true,
      item: { category: 'other' },
    });
  });

  it('U-DOM-13 marks a row with a missing name invalid, naming the field', () => {
    const { name: _, ...row } = makeRow({ id: 'item-9' });
    expect(parseItemRow(row as GroceryItemRow)).toEqual({ ok: false, id: 'item-9', field: 'name' });
  });

  it('U-DOM-13 marks a row with a null id invalid, with no id to report', () => {
    expect(parseItemRow(makeRow({ id: null as unknown as string }))).toEqual({
      ok: false,
      id: null,
      field: 'id',
    });
  });

  it.each([
    ['list_id', { list_id: null }],
    ['name', { name: 42 }],
    ['category', { category: null }],
    ['quantity', { quantity: undefined }],
    ['is_checked', { is_checked: 'true' }],
    ['checked_at', { checked_at: 0 }],
    ['created_at', { created_at: null }],
  ])('U-DOM-13 marks a row with a bad %s invalid', (field, overrides) => {
    const row = { ...makeRow(), ...overrides } as unknown as GroceryItemRow;
    expect(parseItemRow(row)).toEqual({ ok: false, id: 'item-1', field });
  });

  it('U-DOM-13 accepts null for the nullable fields', () => {
    expect(parseItemRow(makeRow({ quantity: null, checked_at: null }))).toMatchObject({ ok: true });
  });
});
