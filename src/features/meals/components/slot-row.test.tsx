import { fireEvent, render, screen, within } from '@testing-library/react-native';

import type { IsoDate } from '@/lib/calendar';
import { touchTarget } from '@/test/a11y';
import { makeMealEntry } from '@/test/factories';
import { themes } from '@/ui/theme';

import { MEAL_TYPES, type MealType } from '../constants';
import type { Slot } from '../domain';
import { SlotRow } from './slot-row';

// Week components C-WEEK-02, 03, 07, 08, 11, 14 and 15 (meals 4-test-plan §4.1). 2026-10-22 is a
// Thursday.

const onEdit = jest.fn();
const onClear = jest.fn();
const theme = themes.light;

const THURSDAY = '2026-10-22' as IsoDate;
const slot = (mealType: MealType, body?: string): Slot => ({
  date: THURSDAY,
  mealType,
  entry: body === undefined ? null : makeMealEntry({ date: THURSDAY, mealType, body }),
});

const ui = (s: Slot) => (
  <SlotRow slot={s} weekdayName="Thursday" onEdit={onEdit} onClear={onClear} />
);

const row = () => screen.getByRole('button');

beforeEach(() => jest.clearAllMocks());

describe('SlotRow', () => {
  it('C-WEEK-02 shows a planned meal in full, with no line limit', async () => {
    const long = `${'Slow-cooked beef ragù with pappardelle, '.repeat(12)}and a green salad`;
    await render(ui(slot('dinner', long)));

    expect(screen.getByText(long)).not.toHaveProp('numberOfLines');
    expect(screen.getByText('Dinner')).toBeOnTheScreen();
  });

  it('C-WEEK-03 shows a muted "＋ Add dinner" for an empty slot', async () => {
    await render(ui(slot('dinner')));

    expect(screen.getByText('＋ Add dinner')).toHaveStyle({ color: theme.inkMuted });
  });

  it('C-WEEK-07 reads "Thursday dinner: Tacos", as a button with a hint', async () => {
    await render(ui(slot('dinner', 'Tacos')));

    expect(row()).toHaveProp('accessibilityLabel', 'Thursday dinner: Tacos');
    expect(row()).toHaveProp('accessibilityHint', 'Edits this meal');
  });

  it('C-WEEK-07 reads "Thursday breakfast, not planned" for an empty slot', async () => {
    await render(ui(slot('breakfast')));

    expect(row()).toHaveProp('accessibilityLabel', 'Thursday breakfast, not planned');
  });

  it('R32.1 opens the slot for editing when tapped', async () => {
    const s = slot('lunch', 'Soup');
    await render(ui(s));

    await fireEvent.press(row());

    expect(onEdit).toHaveBeenCalledWith(s);
    expect(onClear).not.toHaveBeenCalled();
  });

  it('C-WEEK-08 offers Clear on a planned slot, and it calls onClear', async () => {
    const s = slot('dinner', 'Tacos');
    await render(ui(s));

    expect(row()).toHaveProp('accessibilityActions', [{ name: 'clear', label: 'Clear' }]);
    await fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName: 'clear' } });

    expect(onClear).toHaveBeenCalledWith(s);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('C-WEEK-08 offers no Clear on an empty slot', async () => {
    await render(ui(slot('dinner')));

    expect(row().props.accessibilityActions ?? []).toEqual([]);
  });

  // The row spans the card, so only its height can be measured here.
  it('C-WEEK-11 is at least 44 pt tall', async () => {
    await render(ui(slot('dinner')));

    expect(touchTarget(row()).height).toBeGreaterThanOrEqual(44);
  });

  it('C-WEEK-14 has a static test ID with no meal text', async () => {
    await render(ui(slot('dinner', 'Tacos')));

    expect(row()).toHaveProp('testID', 'slot-thu-dinner');
  });

  it.each(MEAL_TYPES)(
    'C-WEEK-15 the $key icon is $symbol in its glyph colour, hidden from VoiceOver',
    async ({ key, symbol, glyph, tint }) => {
      await render(ui(slot(key)));

      const icon = screen.getByTestId('meal-type-icon', { includeHiddenElements: true });
      expect(icon).toHaveProp('accessibilityElementsHidden', true);
      expect(icon).toHaveProp('importantForAccessibility', 'no-hide-descendants');
      expect(icon).toHaveStyle({ backgroundColor: theme[tint] });
      expect(icon.children[0]).toHaveProp('name', symbol);
      expect(icon.children[0]).toHaveProp('tintColor', theme[glyph]);
      // VoiceOver reaches the row, not the icon inside it.
      expect(within(row()).queryByTestId('meal-type-icon')).toBeNull();
    },
  );
});
