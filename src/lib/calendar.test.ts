import {
  CalendarFormatError,
  addDays,
  deviceTimeZone,
  formatDay,
  formatWeekRange,
  isValidTimeZone,
  parseIsoDate,
  todayIn,
  weekDates,
  weekStartOf,
  weekday,
  type IsoDate,
} from './calendar';

// specs/meals/4-test-plan.md §3.1. Instants are fixed with Date.UTC so the machine's own zone never
// matters. Display strings assume Node's default locale (en-US), as on CI.

function iso(s: string): IsoDate {
  const date = parseIsoDate(s);
  if (date === null) throw new Error(`Not an IsoDate: ${s}`);
  return date;
}

function isoList(...dates: string[]): IsoDate[] {
  return dates.map(iso);
}

/** Makes every formatter return `output`. */
function mockFormatOutput(output: string) {
  // ECMA-402 makes `format` a getter that returns a bound function; TypeScript types it as a method.
  const prototype: { format: unknown } = Intl.DateTimeFormat.prototype;
  return jest.spyOn(prototype, 'format', 'get').mockReturnValue(() => output);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('parseIsoDate', () => {
  it('U-CAL-01 accepts a real YYYY-MM-DD date', () => {
    expect(parseIsoDate('2026-10-19')).toBe('2026-10-19');
    expect(parseIsoDate('2028-02-29')).toBe('2028-02-29');
  });

  it.each([
    ['an impossible day', '2026-02-30'],
    ['a non-leap 29 February', '2027-02-29'],
    ['an impossible month', '2026-13-01'],
    ['month zero', '2026-00-10'],
    ['day zero', '2026-10-00'],
    ['unpadded parts', '2026-1-5'],
    ['a time', '2026-10-19T00:00'],
    ['surrounding whitespace', ' 2026-10-19'],
    ['another separator', '2026/10/19'],
    ['an empty string', ''],
  ])('U-CAL-01 rejects %s (%j)', (_name, s) => {
    expect(parseIsoDate(s)).toBeNull();
  });
});

describe('addDays', () => {
  it.each([
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2028-02-28', 2, '2028-03-01'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-10-19', -7, '2026-10-12'],
    ['2026-10-19', 0, '2026-10-19'],
    // Across both US daylight-saving changes, where a local-time day isn't 24 hours long.
    ['2026-03-07', 2, '2026-03-09'],
    ['2026-10-31', 2, '2026-11-02'],
  ])('U-CAL-02 %s + %i is %s', (date, n, expected) => {
    expect(addDays(iso(date), n)).toBe(expected);
  });
});

describe('weekday', () => {
  it('U-CAL-03 counts from Monday (K10)', () => {
    expect(weekday(iso('2026-10-19'))).toBe(0);
    expect(weekday(iso('2026-10-22'))).toBe(3);
    expect(weekday(iso('2026-10-25'))).toBe(6);
    expect(weekday(iso('1970-01-01'))).toBe(3); // day number 0, a Thursday
    expect(weekday(iso('1969-12-29'))).toBe(0); // a negative day number
  });
});

describe('weekStartOf', () => {
  it.each(isoList('2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'))(
    'U-CAL-04 gives the Monday for %s',
    (date) => {
      expect(weekStartOf(date)).toBe('2026-10-19');
    },
  );

  it.each(isoList('2026-10-24', '2026-10-25'))(
    'U-CAL-04 gives the Monday before the weekend day %s',
    (date) => {
      expect(weekStartOf(date)).toBe('2026-10-19');
    },
  );

  it('U-CAL-04 goes back across a year end', () => {
    expect(weekStartOf(iso('2027-01-01'))).toBe('2026-12-28'); // a Friday
    expect(weekStartOf(iso('2027-01-03'))).toBe('2026-12-28'); // a Sunday
  });
});

describe('weekDates', () => {
  it.each([
    [
      'across a year end',
      '2026-12-28',
      ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31'],
      ['2027-01-01', '2027-01-02', '2027-01-03'],
    ],
    [
      'across a month end',
      '2026-09-28',
      ['2026-09-28', '2026-09-29', '2026-09-30'],
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
    ],
    [
      'whose Sunday is the US DST start',
      '2026-03-02',
      ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'],
      ['2026-03-06', '2026-03-07', '2026-03-08'],
    ],
    [
      'whose Sunday is the US DST end',
      '2026-10-26',
      ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'],
      ['2026-10-30', '2026-10-31', '2026-11-01'],
    ],
    [
      'across a leap day',
      '2028-02-28',
      ['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02'],
      ['2028-03-03', '2028-03-04', '2028-03-05'],
    ],
  ])('U-CAL-05 gives seven consecutive dates %s', (_name, start, first, rest) => {
    expect(weekDates(iso(start))).toEqual([...first, ...rest]);
  });
});

describe('todayIn', () => {
  it.each([
    // U-CAL-06 to U-CAL-09: the last second of 19 October and the first of 20 October in each zone.
    ['U-CAL-06', 'America/Chicago', Date.UTC(2026, 9, 20, 4, 59, 59), '2026-10-19'],
    ['U-CAL-06', 'America/Chicago', Date.UTC(2026, 9, 20, 5, 0, 0), '2026-10-20'],
    ['U-CAL-07', 'Pacific/Auckland', Date.UTC(2026, 9, 19, 10, 59, 59), '2026-10-19'],
    ['U-CAL-07', 'Pacific/Auckland', Date.UTC(2026, 9, 19, 11, 0, 0), '2026-10-20'],
    ['U-CAL-08', 'Asia/Kolkata', Date.UTC(2026, 9, 19, 18, 29, 59), '2026-10-19'],
    ['U-CAL-08', 'Asia/Kolkata', Date.UTC(2026, 9, 19, 18, 30, 0), '2026-10-20'],
    ['U-CAL-09', 'Pacific/Chatham', Date.UTC(2026, 9, 19, 10, 14, 59), '2026-10-19'],
    ['U-CAL-09', 'Pacific/Chatham', Date.UTC(2026, 9, 19, 10, 15, 0), '2026-10-20'],
  ])('%s in %s at %i is %s', (_id, zone, now, expected) => {
    expect(todayIn(zone, now)).toBe(expected);
  });

  it.each([
    // Chicago's DST start: 8 March runs from 06:00Z (CST) to 04:59:59Z the next day (CDT).
    [Date.UTC(2026, 2, 8, 5, 59, 59), '2026-03-07'],
    [Date.UTC(2026, 2, 8, 6, 0, 0), '2026-03-08'],
    [Date.UTC(2026, 2, 9, 4, 59, 59), '2026-03-08'],
    [Date.UTC(2026, 2, 9, 5, 0, 0), '2026-03-09'],
    // Chicago's DST end: 1 November runs from 05:00Z (CDT) to 05:59:59Z the next day (CST).
    [Date.UTC(2026, 10, 1, 4, 59, 59), '2026-10-31'],
    [Date.UTC(2026, 10, 1, 5, 0, 0), '2026-11-01'],
    [Date.UTC(2026, 10, 2, 5, 59, 59), '2026-11-01'],
    [Date.UTC(2026, 10, 2, 6, 0, 0), '2026-11-02'],
  ])('U-CAL-10 follows Chicago across a DST change at %i', (now, expected) => {
    expect(todayIn('America/Chicago', now)).toBe(expected);
  });

  it.each([
    // Auckland's DST start: 27 September runs from 12:00Z the day before (NZST) to 11:00Z (NZDT).
    [Date.UTC(2026, 8, 26, 11, 59, 59), '2026-09-26'],
    [Date.UTC(2026, 8, 26, 12, 0, 0), '2026-09-27'],
    [Date.UTC(2026, 8, 27, 10, 59, 59), '2026-09-27'],
    [Date.UTC(2026, 8, 27, 11, 0, 0), '2026-09-28'],
  ])('U-CAL-10 follows Auckland across a Southern Hemisphere DST change at %i', (now, expected) => {
    expect(todayIn('Pacific/Auckland', now)).toBe(expected);
  });

  it('defaults to the current instant', () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 19, 12, 0, 0));
    expect(todayIn('UTC')).toBe('2026-10-19');
  });

  it('U-CAL-13 throws CalendarFormatError when the formatter output is unexpected', () => {
    const formatToParts = jest.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts');
    const format = mockFormatOutput('2026年10月19日');

    expect(() => todayIn('Asia/Tokyo', Date.UTC(2026, 9, 19))).toThrow(CalendarFormatError);
    expect(format).toHaveBeenCalled();
    expect(formatToParts).not.toHaveBeenCalled();
  });

  it.each([
    ['a different order', '2026/10/19'],
    ['an impossible date', '02/30/2026'],
    ['unpadded parts', '10/9/2026'],
    ['a hidden mark', '‎10/19/2026'],
  ])('U-CAL-13 throws CalendarFormatError for %s', (_name, output) => {
    mockFormatOutput(output);

    expect(() => todayIn('Asia/Tokyo', Date.UTC(2026, 9, 19))).toThrow(CalendarFormatError);
  });

  it('U-CAL-13 names the error and leaves the output out of its message', () => {
    mockFormatOutput('2026年10月19日');

    let error: unknown;
    try {
      todayIn('Asia/Tokyo', Date.UTC(2026, 9, 19));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CalendarFormatError);
    expect((error as Error).name).toBe('CalendarFormatError');
    expect((error as Error).message).not.toContain('2026');
  });

  it('U-CAL-14 builds one en-US formatter per zone and reuses it', () => {
    // Zones no other test uses, because the cache lives for the module's lifetime.
    const constructor = jest.spyOn(Intl, 'DateTimeFormat');

    todayIn('Europe/Lisbon', Date.UTC(2026, 9, 19));
    todayIn('Europe/Lisbon', Date.UTC(2026, 9, 20));
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(constructor).toHaveBeenCalledWith('en-US', {
      timeZone: 'Europe/Lisbon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    expect(todayIn('Europe/Oslo', Date.UTC(2026, 9, 19))).toBe('2026-10-19');
    expect(constructor).toHaveBeenCalledTimes(2);
  });

  it('throws the RangeError for an unknown zone', () => {
    expect(() => todayIn('Mars/Olympus', Date.UTC(2026, 9, 19))).toThrow(RangeError);
  });
});

describe('isValidTimeZone', () => {
  it.each(['America/Chicago', 'Pacific/Chatham', 'UTC'])('U-CAL-11 accepts %j', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each(['Mars/Olympus', '', 'America/Chicago '])('U-CAL-11 rejects %j', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe('deviceTimeZone', () => {
  it("U-CAL-12 returns Intl's resolved zone", () => {
    expect(deviceTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('formatDay', () => {
  it('U-CAL-15 formats in UTC with the device locale', () => {
    const constructor = jest.spyOn(Intl, 'DateTimeFormat');

    expect(formatDay(iso('2026-10-22'))).toEqual({ weekday: 'Thursday', date: 'October 22' });
    expect(constructor).toHaveBeenCalledWith(undefined, { weekday: 'long', timeZone: 'UTC' });
    expect(constructor).toHaveBeenCalledWith(undefined, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  });

  it('U-CAL-15 keeps the date whatever the device zone', () => {
    // A date's UTC midnight is the previous evening in Chicago; formatting in UTC never shows that.
    expect(formatDay(iso('2027-01-01'))).toEqual({ weekday: 'Friday', date: 'January 1' });
  });
});

describe('formatWeekRange', () => {
  it('U-CAL-16 joins the two ends of a week in the current year', () => {
    // The prototype first: spying on the constructor replaces `Intl.DateTimeFormat`.
    const formatRange = jest.spyOn(Intl.DateTimeFormat.prototype, 'formatRange');
    const constructor = jest.spyOn(Intl, 'DateTimeFormat');

    expect(formatWeekRange(iso('2026-10-19'), iso('2026-10-21'))).toBe('Oct 19 – Oct 25');
    expect(constructor).toHaveBeenCalledWith(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    expect(formatRange).not.toHaveBeenCalled();
  });

  it('U-CAL-16 adds the year to both ends of a week that spans New Year', () => {
    const formatRange = jest.spyOn(Intl.DateTimeFormat.prototype, 'formatRange');

    expect(formatWeekRange(iso('2026-12-28'), iso('2026-10-21'))).toBe(
      'Dec 28, 2026 – Jan 3, 2027',
    );
    expect(formatWeekRange(iso('2026-12-28'), iso('2027-01-01'))).toBe(
      'Dec 28, 2026 – Jan 3, 2027',
    );
    expect(formatRange).not.toHaveBeenCalled();
  });

  it('U-CAL-16 adds the year to a week wholly outside the current year', () => {
    expect(formatWeekRange(iso('2025-10-20'), iso('2026-10-21'))).toBe(
      'Oct 20, 2025 – Oct 26, 2025',
    );
    expect(formatWeekRange(iso('2027-10-18'), iso('2026-10-21'))).toBe(
      'Oct 18, 2027 – Oct 24, 2027',
    );
  });
});
