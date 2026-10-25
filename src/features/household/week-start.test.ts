import type { Weekday } from '@/lib/calendar';

import {
  DEFAULT_WEEK_START,
  parseWeekStart,
  WEEK_START_VALUES,
  weekStartValue,
} from './week-start';

// U-WKS-01 and U-WKS-02 (specs/meals/4-test-plan.md §14.2).

describe('week start values', () => {
  it.each([
    ['monday', 0],
    ['tuesday', 1],
    ['wednesday', 2],
    ['thursday', 3],
    ['friday', 4],
    ['saturday', 5],
    ['sunday', 6],
  ] as const)('U-WKS-01 maps %j to %i and back', (value, day) => {
    expect(parseWeekStart(value)).toBe(day);
    expect(weekStartValue(day as Weekday)).toBe(value);
  });

  it('U-WKS-01 lists the seven values the database accepts, Monday first', () => {
    expect(WEEK_START_VALUES).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]);
    expect(DEFAULT_WEEK_START).toBe(0);
  });

  it.each(['Sunday', 'sun', '', 'funday', ' monday'])('U-WKS-02 returns null for %j', (value) => {
    expect(parseWeekStart(value)).toBeNull();
  });
});
