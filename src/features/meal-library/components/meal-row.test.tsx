import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';
import { makeLibraryMeal, makeLibraryTag } from '@/test/factories';
import { themes } from '@/ui/theme';

import type { Meal } from '../domain';
import { mealLabel, MealRow } from './meal-row';

// Browser components C-LBR-08, 12 and 13 for rows (4-test-plan §4.1).

const theme = themes.light;
const onPress = jest.fn();

const DINNER = makeLibraryTag({ id: 'tag-dinner', name: 'Dinner' });
const QUICK = makeLibraryTag({ id: 'tag-quick', name: 'Quick & Easy' });
const tagsById = new Map([DINNER, QUICK].map((tag) => [tag.id, tag]));

const TACOS = makeLibraryMeal({ id: 'meal-tacos', name: 'Tacos', tagIds: [DINNER.id, QUICK.id] });

const ui = (meal: Meal) => (
  <MealRow meal={meal} tagsById={tagsById} hint="Edits this meal" onPress={onPress} />
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
