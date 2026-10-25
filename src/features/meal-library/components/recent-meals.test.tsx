import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { makeLibraryMeal } from '@/test/factories';

import { RecentMeals, type RecentMealsProps } from './recent-meals';

// Recently used: the meals planned last, as photo cards (specs/redesign/design.md DD-R10).

const TACOS = makeLibraryMeal({
  id: 'meal-1',
  name: 'Tacos',
  mealType: 'dinner',
  imagePath: 'household-1/tacos.jpg',
});
const SOUP = makeLibraryMeal({ id: 'meal-2', name: 'Tomato soup' });

const onPress = jest.fn();

const ui = (overrides: Partial<RecentMealsProps> = {}) => (
  <RecentMeals
    meals={[TACOS, SOUP]}
    imageUrls={{ 'household-1/tacos.jpg': 'https://storage.test/tacos' }}
    onPress={onPress}
    hint="Chooses this meal"
    {...overrides}
  />
);

const card = (id: string) => screen.getByTestId(`recent-meal-${id}`);
const images = (id: string) => card(id).queryAll((node) => node.props.recyclingKey !== undefined);

beforeEach(() => jest.clearAllMocks());

describe('RecentMeals', () => {
  it('draws nothing when no meal has been planned from the library', async () => {
    await render(ui({ meals: [] }));

    expect(screen.queryByTestId('recent-meals')).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  it('shows "Recently used", then a card per meal, in the order given', async () => {
    await render(ui());

    const section = within(screen.getByTestId('recent-meals'));
    expect(section.getByRole('header', { name: 'Recently used' })).toBeOnTheScreen();
    expect(section.getAllByTestId(/^recent-meal-/).map((element) => element.props.testID)).toEqual([
      'recent-meal-meal-1',
      'recent-meal-meal-2',
    ]);
  });

  it('scrolls the cards sideways, keeping the first tap while the keyboard is up', async () => {
    await render(ui());

    const row = card('meal-1').parent!.parent!;
    expect(row).toHaveProp('horizontal', true);
    expect(row).toHaveProp('keyboardShouldPersistTaps', 'handled');
  });

  it('captions a card with the name and, when it has one, the type', async () => {
    await render(ui());

    expect(within(card('meal-1')).getByText('Tacos')).toHaveProp('numberOfLines', 2);
    expect(within(card('meal-1')).getByText('Dinner')).toBeOnTheScreen();
    expect(within(card('meal-2')).getByText('Tomato soup')).toBeOnTheScreen();
    expect(within(card('meal-2')).queryByText(/Breakfast|Lunch|Dinner/)).toBeNull();
  });

  it('N10 reads each card as one button: the name and type, with the hint', async () => {
    await render(ui());

    expect(card('meal-1')).toHaveProp('accessibilityRole', 'button');
    expect(card('meal-1')).toHaveProp('accessibilityLabel', 'Tacos, dinner');
    expect(card('meal-1')).toHaveProp('accessibilityHint', 'Chooses this meal');
    expect(card('meal-2')).toHaveProp('accessibilityLabel', 'Tomato soup');
  });

  it("shows a meal's photo from its signed URL, and the placeholder for one without", async () => {
    await render(ui());

    expect(images('meal-1')).toHaveLength(1);
    expect(images('meal-1')[0]).toHaveProp('source', [
      { uri: 'https://storage.test/tacos', cacheKey: 'household-1/tacos.jpg' },
    ]);
    expect(images('meal-2')).toEqual([]);
  });

  it("shows the placeholder while a photo's URL is still being signed", async () => {
    await render(ui({ imageUrls: {} }));

    expect(images('meal-1')).toEqual([]);
    expect(card('meal-1').queryAll((node) => node.props.name === 'moon.stars.fill')).toHaveLength(
      1,
    );
  });

  it('passes the tapped meal to onPress', async () => {
    await render(ui());

    await fireEvent.press(card('meal-2'));

    expect(onPress).toHaveBeenCalledWith(SOUP);
  });

  it('R26.7 uses test IDs without meal text', async () => {
    await render(ui());

    const ids = screen
      .queryAllByTestId(/.+/, { includeHiddenElements: true })
      .map((element) => element.props.testID as string);
    expect(ids.join(' ')).not.toMatch(/tacos\b|soup\b|tomato/i);
  });
});
