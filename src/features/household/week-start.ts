// The household's start of the week as the database stores it (specs/meals/2-design.md §11.3,
// DD62). Pure: no React or React Native imports. Day names rather than numbers, because JavaScript,
// Postgres and `weekday` each number the days from a different one.
import type { Weekday } from '@/lib/calendar';

/** `households.week_start` values, indexed by `Weekday` (0 = Monday). */
export const WEEK_START_VALUES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeekStartValue = (typeof WEEK_START_VALUES)[number];

/** Monday, the start every household has until a member changes it (R48.3). */
export const DEFAULT_WEEK_START: Weekday = 0;

/** The day a stored value names, or null for one this build doesn't know (R48.11). */
export function parseWeekStart(value: string): Weekday | null {
  const index = (WEEK_START_VALUES as readonly string[]).indexOf(value);
  return index === -1 ? null : (index as Weekday);
}

export function weekStartValue(day: Weekday): WeekStartValue {
  return WEEK_START_VALUES[day];
}
