import { fireEvent, render, screen } from '@testing-library/react-native';

import type { IsoDate, Weekday } from '@/lib/calendar';
import { touchTarget } from '@/test/a11y';
import { themes } from '@/ui/theme';

import { WeekHeader } from './week-header';

// Week components C-WEEK-10 and C-WEEK-11 (meals 4-test-plan §4.1), and C-WEEK-16 (§14.3). Today
// is Thursday 2026-10-22, in the Monday week of 2026-10-19 and the Sunday week of 2026-10-18.

const onPrevious = jest.fn();
const onNext = jest.fn();
const onThisWeek = jest.fn();

const TODAY = '2026-10-22' as IsoDate;

const ui = (weekStart: string, start: Weekday = 0) => (
  <WeekHeader
    weekStart={weekStart as IsoDate}
    start={start}
    today={TODAY}
    onPrevious={onPrevious}
    onNext={onNext}
    onThisWeek={onThisWeek}
  />
);

beforeEach(() => jest.clearAllMocks());

describe('WeekHeader', () => {
  it('C-WEEK-10 shows the week as a header', async () => {
    await render(ui('2026-10-19'));

    expect(screen.getByRole('header')).toHaveTextContent('Oct 19 – Oct 25');
  });

  it('C-WEEK-10 Previous week and Next week call their handlers', async () => {
    await render(ui('2026-10-19'));

    await fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
    expect(onPrevious).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('C-WEEK-10 hides Back to this week on the current week', async () => {
    await render(ui('2026-10-19'));

    expect(screen.queryByRole('button', { name: 'Back to this week' })).not.toBeOnTheScreen();
  });

  it.each(['2026-10-12', '2026-10-26'])(
    'C-WEEK-10 shows Back to this week on the week of %s, and it calls onThisWeek',
    async (weekStart) => {
      await render(ui(weekStart));

      await fireEvent.press(screen.getByRole('button', { name: 'Back to this week' }));

      expect(onThisWeek).toHaveBeenCalledTimes(1);
      expect(onPrevious).not.toHaveBeenCalled();
      expect(onNext).not.toHaveBeenCalled();
    },
  );

  it('C-WEEK-16 decides the current week from the start day (R48.4)', async () => {
    await render(ui('2026-10-18', 6));

    expect(screen.getByRole('header')).toHaveTextContent('Oct 18 – Oct 24');
    expect(screen.queryByRole('button', { name: 'Back to this week' })).not.toBeOnTheScreen();
  });

  it('C-WEEK-16 shows Back to this week on a Sunday week that isn’t the current one', async () => {
    await render(ui('2026-10-11', 6));

    expect(screen.getByRole('button', { name: 'Back to this week' })).toBeOnTheScreen();
  });

  it.each(['week-previous', 'week-next', 'week-this'])(
    'C-WEEK-11 %s is at least 44 × 44 pt',
    async (testID) => {
      await render(ui('2026-10-26'));

      const target = touchTarget(screen.getByTestId(testID));
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    },
  );

  // accentInk, not accent: terracotta on the ivory page is under 3:1 for an icon (N13).
  it('uses chevron symbols in deep terracotta for the arrows', async () => {
    await render(ui('2026-10-19'));

    const previous = screen.getByTestId('week-previous').children[0];
    const next = screen.getByTestId('week-next').children[0];
    expect(previous).toHaveProp('name', 'chevron.left');
    expect(next).toHaveProp('name', 'chevron.right');
    expect(previous).toHaveProp('tintColor', themes.light.accentInk);
    expect(next).toHaveProp('tintColor', themes.light.accentInk);
  });
});
