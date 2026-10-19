import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { IsoDate } from '@/lib/calendar';
import { makeMealEntry } from '@/test/factories';
import { themes } from '@/ui/theme';

import { DAY_ACCENTS, DAY_KEYS, type MealType } from '../constants';
import { buildWeek, type Day } from '../domain';
import { DayCard } from './day-card';

// Week components C-WEEK-01 and C-WEEK-04–09, plus C-WEEK-14 for the whole card (meals 4-test-plan
// §4.1). The week of 2026-10-19; Thursday is 2026-10-22. The days come from the real buildWeek.

const onEdit = jest.fn();
const onClear = jest.fn();
const renderEditor = jest.fn((_slot, name: string) => <Text testID="slot-editor">{name}</Text>);
const theme = themes.light;

const WEEK = '2026-10-19' as IsoDate;
const week = buildWeek(WEEK, [
  makeMealEntry({ id: 'e1', date: '2026-10-22', mealType: 'breakfast', body: 'Porridge' }),
  makeMealEntry({ id: 'e2', date: '2026-10-22', mealType: 'dinner', body: 'Tacos' }),
]);
const thursday = week[3];

const ui = (day: Day, { isToday = false, editing = null as MealType | null } = {}) => (
  <DayCard
    day={day}
    isToday={isToday}
    editing={editing}
    renderEditor={renderEditor}
    onEdit={onEdit}
    onClear={onClear}
  />
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

  it('C-WEEK-04 shows "2/3", read as "2 of 3 meals planned"', async () => {
    await render(ui(thursday));

    expect(screen.getByText('2/3')).toHaveProp('accessibilityLabel', '2 of 3 meals planned');
  });

  it('C-WEEK-05 shows the Today pill, bold white on terracotta, only on today', async () => {
    await render(ui(thursday, { isToday: true }));

    expect(screen.getByText('Today')).toHaveStyle({ color: theme.onBrand, fontWeight: '700' });
    expect(screen.getByTestId('today-pill')).toHaveStyle({ backgroundColor: theme.accent });

    await screen.rerender(ui(thursday));

    expect(screen.queryByText('Today')).not.toBeOnTheScreen();
  });

  it('C-WEEK-06 reads the header as one element: day, date, today and the count', async () => {
    await render(ui(thursday, { isToday: true }));

    expect(screen.getByRole('header')).toHaveProp(
      'accessibilityLabel',
      'Thursday October 22, today, 2 of 3 meals planned',
    );
    expect(screen.getByText('Thursday')).toBeOnTheScreen();
    expect(screen.getByText('October 22')).toBeOnTheScreen();
  });

  it('C-WEEK-06 leaves "today" out on other days', async () => {
    await render(ui(week[0]));

    expect(screen.getByRole('header')).toHaveProp(
      'accessibilityLabel',
      'Monday October 19, 0 of 3 meals planned',
    );
  });

  it.each(DAY_KEYS.map((key, i) => [key, DAY_ACCENTS[i]] as const))(
    'C-WEEK-09 %s has the %s accent edge',
    async (key, accent) => {
      await render(ui(week[DAY_KEYS.indexOf(key)]));

      const card = screen.getByTestId(`day-${key}`).children[0];
      expect(card).toHaveStyle({ borderLeftWidth: 4, borderLeftColor: theme[accent] });
    },
  );

  it('passes a slot tap and the Clear action up with the slot', async () => {
    await render(ui(thursday));

    await fireEvent.press(screen.getByTestId('slot-thu-lunch'));
    await fireEvent(screen.getByTestId('slot-thu-dinner'), 'accessibilityAction', {
      nativeEvent: { actionName: 'clear' },
    });

    expect(onEdit).toHaveBeenCalledWith(thursday.slots[1]);
    expect(onClear).toHaveBeenCalledWith(thursday.slots[2]);
  });

  it('draws the editor in place of the open slot, named for VoiceOver', async () => {
    await render(ui(thursday, { editing: 'dinner' }));

    expect(renderEditor).toHaveBeenCalledWith(thursday.slots[2], 'Thursday dinner');
    expect(screen.getByTestId('slot-editor')).toBeOnTheScreen();
    expect(screen.queryByTestId('slot-thu-dinner')).not.toBeOnTheScreen();
    expect(screen.getByTestId('slot-thu-breakfast')).toBeOnTheScreen();
  });

  it('is memoised, so the same props draw nothing again', async () => {
    const props = ui(thursday, { editing: 'lunch' }).props;
    await render(<DayCard {...props} />);

    await screen.rerender(<DayCard {...props} />);

    expect(renderEditor).toHaveBeenCalledTimes(1);
  });

  it('C-WEEK-14 has only static test IDs, none with meal text', async () => {
    await render(ui(thursday, { isToday: true }));

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
      ]),
    );
  });
});
