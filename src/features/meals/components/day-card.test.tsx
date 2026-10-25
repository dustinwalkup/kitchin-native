import { fireEvent, render, screen, within } from '@testing-library/react-native';

import type { IsoDate } from '@/lib/calendar';
import { makeMealEntry } from '@/test/factories';
import { themes } from '@/ui/theme';

import { buildWeek, type Day, type MealEntry } from '../domain';
import { DayCard, type DayCardProps } from './day-card';
import type { SlotPhoto } from './slot-row';

// Week components C-WEEK-01 and C-WEEK-04–08, plus C-WEEK-14 for the whole card (meals 4-test-plan
// §4.1), as redesigned (specs/redesign/design.md §5.1). The week of 2026-10-19; Thursday is
// 2026-10-22. The days come from the real buildWeek.

const onEdit = jest.fn();
const onClear = jest.fn();
const theme = themes.light;

const WEEK = '2026-10-19' as IsoDate;
const week = buildWeek(WEEK, [
  makeMealEntry({ id: 'e1', date: '2026-10-22', mealType: 'breakfast', body: 'Porridge' }),
  makeMealEntry({
    id: 'e2',
    date: '2026-10-22',
    mealType: 'dinner',
    body: 'Tacos',
    libraryMealId: 'meal-1',
  }),
  ...(['breakfast', 'lunch', 'dinner'] as const).map((mealType) =>
    makeMealEntry({ id: `fri-${mealType}`, date: '2026-10-23', mealType }),
  ),
]);
const thursday = week[3];
const friday = week[4];

const ui = (day: Day, extra: Partial<DayCardProps> = {}) => (
  <DayCard day={day} isToday={false} onEdit={onEdit} onClear={onClear} {...extra} />
);

beforeEach(() => jest.clearAllMocks());

describe('DayCard', () => {
  it('C-WEEK-01 shows Breakfast, Lunch and Dinner in that order, each with its icon', async () => {
    await render(ui(thursday));

    const rows = screen.getAllByRole('button');
    expect(rows.map((r) => r.props.testID)).toEqual([
      'slot-thu-breakfast',
      'slot-thu-lunch',
      'slot-thu-dinner',
    ]);
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Thursday breakfast: Porridge',
      'Thursday lunch, not planned',
      'Thursday dinner: Tacos',
    ]);
    for (const [r, label] of rows.map(
      (r, i) => [r, ['Breakfast', 'Lunch', 'Dinner'][i]] as const,
    )) {
      expect(within(r).getByText(label)).toBeOnTheScreen();
      expect(
        within(r).getByTestId('meal-type-icon', { includeHiddenElements: true }),
      ).toBeOnTheScreen();
    }
  });

  it('C-WEEK-04 shows a muted "2/3", read as "2 of 3 meals planned"', async () => {
    await render(ui(thursday));

    const count = screen.getByText('2/3');
    expect(count).toHaveProp('accessibilityLabel', '2 of 3 meals planned');
    expect(count).toHaveStyle({ color: theme.inkMuted });
  });

  it('C-WEEK-04 shows a complete day’s "3/3" in sage', async () => {
    await render(ui(friday));

    expect(screen.getByText('3/3')).toHaveStyle({ color: theme.sageInk });
  });

  it('C-WEEK-05 shows the Today pill in blush, and a terracotta edge, only on today', async () => {
    await render(ui(thursday, { isToday: true }));

    expect(screen.getByText('Today')).toHaveStyle({ color: theme.accentInk, fontWeight: '600' });
    expect(screen.getByTestId('today-pill').children[0]).toHaveStyle({
      backgroundColor: theme.accentSoft,
    });
    expect(screen.getByTestId('day-thu')).toHaveStyle({
      borderColor: theme.accent,
      borderWidth: 1,
      backgroundColor: theme.background,
    });

    await screen.rerender(ui(thursday));

    expect(screen.queryByTestId('today-pill')).not.toBeOnTheScreen();
    expect(screen.queryByText('Today')).not.toBeOnTheScreen();
    expect(screen.getByTestId('day-thu')).not.toHaveStyle({ borderWidth: 1 });
  });

  it('C-WEEK-06 reads the header as one element: day, date, today and the count', async () => {
    await render(ui(thursday, { isToday: true }));

    expect(screen.getByRole('header')).toHaveProp(
      'accessibilityLabel',
      'Thursday October 22, today, 2 of 3 meals planned',
    );
  });

  it('C-WEEK-06 shows the short day and date, "Thu  Oct 22"', async () => {
    await render(ui(thursday));

    expect(screen.getByText('Thu')).toHaveStyle({ fontSize: 20, fontWeight: '700' });
    expect(screen.getByText('Oct 22')).toHaveStyle({ color: theme.inkMuted });
  });

  it('C-WEEK-06 leaves "today" out on other days', async () => {
    await render(ui(week[0]));

    expect(screen.getByRole('header')).toHaveProp(
      'accessibilityLabel',
      'Monday October 19, 0 of 3 meals planned',
    );
  });

  it('passes a slot tap and the Clear action up with the slot', async () => {
    await render(ui(thursday));

    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await fireEvent(screen.getByTestId('slot-thu-dinner'), 'accessibilityAction', {
      nativeEvent: { actionName: 'clear' },
    });

    expect(onEdit).toHaveBeenCalledWith(thursday.slots[1]);
    expect(onClear).toHaveBeenCalledWith(thursday.slots[2]);
  });

  it("asks for each planned meal's photo and shows the ones it gets (DD-R10)", async () => {
    const photo: SlotPhoto = { uri: 'https://example.test/tacos.jpg', cacheKey: 'h/tacos.jpg' };
    const photoFor = jest.fn((entry: MealEntry) =>
      entry.libraryMealId === 'meal-1' ? photo : undefined,
    );
    await render(ui(thursday, { photoFor }));

    // Only planned slots are asked about.
    expect(photoFor.mock.calls.map(([entry]) => entry.id)).toEqual(['e1', 'e2']);
    const dinner = screen.getByTestId('slot-thu-dinner');
    expect(within(dinner).getByTestId('slot-photo', { includeHiddenElements: true })).toBeTruthy();
    expect(
      within(screen.getByTestId('slot-thu-breakfast')).queryByTestId('slot-photo', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it('shows no photos without photoFor', async () => {
    await render(ui(thursday));

    expect(
      screen.queryByTestId('slot-photo', { includeHiddenElements: true }),
    ).not.toBeOnTheScreen();
  });

  it('reports its layout, so the screen can scroll to today (R31.1)', async () => {
    const onLayout = jest.fn();
    await render(ui(thursday, { isToday: true, onLayout }));

    const event = { nativeEvent: { layout: { x: 0, y: 420, width: 390, height: 180 } } };
    await fireEvent(screen.getByTestId('day-thu'), 'layout', event);

    expect(onLayout).toHaveBeenCalledWith(event);
  });

  it('is memoised, so the same props draw nothing again', async () => {
    const photoFor = jest.fn(() => undefined);
    const props = ui(thursday, { photoFor }).props;
    await render(<DayCard {...props} />);
    const calls = photoFor.mock.calls.length;

    await screen.rerender(<DayCard {...props} />);

    expect(calls).toBeGreaterThan(0);
    expect(photoFor).toHaveBeenCalledTimes(calls);
  });

  it('C-WEEK-14 has only static test IDs, none with meal text', async () => {
    await render(ui(thursday, { isToday: true, photoFor: () => ({ cacheKey: 'h/tacos.jpg' }) }));

    const ids = screen
      .getAllByTestId(/./, { includeHiddenElements: true })
      .map((e) => e.props.testID as string);
    expect(new Set(ids)).toEqual(
      new Set([
        'day-thu',
        'today-pill',
        'slot-thu-breakfast',
        'slot-thu-lunch',
        'slot-thu-dinner',
        'meal-type-icon',
        'slot-photo',
      ]),
    );
  });
});
