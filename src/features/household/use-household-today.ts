import { useEffect, useMemo, useState } from 'react';

import { useForegroundSince } from '@/lib/app-foreground';
import {
  CalendarFormatError,
  deviceTimeZone,
  isValidTimeZone,
  todayIn,
  type IsoDate,
} from '@/lib/calendar';
import { reportOnce } from '@/lib/reporting';

import { useHousehold } from './household-provider';

// Today's date in the household's time zone, so both phones agree (specs/meals/2-design.md §3.2).
// Only Meals mounts it.

/** How often to look for a new date while the app is in the foreground (34.3). */
const TICK_MS = 60_000;

interface Reading {
  date: IsoDate;
  unexpectedFormat: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The phone's own date, for when Intl's output can't be read. */
function localDate(): IsoDate {
  const now = new Date();
  // The only local Date getters in src/ (DD30). They run only after todayIn has failed to read
  // Intl's output, and then the phone's own date is the best guess left. It's wrong only near
  // midnight, and only when the phone is set to a zone other than the household's.
  // eslint-disable-next-line no-restricted-properties -- the fallback described above
  const [year, month, day] = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  return `${year}-${pad(month)}-${pad(day)}` as IsoDate;
}

function read(timeZone: string): Reading {
  try {
    return { date: todayIn(timeZone), unexpectedFormat: false };
  } catch (error) {
    if (!(error instanceof CalendarFormatError)) throw error;
    return { date: localDate(), unexpectedFormat: true };
  }
}

export function useHouseholdToday(): IsoDate {
  const household = useHousehold();
  const householdZone = household.status === 'ready' ? household.household.timeZone : null;
  const zoneInvalid = useMemo(
    () => householdZone !== null && !isValidTimeZone(householdZone),
    [householdZone],
  );
  // The phone's zone stands in for an invalid one (34.5), and before the household is ready.
  const timeZone = householdZone !== null && !zoneInvalid ? householdZone : deviceTimeZone();
  const foregroundSince = useForegroundSince();
  const [reading, setReading] = useState(() => read(timeZone));

  // Neither report carries a zone name or a date (R26.3).
  useEffect(() => {
    if (zoneInvalid) reportOnce('household_time_zone_invalid');
  }, [zoneInvalid]);

  useEffect(() => {
    if (reading.unexpectedFormat) reportOnce('calendar_format_unexpected');
  }, [reading.unexpectedFormat]);

  // Reads again when the zone changes, on each return to the foreground and every minute while
  // there. State changes only when the reading does, so consumers re-render once at midnight.
  useEffect(() => {
    const update = () => {
      const next = read(timeZone);
      if (next.date !== reading.date || next.unexpectedFormat !== reading.unexpectedFormat) {
        setReading(next);
      }
    };
    update();
    if (foregroundSince === null) return;
    const timer = setInterval(update, TICK_MS);
    return () => clearInterval(timer);
  }, [timeZone, foregroundSince, reading]);

  return reading.date;
}
