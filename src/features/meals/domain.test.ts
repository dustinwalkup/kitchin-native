import type { IsoDate } from '@/lib/calendar';
import { makeEntryRow, makeMealEntry } from '@/test/factories';

import { ENTRY_MAX, MEAL_TYPES } from './constants';
import {
  buildWeek,
  charactersLeft,
  charLength,
  clampEntry,
  parseEntryRow,
  slotChange,
  trimEntry,
  type MealEntryRow,
} from './domain';

const iso = (s: string) => s as IsoDate;
const MEAL_ORDER = MEAL_TYPES.map((t) => t.key);

describe('buildWeek', () => {
  it('U-MDOM-03 gives seven Monday-first days of empty slots in meal-type order', () => {
    const days = buildWeek(iso('2026-10-19'), []);

    expect(days.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(days.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const day of days) {
      expect(day.planned).toBe(0);
      expect(day.slots).toEqual(
        MEAL_ORDER.map((mealType) => ({ date: day.date, mealType, entry: null })),
      );
    }
  });

  it('U-MDOM-03 runs across a year end', () => {
    expect(buildWeek(iso('2026-12-28'), []).map((d) => d.date)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('U-MDOM-04 places entries in their slots and counts 0–3 per day', () => {
    const mondayDinner = makeMealEntry({ id: 'a', date: '2026-10-19', mealType: 'dinner' });
    const wednesdayLunch = makeMealEntry({ id: 'b', date: '2026-10-21', mealType: 'lunch' });
    const thursday = MEAL_ORDER.map((mealType) =>
      makeMealEntry({ id: `thu-${mealType}`, date: '2026-10-22', mealType }),
    );

    const days = buildWeek(iso('2026-10-19'), [...thursday, wednesdayLunch, mondayDinner]);

    expect(days.map((d) => d.planned)).toEqual([1, 0, 1, 3, 0, 0, 0]);
    expect(days[0].slots.map((s) => s.entry)).toEqual([null, null, mondayDinner]);
    expect(days[2].slots.map((s) => s.entry)).toEqual([null, wednesdayLunch, null]);
    expect(days[3].slots.map((s) => s.entry)).toEqual(thursday);
  });

  it('U-MDOM-04 ignores entries outside the week', () => {
    const days = buildWeek(iso('2026-10-19'), [
      makeMealEntry({ id: 'sunday-before', date: '2026-10-18' }),
      makeMealEntry({ id: 'monday-after', date: '2026-10-26' }),
    ]);

    expect(days.map((d) => d.planned)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(days.flatMap((d) => d.slots).every((s) => s.entry === null)).toBe(true);
  });
});

describe('parseEntryRow', () => {
  it('U-MDOM-05 maps a snake_case row to a MealEntry', () => {
    const row = makeEntryRow({
      id: 'entry-7',
      meal_date: '2026-10-22',
      meal_type: 'lunch',
      body: 'Leftover chili',
      updated_at: '2026-10-19T12:30:00+00:00',
    });
    expect(parseEntryRow(row)).toEqual({
      ok: true,
      entry: {
        id: 'entry-7',
        date: '2026-10-22',
        mealType: 'lunch',
        body: 'Leftover chili',
        libraryMealId: null,
        updatedAt: '2026-10-19T12:30:00+00:00',
      },
    });
  });

  it('U-MDOM-05 keeps the library meal a row was chosen from (DD-R10)', () => {
    const row = makeEntryRow({ library_meal_id: 'meal-3' });
    expect(parseEntryRow(row)).toEqual({
      ok: true,
      entry: expect.objectContaining({ body: 'Tacos', libraryMealId: 'meal-3' }),
    });
  });

  it.each([
    ['meal_type', { meal_type: 'snack' }],
    ['meal_date', { meal_date: '2026-02-30' }],
    ['meal_date', { meal_date: '22/10/2026' }],
    ['body', { body: '' }],
    ['body', { body: null }],
    ['library_meal_id', { library_meal_id: 7 }],
    ['library_meal_id', { library_meal_id: undefined }],
    ['updated_at', { updated_at: null }],
  ])('U-MDOM-06 marks a row with a bad %s invalid', (field, overrides) => {
    const row = { ...makeEntryRow({ id: 'entry-9' }), ...overrides } as MealEntryRow;
    expect(parseEntryRow(row)).toEqual({ ok: false, id: 'entry-9', field });
  });

  it('U-MDOM-06 marks a row with a null id invalid, with no id to report', () => {
    expect(parseEntryRow(makeEntryRow({ id: null as unknown as string }))).toEqual({
      ok: false,
      id: null,
      field: 'id',
    });
  });

  it('U-MDOM-06 marks a row with a missing field invalid, naming the field', () => {
    const { meal_type: _, ...row } = makeEntryRow({ id: 'entry-9' });
    expect(parseEntryRow(row as MealEntryRow)).toEqual({
      ok: false,
      id: 'entry-9',
      field: 'meal_type',
    });
  });
});

describe('charLength', () => {
  it('U-MDOM-07 counts an emoji as one character, as Postgres char_length does', () => {
    expect('🌮'.length).toBe(2); // UTF-16 code units, which is not what the database counts
    expect(charLength('🌮')).toBe(1);
    expect(charLength('🌮'.repeat(500))).toBe(500);
    expect(charLength('Tacos')).toBe(5);
  });
});

describe('clampEntry', () => {
  it('U-MDOM-08 keeps the first 500 characters of a pasted 600-character text', () => {
    const text = 'abcdefghij'.repeat(60);
    expect(clampEntry(text)).toBe(text.slice(0, ENTRY_MAX));
  });

  it('U-MDOM-08 keeps 500 whole emoji of 600, with no lone surrogate', () => {
    const clamped = clampEntry('🌮'.repeat(600));
    expect(clamped).toBe('🌮'.repeat(500));
    expect(clamped.isWellFormed()).toBe(true);
  });

  it('U-MDOM-08 leaves text at or under the limit unchanged', () => {
    expect(clampEntry('x'.repeat(499))).toBe('x'.repeat(499));
    expect(clampEntry('🌮'.repeat(500))).toBe('🌮'.repeat(500));
    expect(clampEntry('')).toBe('');
  });
});

describe('charactersLeft', () => {
  it.each([
    [0, null],
    [450, null],
    [451, 49],
    [499, 1],
    [500, 0],
  ])('U-MDOM-09 at %i characters is %p', (length, left) => {
    expect(charactersLeft('x'.repeat(length))).toBe(left);
  });

  it('U-MDOM-09 counts emoji as one character each', () => {
    expect(charactersLeft('🌮'.repeat(451))).toBe(49);
  });
});

// Finding 6: the 19 code points compared on the local database, and whether Postgres's `\s`
// (which the body CHECK uses) matches each one. JavaScript's trim() strips U+FEFF and keeps U+0085.
const WHITESPACE: [codePoint: number, postgresSpace: boolean][] = [
  [0x09, true],
  [0x0a, true],
  [0x0b, true],
  [0x0c, true],
  [0x0d, true],
  [0x20, true],
  [0x85, true],
  [0xa0, true],
  [0x1680, true],
  [0x180e, false],
  [0x2000, true],
  [0x200a, true],
  [0x200b, false],
  [0x2028, true],
  [0x2029, true],
  [0x202f, true],
  [0x205f, true],
  [0x3000, true],
  [0xfeff, false],
];

const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

describe('trimEntry', () => {
  it.each(WHITESPACE.map(([cp, postgresSpace]) => [hex(cp), cp, postgresSpace] as const))(
    'U-MDOM-12 strips %s at either end when trim() or Postgres treats it as space',
    (_, cp, postgresSpace) => {
      const c = String.fromCodePoint(cp);
      const stripped = postgresSpace || c.trim() === '';
      expect(trimEntry(`${c}Tacos${c}`)).toBe(stripped ? 'Tacos' : `${c}Tacos${c}`);
    },
  );

  it('U-MDOM-12 never leaves a leading or trailing character that Postgres treats as space', () => {
    const spaces = WHITESPACE.filter(([, postgresSpace]) => postgresSpace).map(([cp]) =>
      String.fromCodePoint(cp),
    );
    for (const c of spaces) {
      for (const d of spaces) {
        const trimmed = trimEntry(`${c}${d}Tacos${d}${c}`);
        expect(trimmed).toBe('Tacos');
      }
    }
  });

  it('U-MDOM-12 strips U+0085 mixed with other whitespace, and keeps it inside the text', () => {
    expect(trimEntry(' \u0085\tChili\u0085Cornbread \u0085 \n')).toBe('Chili\u0085Cornbread');
  });

  it('U-MDOM-12 agrees with trim() on text without U+0085', () => {
    for (const text of ['', '   ', ' Tacos ', '\nChili\nCornbread\n', ' Pho　']) {
      expect(trimEntry(text)).toBe(text.trim());
    }
  });
});

describe('slotChange', () => {
  it.each([
    ['', 'Tacos', { kind: 'save', body: 'Tacos' }],
    ['Tacos', ' Tacos ', { kind: 'none' }],
    ['Tacos', 'Tacos', { kind: 'none' }],
    ['Tacos', 'Pizza ', { kind: 'save', body: 'Pizza' }],
    ['Tacos', '   ', { kind: 'clear' }],
    ['Tacos', '', { kind: 'clear' }],
    ['', '  ', { kind: 'none' }],
    ['', '', { kind: 'none' }],
  ])('U-MDOM-10 from %j to %j is %j', (base, draft, change) => {
    expect(slotChange(base, draft)).toEqual(change);
  });

  it('U-MDOM-10 trims U+0085 before comparing', () => {
    expect(slotChange('Tacos', 'Tacos\u0085')).toEqual({ kind: 'none' });
    expect(slotChange('Tacos', '\u0085')).toEqual({ kind: 'clear' });
  });

  it('U-MDOM-11 keeps inner line breaks', () => {
    expect(slotChange('', '\nChili\nCornbread\n')).toEqual({
      kind: 'save',
      body: 'Chili\nCornbread',
    });
  });
});
