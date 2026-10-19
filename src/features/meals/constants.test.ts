import { COPY, COUNTER_FROM, DAY_ACCENTS, DAY_KEYS, ENTRY_MAX, MEAL_TYPES } from './constants';

describe('MEAL_TYPES', () => {
  it('U-MDOM-01 lists breakfast, lunch and dinner in order, with the DD32 symbols, glyphs and tints', () => {
    expect(MEAL_TYPES).toEqual([
      {
        key: 'breakfast',
        label: 'Breakfast',
        symbol: 'cup.and.saucer.fill',
        glyph: 'accent',
        tint: 'accentSoft',
      },
      { key: 'lunch', label: 'Lunch', symbol: 'sun.max.fill', glyph: 'ink', tint: 'secondarySoft' },
      {
        key: 'dinner',
        label: 'Dinner',
        symbol: 'moon.fill',
        glyph: 'primary',
        tint: 'primarySoft',
      },
    ]);
  });
});

describe('DAY_ACCENTS and DAY_KEYS', () => {
  it('U-MDOM-02 gives Monday to Sunday the legacy accents and static keys', () => {
    expect(DAY_ACCENTS).toEqual([
      'primary',
      'ink',
      'cactus',
      'secondary',
      'tertiary',
      'sand',
      'accent',
    ]);
    expect(DAY_KEYS).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });
});

describe('limits and copy', () => {
  it('matches the database limit and shows the counter below 50 left', () => {
    expect(ENTRY_MAX).toBe(500);
    expect(COUNTER_FROM).toBe(50);
  });

  it('has the meal copy, with a placeholder per meal type', () => {
    expect(MEAL_TYPES.map((t) => COPY.placeholder(t.label))).toEqual([
      'Add breakfast',
      'Add lunch',
      'Add dinner',
    ]);
    expect(COPY).toMatchObject({
      loadError: "Couldn't load meals",
      saveError: "Couldn't save that meal",
      today: 'Today',
      addToGroceries: 'Add to groceries',
    });
  });
});
