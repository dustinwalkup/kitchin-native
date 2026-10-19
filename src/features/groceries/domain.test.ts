import { makeItem, makeRow } from '@/test/factories';

import { CATEGORIES, COMMON_ITEMS } from './constants';
import {
  buildSections,
  charLength,
  findOpenItemNamed,
  hasOpenItemNamed,
  normalizeName,
  parseItemRow,
  progress,
  quickAddGroups,
  suggestCategory,
  validateItemInput,
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
    ['kombucha', 'other'],
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

describe('quickAddGroups', () => {
  it('U-DOM-11 has 7 groups in the fixed order and 78 chips', () => {
    const groups = quickAddGroups([]);
    expect(groups.map((g) => g.category)).toEqual(CATEGORIES.map((c) => c.key));
    expect(groups.flatMap((g) => g.chips)).toHaveLength(78);
    expect(groups[0].chips[0]).toEqual({ name: 'Bananas', disabled: false });
  });

  it('U-DOM-11 disables a chip only while an open item has its name', () => {
    const groups = quickAddGroups([
      makeItem({ id: 'a', name: 'milk ' }),
      makeItem({ id: 'b', name: 'Eggs', isChecked: true }),
    ]);
    const disabled = groups.flatMap((g) => g.chips.filter((c) => c.disabled).map((c) => c.name));
    expect(disabled).toEqual(['Milk']);
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
