import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';
import { makeLibraryMeal, makeLibraryTag } from '@/test/factories';
import { themes } from '@/ui/theme';

import type { Meal } from '../domain';
import { mealLabel, MealRow, type MealRowProps } from './meal-row';

// Browser components C-LBR-08, 12 and 13 for rows (4-test-plan §4.1, as redesigned in
// specs/redesign/design.md §5.2), and the library's swipe to delete and chevron (C-LIB-11).
// jest-setup.ts draws the swipeable's Delete beside the row, as if swiped open.

const theme = themes.light;
const onPress = jest.fn();

const FAVOURITE = makeLibraryTag({ id: 'tag-favourite', name: 'Family Favorite' });
const QUICK = makeLibraryTag({ id: 'tag-quick', name: 'Quick & Easy' });
const tagsById = new Map([FAVOURITE, QUICK].map((tag) => [tag.id, tag]));

const TACOS = makeLibraryMeal({
  id: 'meal-tacos',
  name: 'Tacos',
  mealType: 'dinner',
  tagIds: [FAVOURITE.id, QUICK.id],
});
const PHOTO = 'household-1/tacos.jpg';

const onDelete = jest.fn();

const ui = (meal: Meal, manage: Partial<MealRowProps> = {}) => (
  <MealRow meal={meal} tagsById={tagsById} hint="Edits this meal" onPress={onPress} {...manage} />
);

const row = () => screen.getByRole('button');

beforeEach(() => jest.clearAllMocks());

describe('MealRow', () => {
  it('C-LBR-08 shows the name, then its type and its tags as pills in order', async () => {
    await render(ui(TACOS));

    expect(within(row()).getByText('Tacos')).toBeOnTheScreen();
    expect(
      within(row())
        .getAllByText(/^(Dinner|Family Favorite|Quick & Easy)$/)
        .map((t) => t.props.children),
    ).toEqual(['Dinner', 'Family Favorite', 'Quick & Easy']);
  });

  it('DD-R6 draws the type apart from the tags: its glyph and muted name on the sunken tone', async () => {
    await render(ui(TACOS));

    const pill = within(row()).getByTestId('type-pill');
    expect(pill).toHaveStyle({ backgroundColor: theme.sunken });
    expect(within(pill).getByText('Dinner')).toHaveStyle({ color: theme.inkMuted });
    expect(pill.children[0]).toHaveProp('name', 'moon.stars.fill');
    expect(pill.children[0]).toHaveProp('tintColor', theme.dinner);
  });

  it('DD-R6 shows no type pill for a meal with no type', async () => {
    await render(ui({ ...TACOS, mealType: null }));

    expect(screen.queryByTestId('type-pill')).toBeNull();
    expect(screen.getByText('Quick & Easy')).toBeOnTheScreen();
  });

  it('C-LBR-08 wraps a long name and long tags rather than truncating them', async () => {
    const long = `${'Slow-cooked beef ragù with pappardelle, '.repeat(3)}and a green salad`;
    await render(ui({ ...TACOS, name: long }));

    expect(screen.getByText(long)).not.toHaveProp('numberOfLines');
    expect(screen.getByText('Quick & Easy')).not.toHaveProp('numberOfLines');
  });

  it('C-LBR-08 reads "Tacos, dinner. Tags: Family Favorite, Quick & Easy", as a button with a hint', async () => {
    await render(ui(TACOS));

    expect(row()).toHaveProp(
      'accessibilityLabel',
      'Tacos, dinner. Tags: Family Favorite, Quick & Easy',
    );
    expect(row()).toHaveProp('accessibilityHint', 'Edits this meal');
  });

  it('C-LBR-08 shows and reads only the name of a meal with no type or tags', async () => {
    await render(ui({ ...TACOS, mealType: null, tagIds: [] }));

    expect(row()).toHaveProp('accessibilityLabel', 'Tacos');
    expect(screen.queryByText('Dinner')).toBeNull();
    expect(screen.queryByText('Quick & Easy')).toBeNull();
  });

  it('C-LBR-08 reads the type of a meal with no tags', async () => {
    await render(ui({ ...TACOS, tagIds: [] }));

    expect(row()).toHaveProp('accessibilityLabel', 'Tacos, dinner');
  });

  it('mealLabel puts the type after the name, and the tag names after both', () => {
    expect(mealLabel('Soup', ['Quick & Easy'], 'Lunch')).toBe('Soup, lunch. Tags: Quick & Easy');
    expect(mealLabel('Soup', [], 'Dinner')).toBe('Soup, dinner');
    expect(mealLabel('Soup', ['Quick & Easy'])).toBe('Soup. Tags: Quick & Easy');
    expect(mealLabel('Soup', [])).toBe('Soup');
  });

  it('DD57 draws its tag pills as ink on accentSoft', async () => {
    await render(ui(TACOS));

    const text = screen.getByText('Quick & Easy');
    expect(text).toHaveStyle({ color: theme.ink });
    expect(text.parent).toHaveStyle({ backgroundColor: theme.accentSoft });
  });

  it("§5.2 shows the meal's photo at 56 pt, from its signed URL", async () => {
    await render(ui({ ...TACOS, imagePath: PHOTO }, { imageUri: 'https://storage.test/tacos' }));

    const photos = screen.root!.queryAll((node) => node.props.recyclingKey === PHOTO);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveProp('source', [
      { uri: 'https://storage.test/tacos', cacheKey: PHOTO },
    ]);
    expect(photos[0]?.parent).toHaveStyle({ width: 56, height: 56 });
  });

  it("§5.2 shows the type's glyph in place of a photo it doesn't have", async () => {
    await render(ui(TACOS, { imageUri: 'https://storage.test/stale' }));

    expect(screen.root!.queryAll((node) => node.props.recyclingKey !== undefined)).toEqual([]);
    expect(screen.root!.queryAll((node) => node.props.name === 'moon.stars.fill')).toHaveLength(2); // the placeholder and the type pill
  });

  it('§5.2 sits on the page, not on a card', async () => {
    await render(ui(TACOS));

    expect(row()).toHaveStyle({ backgroundColor: theme.screen });
    expect(row()).not.toHaveStyle({ borderWidth: 1 });
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
  });
});
