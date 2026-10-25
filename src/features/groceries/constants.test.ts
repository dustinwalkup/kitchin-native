import { CATEGORIES, COMMON_ITEMS, EMPTY_STATE, POPULAR_ITEMS } from './constants';
import { normalizeName, suggestCategory } from './domain';

describe('CATEGORIES', () => {
  it('U-DOM-01 lists the eight categories in the fixed order, with their labels and emoji', () => {
    expect(CATEGORIES).toEqual([
      { key: 'produce', label: 'Produce', emoji: '🥬' },
      { key: 'meat', label: 'Meat & Seafood', emoji: '🥩' },
      { key: 'dairy', label: 'Dairy & Eggs', emoji: '🥚' },
      { key: 'pantry', label: 'Pantry', emoji: '🥫' },
      { key: 'frozen', label: 'Frozen', emoji: '🧊' },
      { key: 'bakery', label: 'Bakery', emoji: '🥖' },
      { key: 'beverages', label: 'Beverages', emoji: '🧃' },
      { key: 'other', label: 'Other', emoji: '🧺' },
    ]);
  });
});

describe('COMMON_ITEMS', () => {
  it('U-DOM-02 has 87 items: the 78 legacy ones and 9 beverages', () => {
    const counts = CATEGORIES.map(({ key }) => [key, COMMON_ITEMS[key].length]);
    expect(counts).toEqual([
      ['produce', 15],
      ['meat', 12],
      ['dairy', 10],
      ['pantry', 15],
      ['frozen', 7],
      ['bakery', 9],
      ['beverages', 9],
      ['other', 10],
    ]);
    expect(Object.keys(COMMON_ITEMS)).toHaveLength(CATEGORIES.length);
  });

  it('U-DOM-02 has no two items with the same normalized name', () => {
    const names = Object.values(COMMON_ITEMS).flat().map(normalizeName);
    expect(new Set(names).size).toBe(87);
  });
});

describe('POPULAR_ITEMS', () => {
  it('lists ten staples, each a common item, so each adds to its own category', () => {
    expect(POPULAR_ITEMS).toHaveLength(10);
    expect(new Set(POPULAR_ITEMS.map(normalizeName)).size).toBe(10);
    const common = new Set(Object.values(COMMON_ITEMS).flat());
    for (const name of POPULAR_ITEMS) expect(common).toContain(name);
    expect(suggestCategory('Coffee')).toBe('beverages');
  });
});

describe('EMPTY_STATE', () => {
  it('has the redesigned copy (R4.8)', () => {
    expect(EMPTY_STATE).toEqual({
      title: 'Your grocery list is empty',
      description: 'Add an item to get started. Tap it off as it goes in the cart.',
    });
  });
});
