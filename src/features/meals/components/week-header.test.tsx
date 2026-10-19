import { fireEvent, render, screen } from '@testing-library/react-native';

import type { IsoDate } from '@/lib/calendar';
import { touchTarget } from '@/test/a11y';
import { themes } from '@/ui/theme';

import { WeekHeader } from './week-header';

// Week components C-WEEK-10 and C-WEEK-11 (meals 4-test-plan §4.1). Today is Thursday 2026-10-22,
// in the week of 2026-10-19.

const onPrevious = jest.fn();
const onNext = jest.fn();
const onThisWeek = jest.fn();

const TODAY = '2026-10-22' as IsoDate;

const ui = (weekStart: string) => (
  <WeekHeader
    weekStart={weekStart as IsoDate}
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

  it('C-WEEK-10 hides This week on the current week', async () => {
    await render(ui('2026-10-19'));

    expect(screen.queryByRole('button', { name: 'This week' })).not.toBeOnTheScreen();
  });

  it.each(['2026-10-12', '2026-10-26'])(
    'C-WEEK-10 shows This week on the week of %s, and it calls onThisWeek',
    async (weekStart) => {
      await render(ui(weekStart));

      await fireEvent.press(screen.getByRole('button', { name: 'This week' }));

      expect(onThisWeek).toHaveBeenCalledTimes(1);
      expect(onPrevious).not.toHaveBeenCalled();
      expect(onNext).not.toHaveBeenCalled();
    },
  );

  it.each(['week-previous', 'week-next', 'week-this'])(
    'C-WEEK-11 %s is at least 44 × 44 pt',
    async (testID) => {
      await render(ui('2026-10-26'));

      const target = touchTarget(screen.getByTestId(testID));
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    },
  );

  it('uses chevron symbols in terracotta for the arrows', async () => {
    await render(ui('2026-10-19'));

    expect(screen.getByTestId('week-previous').children[0]).toHaveProp('name', 'chevron.left');
    expect(screen.getByTestId('week-next').children[0]).toHaveProp(
      'tintColor',
      themes.light.accent,
    );
  });
});
