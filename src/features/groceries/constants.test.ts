import { CATEGORIES, COMMON_ITEMS, EMPTY_STATE } from './constants';
import { normalizeName } from './domain';

describe('CATEGORIES', () => {
  it('U-DOM-01 lists the categories in the fixed order, with the legacy labels and emoji', () => {
    expect(CATEGORIES).toEqual([
      { key: 'produce', label: 'Produce', emoji: '🥬' },
      { key: 'meat', label: 'Meat & Fish', emoji: '🥩' },
      { key: 'dairy', label: 'Dairy & Eggs', emoji: '🥛' },
      { key: 'pantry', label: 'Pantry', emoji: '🥫' },
      { key: 'frozen', label: 'Frozen', emoji: '🧊' },
      { key: 'bakery', label: 'Bakery', emoji: '🍞' },
      { key: 'other', label: 'Other', emoji: '🛒' },
    ]);
  });
});

describe('COMMON_ITEMS', () => {
  it('U-DOM-02 has the 78 legacy items: 15, 12, 10, 15, 7, 9 and 10 per category', () => {
    const counts = CATEGORIES.map(({ key }) => [key, COMMON_ITEMS[key].length]);
    expect(counts).toEqual([
      ['produce', 15],
      ['meat', 12],
      ['dairy', 10],
      ['pantry', 15],
      ['frozen', 7],
      ['bakery', 9],
      ['other', 10],
    ]);
    expect(Object.keys(COMMON_ITEMS)).toHaveLength(CATEGORIES.length);
  });

  it('U-DOM-02 has no two items with the same normalized name', () => {
    const names = Object.values(COMMON_ITEMS).flat().map(normalizeName);
    expect(new Set(names).size).toBe(78);
  });
});

describe('EMPTY_STATE', () => {
  it('keeps the legacy copy', () => {
    expect(EMPTY_STATE).toEqual({
      title: 'No items yet',
      description: 'Add some items to get started',
    });
  });
});
