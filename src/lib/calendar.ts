// Household calendar dates (specs/meals/2-design.md §3.1, DD30, N23). Pure: no React or React Native
// imports. Dates are 'YYYY-MM-DD' strings and arithmetic runs on UTC day numbers, so neither the
// phone's zone nor daylight saving can move a date. This is the only module that turns an instant
// into a date, and it does so only through Intl with an explicit time zone. Hermes's local Date
// arithmetic and its formatToParts have open bugs (finding 2), so neither is used.

/** A calendar date, 'YYYY-MM-DD'. Never a moment in time (34.2). */
export type IsoDate = string & { readonly __brand: 'IsoDate' };

/** Intl gave `todayIn` something other than 'MM/DD/YYYY'. `useHouseholdToday` handles it (§3.2). */
export class CalendarFormatError extends Error {
  name = 'CalendarFormatError';
}

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EN_US_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function toDayNumber(d: IsoDate): number {
  const [year, month, day] = d.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function fromDayNumber(n: number): IsoDate {
  const date = new Date(n * DAY_MS);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as IsoDate;
}

/** The shape and a real date: rejects 2026-02-30. */
export function parseIsoDate(s: string): IsoDate | null {
  if (!ISO_DATE.test(s)) return null;
  // A day or month out of range rolls over into another date, so the round trip catches it.
  // So does a year before 100, which Date.UTC reads as 19xx.
  return fromDayNumber(toDayNumber(s as IsoDate)) === s ? (s as IsoDate) : null;
}

/** On UTC day numbers, so DST never applies (34.4). */
export function addDays(d: IsoDate, n: number): IsoDate {
  return fromDayNumber(toDayNumber(d) + n);
}

/** 0 = Monday … 6 = Sunday, whatever day the household's week starts on (K10, DD67). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function weekday(d: IsoDate): Weekday {
  // Day number 0, 1970-01-01, was a Thursday (3).
  return ((((toDayNumber(d) + 3) % 7) + 7) % 7) as Weekday;
}

/** The `start` day on or before `d` (R48.4). No default, so no caller falls back to Monday. */
export function weekStartOf(d: IsoDate, start: Weekday): IsoDate {
  return addDays(d, -((weekday(d) - start + 7) % 7));
}

/**
 * The week to show once the start day changes from `from` to `to` (R48.7, DD66): the new current
 * week if the current week was showing, and otherwise the new week holding the old one's fourth date.
 * That week shares at least four dates with the old one, and no other week starting on `to` shares more.
 */
export function reanchorWeek(v: {
  weekStart: IsoDate;
  today: IsoDate;
  from: Weekday;
  to: Weekday;
}): IsoDate {
  if (v.weekStart === weekStartOf(v.today, v.from)) return weekStartOf(v.today, v.to);
  return weekStartOf(addDays(v.weekStart, 3), v.to);
}

/** Seven consecutive dates from `weekStart` (30.1, 34.4). */
export function weekDates(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// One formatter per zone. Constructing one is the expensive part, and the hook asks every minute.
const todayFormatters = new Map<string, Intl.DateTimeFormat>();

function todayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = todayFormatters.get(timeZone);
  if (formatter === undefined) {
    // Throws RangeError for a zone the platform doesn't know, before anything is cached.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    todayFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Whether Intl accepts `tz` as a time zone (34.5). */
export function isValidTimeZone(tz: string): boolean {
  try {
    todayFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The date in `timeZone` at `now` (34.1). Throws RangeError for an unknown zone. */
export function todayIn(timeZone: string, now: number = Date.now()): IsoDate {
  const match = EN_US_DATE.exec(todayFormatter(timeZone).format(now));
  const date = match && parseIsoDate(`${match[3]}-${match[1]}-${match[2]}`);
  // The message stays fixed: it's reported, and the output it would quote isn't needed to debug it.
  if (!date) throw new CalendarFormatError('Intl.DateTimeFormat gave an unexpected date format.');
  return date;
}

// Display formatting uses the device locale (`undefined`) and formats the date's UTC midnight in
// UTC, so the phone's zone can never move it (30.12, 34.2). formatRange isn't used, because it
// hasn't been checked on Hermes.
function display(d: IsoDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(
    toDayNumber(d) * DAY_MS,
  );
}

/** "Thursday" and "October 22" in en-US, or the device locale's equivalents (30.1, 30.12). */
export function formatDay(d: IsoDate): { weekday: string; date: string } {
  return {
    weekday: display(d, { weekday: 'long' }),
    date: display(d, { day: 'numeric', month: 'long' }),
  };
}

/**
 * "Thu" and "Oct 22" in en-US, or the device locale's equivalents: the compact day headings on Meals
 * (specs/redesign/design.md §5.1). VoiceOver reads `formatDay`'s full names instead.
 */
export function formatDayShort(d: IsoDate): { weekday: string; date: string } {
  return {
    weekday: display(d, { weekday: 'short' }),
    date: display(d, { day: 'numeric', month: 'short' }),
  };
}

// 2026-10-19 was a Monday, so adding a Weekday to it gives a date on that day.
const A_MONDAY = Date.UTC(2026, 9, 19) / DAY_MS;

/** "Sunday" in en-US, or the device locale's equivalent (R48.1, 30.12). */
export function weekdayName(day: Weekday): string {
  return display(fromDayNumber(A_MONDAY + day), { weekday: 'long' });
}

/**
 * "Oct 19 – Oct 25" in en-US (30.7). Both ends carry the year when the week isn't wholly inside
 * today's year (edge case 10).
 */
export function formatWeekRange(weekStart: IsoDate, today: IsoDate): string {
  const weekEnd = addDays(weekStart, 6);
  const year = today.slice(0, 4);
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (weekStart.slice(0, 4) !== year || weekEnd.slice(0, 4) !== year) options.year = 'numeric';
  return `${display(weekStart, options)} – ${display(weekEnd, options)}`;
}
