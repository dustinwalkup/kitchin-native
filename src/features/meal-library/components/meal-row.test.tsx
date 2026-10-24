import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';
import { makeLibraryMeal, makeLibraryTag } from '@/test/factories';
import { themes } from '@/ui/theme';

import type { Meal } from '../domain';
import { mealLabel, MealRow, type MealRowProps } from './meal-row';

// Browser components C-LBR-08, 12 and 13 for rows (4-test-plan §4.1), and the library's swipe to
// delete and chevron (C-LIB-11). jest-setup.ts draws the swipeable's Delete beside the row, as if
// swiped open.

const theme = themes.light;
const onPress = jest.fn();

const DINNER = makeLibraryTag({ id: 'tag-dinner', name: 'Dinner' });
const QUICK = makeLibraryTag({ id: 'tag-quick', name: 'Quick & Easy' });
const tagsById = new Map([DINNER, QUICK].map((tag) => [tag.id, tag]));

const TACOS = makeLibraryMeal({ id: 'meal-tacos', name: 'Tacos', tagIds: [DINNER.id, QUICK.id] });

const onDelete = jest.fn();

const ui = (meal: Meal, manage: Partial<MealRowProps> = {}) => (
  <MealRow meal={meal} tagsById={tagsById} hint="Edits this meal" onPress={onPress} {...manage} />
);

const row = () => screen.getByRole('button');

beforeEach(() => jest.clearAllMocks());

describe('MealRow', () => {
  it('C-LBR-08 shows the name, then its tags as pills in order', async () => {
    await render(ui(TACOS));

    expect(within(row()).getByText('Tacos')).toBeOnTheScreen();
    expect(
      within(row())
        .getAllByText(/^(Dinner|Quick & Easy)$/)
        .map((t) => t.props.children),
    ).toEqual(['Dinner', 'Quick & Easy']);
  });

  it('C-LBR-08 wraps a long name and long tags rather than truncating them', async () => {
    const long = `${'Slow-cooked beef ragù with pappardelle, '.repeat(3)}and a green salad`;
    await render(ui({ ...TACOS, name: long }));

    expect(screen.getByText(long)).not.toHaveProp('numberOfLines');
    expect(screen.getByText('Quick & Easy')).not.toHaveProp('numberOfLines');
  });

  it('C-LBR-08 reads "Tacos. Tags: Dinner, Quick & Easy", as a button with a hint', async () => {
    await render(ui(TACOS));

    expect(row()).toHaveProp('accessibilityLabel', 'Tacos. Tags: Dinner, Quick & Easy');
    expect(row()).toHaveProp('accessibilityHint', 'Edits this meal');
  });

  it('C-LBR-08 shows and reads only the name of a meal with no tags', async () => {
    await render(ui({ ...TACOS, tagIds: [] }));

    expect(row()).toHaveProp('accessibilityLabel', 'Tacos');
    expect(screen.queryByText('Dinner')).toBeNull();
  });

  it('mealLabel joins the tag names after the name', () => {
    expect(mealLabel('Soup', ['Lunch'])).toBe('Soup. Tags: Lunch');
    expect(mealLabel('Soup', [])).toBe('Soup');
  });

  it('DD57 draws its pills as ink on accentSoft', async () => {
    await render(ui(TACOS));

    const text = screen.getByText('Dinner');
    expect(text).toHaveStyle({ color: theme.ink });
    expect(text.parent).toHaveStyle({ backgroundColor: theme.accentSoft });
  });

  it('R40.7 passes the meal to onPress when tapped', async () => {
    await render(ui(TACOS));

    await fireEvent.press(row());

    expect(onPress).toHaveBeenCalledWith(TACOS);
  });

  // The row spans the list, so only its height can be measured here.
  it('C-LBR-12 is at least 44 pt tall', async () => {
    await render(ui(TACOS));

    expect(touchTarget(row()).height).toBeGreaterThanOrEqual(44);
  });

  it('C-LBR-13 has a test ID with the meal ID and no meal text', async () => {
    await render(ui(TACOS));

    expect(row()).toHaveProp('testID', 'meal-row-meal-tacos');
  });
});

describe('MealRow in the library (C-LIB-11)', () => {
  const deleteAction = () =>
    screen.getByTestId('meal-delete-meal-tacos', { includeHiddenElements: true });

  it('R44.8 Delete behind the swipe passes the meal to onDelete, without opening it', async () => {
    await render(ui(TACOS, { onDelete }));

    await fireEvent.press(deleteAction());

    expect(onDelete).toHaveBeenCalledWith(TACOS);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('N10 hides the swipe action from VoiceOver, which has the row action instead', async () => {
    await render(ui(TACOS, { onDelete }));

    expect(screen.queryByTestId('meal-delete-meal-tacos')).toBeNull();
    expect(deleteAction()).toHaveTextContent('Delete');
    expect(row().props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);

    await fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

    expect(onDelete).toHaveBeenCalledWith(TACOS);
  });

  it('N13 draws Delete in bold white on the destructive colour', async () => {
    await render(ui(TACOS, { onDelete }));

    expect(deleteAction()).toHaveStyle({ backgroundColor: theme.destructive });
    expect(within(deleteAction()).getByText('Delete', { includeHiddenElements: true })).toHaveStyle(
      {
        color: theme.onBrand,
        fontWeight: '700',
      },
    );
  });

  it('keeps the card edge on the swipeable, so the row slides inside it', async () => {
    await render(ui(TACOS, { onDelete }));

    expect(row()).not.toHaveStyle({ borderWidth: 1 });
    expect(row().parent).toHaveStyle({ borderWidth: 1, borderColor: theme.tertiary });
  });

  it('R40.7 shows a chevron when the row opens the meal, and none otherwise', async () => {
    await render(ui(TACOS, { disclosure: true }));
    expect(row().children.at(-1)).toHaveProp('name', 'chevron.right');

    await screen.rerender(ui(TACOS));
    expect(row().children.at(-1)).not.toHaveProp('name', 'chevron.right');
  });

  it('R45.10 offers no Delete without onDelete, as in the picker', async () => {
    await render(ui(TACOS));

    expect(
      screen.queryByTestId('meal-delete-meal-tacos', { includeHiddenElements: true }),
    ).toBeNull();
    expect(row().props.accessibilityActions).toBeUndefined();
    expect(row()).toHaveStyle({ borderWidth: 1, borderColor: theme.tertiary });
  });
});
