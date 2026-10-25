import { fireEvent, render, screen, within } from '@testing-library/react-native';

import type { IsoDate } from '@/lib/calendar';
import { touchTarget } from '@/test/a11y';
import { makeMealEntry } from '@/test/factories';
import { themes } from '@/ui/theme';

import { MEAL_TYPES, type MealType } from '../constants';
import type { Slot } from '../domain';
import { type SlotPhoto, SlotRow, splitBody } from './slot-row';

// Week components C-WEEK-02, 03, 07, 08, 11, 14 and 15 (meals 4-test-plan §4.1), as redesigned
// (specs/redesign/design.md §5.1). 2026-10-22 is a Thursday.

const onEdit = jest.fn();
const onClear = jest.fn();
const theme = themes.light;

const THURSDAY = '2026-10-22' as IsoDate;
const slot = (mealType: MealType, body?: string): Slot => ({
  date: THURSDAY,
  mealType,
  entry: body === undefined ? null : makeMealEntry({ date: THURSDAY, mealType, body }),
});

const ui = (s: Slot, photo?: SlotPhoto) => (
  <SlotRow slot={s} weekdayName="Thursday" photo={photo} onEdit={onEdit} onClear={onClear} />
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

  it('C-WEEK-02 shows a meal copied with a description as its first line, then the rest muted', async () => {
    await render(ui(slot('lunch', 'Chicken salad\nWith the herb dressing\nServes 4')));

    expect(screen.getByText('Chicken salad')).toHaveStyle({ color: theme.ink });
    expect(screen.getByText('With the herb dressing\nServes 4')).toHaveStyle({
      color: theme.inkMuted,
      fontSize: 13,
    });
  });

  it("C-WEEK-02 sets dinner's name in semibold and other meals in regular", async () => {
    await render(ui(slot('dinner', 'Tacos')));
    expect(screen.getByText('Tacos')).toHaveStyle({ fontWeight: '600' });

    await render(ui(slot('breakfast', 'Porridge')));
    expect(screen.getByText('Porridge')).toHaveStyle({ fontWeight: '400' });
  });

  it('C-WEEK-02 shows the meal type as a muted label', async () => {
    await render(ui(slot('dinner', 'Tacos')));

    expect(screen.getByText('Dinner')).toHaveStyle({ color: theme.inkMuted });
  });

  it('C-WEEK-03 shows a muted "Add dinner" with a plus for an empty slot', async () => {
    await render(ui(slot('dinner')));

    expect(screen.getByText('Add dinner')).toHaveStyle({ color: theme.inkMuted });
    expect(row().children.at(-1)).toHaveProp('name', 'plus');
  });

  it('C-WEEK-02 ends a planned slot with a chevron', async () => {
    await render(ui(slot('dinner', 'Tacos')));

    expect(screen.queryByText('Add dinner')).not.toBeOnTheScreen();
    expect(row().children.at(-1)).toHaveProp('name', 'chevron.right');
  });

  it('C-WEEK-07 reads "Thursday dinner: Tacos", as a button with a hint', async () => {
    await render(ui(slot('dinner', 'Tacos')));

    expect(row()).toHaveProp('accessibilityLabel', 'Thursday dinner: Tacos');
    expect(row()).toHaveProp('accessibilityHint', 'Changes this meal');
  });

  it('C-WEEK-07 hints that tapping an empty slot plans it', async () => {
    await render(ui(slot('lunch')));

    expect(row()).toHaveProp('accessibilityHint', 'Plans this meal');
  });

  it('C-WEEK-07 reads "Thursday breakfast, not planned" for an empty slot', async () => {
    await render(ui(slot('breakfast')));

    expect(row()).toHaveProp('accessibilityLabel', 'Thursday breakfast, not planned');
  });

  it('R32.1 opens the plan sheet for the slot when tapped', async () => {
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

  it('C-WEEK-08 ignores any other accessibility action', async () => {
    await render(ui(slot('dinner', 'Tacos')));

    await fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName: 'magicTap' } });

    expect(onClear).not.toHaveBeenCalled();
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
    async ({ key, symbol, glyph }) => {
      await render(ui(slot(key)));

      const icon = screen.getByTestId('meal-type-icon', { includeHiddenElements: true });
      expect(icon).toHaveProp('accessibilityElementsHidden', true);
      expect(icon).toHaveProp('importantForAccessibility', 'no-hide-descendants');
      // A glyph alone, with no tinted circle behind it (design §5.1).
      expect(icon).not.toHaveStyle({ backgroundColor: expect.anything() });
      expect(icon.children[0]).toHaveProp('name', symbol);
      expect(icon.children[0]).toHaveProp('tintColor', theme[glyph]);
      // VoiceOver reaches the row, not the icon inside it.
      expect(within(row()).queryByTestId('meal-type-icon')).toBeNull();
    },
  );

  it("shows a library meal's photo as a small decorative thumbnail (DD-R10)", async () => {
    await render(
      ui(slot('dinner', 'Tacos'), { uri: 'https://example.test/tacos.jpg', cacheKey: 'h/p.jpg' }),
    );

    const photo = screen.getByTestId('slot-photo', { includeHiddenElements: true });
    expect(photo).toHaveStyle({ width: 34, height: 34 });
    expect(photo).toHaveProp('accessibilityElementsHidden', true);
    expect(
      screen.getByTestId('slot-photo-image', { includeHiddenElements: true }).props.source,
    ).toEqual([{ uri: 'https://example.test/tacos.jpg', cacheKey: 'h/p.jpg' }]);
    // VoiceOver reads the meal's name, not the photo.
    expect(row()).toHaveProp('accessibilityLabel', 'Thursday dinner: Tacos');
  });

  it('shows the placeholder while the photo has no URL yet', async () => {
    await render(ui(slot('dinner', 'Tacos'), { cacheKey: 'h/p.jpg' }));

    expect(screen.getByTestId('slot-photo', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(
      screen.queryByTestId('slot-photo-image', { includeHiddenElements: true }),
    ).not.toBeOnTheScreen();
  });

  it('shows no thumbnail without a photo', async () => {
    await render(ui(slot('dinner', 'Tacos')));

    expect(
      screen.queryByTestId('slot-photo', { includeHiddenElements: true }),
    ).not.toBeOnTheScreen();
  });
});

describe('splitBody', () => {
  it('returns a one-line meal as its title, with no detail', () => {
    expect(splitBody('Tacos')).toEqual({ title: 'Tacos', detail: null });
  });

  it('splits the first line from the rest, keeping inner line breaks', () => {
    expect(splitBody('Tacos\nWith salsa\nAnd lime')).toEqual({
      title: 'Tacos',
      detail: 'With salsa\nAnd lime',
    });
  });

  it('trims the detail, and drops one that is only blank lines', () => {
    expect(splitBody('Tacos\n\n  With salsa  \n')).toEqual({
      title: 'Tacos',
      detail: 'With salsa',
    });
    expect(splitBody('Tacos\n \n')).toEqual({ title: 'Tacos', detail: null });
  });
});
