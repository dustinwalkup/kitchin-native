import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import * as calendar from '@/lib/calendar';
import { reportOnce } from '@/lib/reporting';

import type { HouseholdState } from './household-provider';
import { useHouseholdToday } from './use-household-today';

// U-TDY-01 to U-TDY-07 (specs/meals/4-test-plan.md §3.2). The real calendar module runs, except in
// U-TDY-04 and U-TDY-05, which spy on it (§8.4).

jest.mock('@/lib/reporting', () => ({ reportOnce: jest.fn() }));

function household(timeZone: string): HouseholdState {
  return {
    status: 'ready',
    household: { id: 'household-1', name: 'Household One', timeZone },
    member: { userId: 'user-a', displayName: 'Member A' },
  };
}

let mockHousehold: HouseholdState = household('Pacific/Auckland');
jest.mock('./household-provider', () => ({ useHousehold: () => mockHousehold }));

// A mocked AppState emitter (4-test-plan §8.4), which the foreground clock listens to.
let appStateListeners: ((state: AppStateStatus) => void)[] = [];
const emitAppState = (state: AppStateStatus) =>
  act(async () => appStateListeners.forEach((l) => l(state)));

const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

// The preset's AppState mock has a function for `currentState`, which jest.replaceProperty refuses.
const presetCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;

/** Starts the clock at `iso` (UTC). */
function startAt(iso: string) {
  jest.useFakeTimers({ now: new Date(iso) });
}

/**
 * The hook's minute ticks that are still running. React and the testing library keep timers of
 * their own, so `jest.getTimerCount()` can't tell them apart.
 */
function trackTicks() {
  const set = jest.spyOn(globalThis, 'setInterval');
  const clear = jest.spyOn(globalThis, 'clearInterval');
  return () => {
    const cleared = new Set(clear.mock.calls.map(([id]) => id));
    return set.mock.results.filter(({ value }) => !cleared.has(value)).length;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHousehold = household('Pacific/Auckland');
  appStateListeners = [];
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return {
      remove: () => (appStateListeners = appStateListeners.filter((other) => other !== listener)),
    };
  });
});

afterEach(() => {
  Object.defineProperty(AppState, 'currentState', presetCurrentState);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Renders the hook and counts its renders. */
async function renderToday() {
  const counter = { renders: 0 };
  const rendered = await renderHook(() => {
    counter.renders += 1;
    return useHouseholdToday();
  });
  return { ...rendered, counter };
}

it("U-TDY-01 gives the household's date, not the UTC date", async () => {
  startAt('2026-10-19T12:00:00Z'); // 01:00 on 20 October in Auckland

  const { result } = await renderToday();

  expect(result.current).toBe('2026-10-20');
  expect(reportOnce).not.toHaveBeenCalled();
});

it('U-TDY-02 changes once at midnight in the household zone, and not on the other ticks', async () => {
  startAt('2026-10-19T10:58:00Z'); // 23:58 in Auckland

  const { result, counter } = await renderToday();
  expect(result.current).toBe('2026-10-19');
  const rendersBefore = counter.renders;

  await advance(60_000); // 23:59
  expect(result.current).toBe('2026-10-19');
  expect(counter.renders).toBe(rendersBefore);

  await advance(60_000); // 00:00
  expect(result.current).toBe('2026-10-20');
  expect(counter.renders).toBe(rendersBefore + 1);

  await advance(5 * 60_000);
  expect(result.current).toBe('2026-10-20');
  expect(counter.renders).toBe(rendersBefore + 1);
});

it('U-TDY-03 recomputes as soon as the app returns to the foreground on a later date', async () => {
  startAt('2026-10-19T10:59:30Z'); // 23:59:30 in Auckland

  const { result } = await renderToday();
  expect(result.current).toBe('2026-10-19');

  await emitAppState('background');
  // The clock moves on while the app is away, with no timer firing.
  jest.setSystemTime(new Date('2026-10-19T18:00:00Z'));
  await emitAppState('active');

  expect(result.current).toBe('2026-10-20');
});

it('U-TDY-03 sets no timer while the app is in the background', async () => {
  startAt('2026-10-19T10:59:30Z');
  const runningTicks = trackTicks();

  await renderToday();
  expect(runningTicks()).toBe(1);

  await emitAppState('background');
  expect(runningTicks()).toBe(0);

  await emitAppState('active');
  expect(runningTicks()).toBe(1);
});

it("U-TDY-04 falls back to the phone's zone for an invalid household zone, and reports it once", async () => {
  startAt('2026-10-19T19:00:00Z'); // 00:30 on 20 October in Kolkata; still 19 October in UTC
  mockHousehold = household('Mars/Olympus');
  const deviceTimeZone = jest.spyOn(calendar, 'deviceTimeZone').mockReturnValue('Asia/Kolkata');

  const { result, rerender } = await renderToday();
  expect(result.current).toBe('2026-10-20');
  expect(deviceTimeZone).toHaveBeenCalled();

  await rerender(undefined);
  await advance(3 * 60_000);
  await rerender(undefined);

  expect(reportOnce).toHaveBeenCalledTimes(1);
  expect(reportOnce).toHaveBeenCalledWith('household_time_zone_invalid');
  expect(JSON.stringify(jest.mocked(reportOnce).mock.calls)).not.toMatch(/Mars|Olympus/);
});

it('U-TDY-05 falls back to the local date when Intl gives an unexpected format, and reports it once', async () => {
  startAt('2026-10-19T12:00:00Z');
  // The phone's local date is the date in its own zone, so the test needs no local Date getter.
  const localDate = calendar.todayIn(calendar.deviceTimeZone(), Date.now());
  jest.spyOn(calendar, 'todayIn').mockImplementation(() => {
    throw new calendar.CalendarFormatError('unexpected');
  });

  const { result } = await renderToday();
  expect(result.current).toBe(localDate);

  await advance(3 * 60_000);

  expect(reportOnce).toHaveBeenCalledTimes(1);
  expect(reportOnce).toHaveBeenCalledWith('calendar_format_unexpected');
});

it('U-TDY-05 lets other errors through', async () => {
  startAt('2026-10-19T12:00:00Z');
  jest.spyOn(calendar, 'todayIn').mockImplementation(() => {
    throw new TypeError('something else');
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(renderToday()).rejects.toThrow(TypeError);
});

it('U-TDY-06 recomputes at once when the household zone changes', async () => {
  startAt('2026-10-19T12:00:00Z'); // 20 October in Auckland, 07:00 on 19 October in Chicago

  const { result, rerender } = await renderToday();
  expect(result.current).toBe('2026-10-20');

  mockHousehold = household('America/Chicago');
  await rerender(undefined);

  expect(result.current).toBe('2026-10-19');
});

it("uses the phone's zone, without a report, before the household is ready", async () => {
  startAt('2026-10-19T19:00:00Z');
  mockHousehold = { status: 'loading' };
  jest.spyOn(calendar, 'deviceTimeZone').mockReturnValue('Asia/Kolkata');

  const { result } = await renderToday();

  expect(result.current).toBe('2026-10-20');
  expect(reportOnce).not.toHaveBeenCalled();
});

it('U-TDY-07 leaves no timer or AppState listener after unmount', async () => {
  startAt('2026-10-19T10:58:00Z');
  const runningTicks = trackTicks();

  const { unmount } = await renderToday();
  expect(runningTicks()).toBe(1);
  expect(appStateListeners).toHaveLength(1);

  await unmount();

  expect(runningTicks()).toBe(0);
  expect(appStateListeners).toHaveLength(0);
});
