import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

import { touchTarget } from '@/test/a11y';
import { makeMealRow, makeTagRow } from '@/test/factories';
import { Text } from '@/ui/text';

import { buildLibrary, type Library } from '../domain';
import { useMealImageUrls } from '../hooks';
import { MealBrowser, type MealBrowserProps } from './meal-browser';

// Browser components C-LBR-01 to C-LBR-14 (4-test-plan §4.1), as redesigned: one row of type and tag
// filters, the wider search and Recently used (specs/redesign/design.md §5.2, DD-R6 to DD-R10). The
// IDs hold no names, so C-LBR-13 can check that no test ID contains one.

// The photos' signed URLs come from a query; here they're whatever the test says.
jest.mock('../hooks', () => ({ useMealImageUrls: jest.fn() }));

const FAVOURITE = 'tag-1';
const COMFORT = 'tag-2';
const QUICK = 'tag-3';
// A legacy type tag, which the library no longer lists (DD-R7).
const LEGACY_DINNER = 'tag-4';
const STEW = 'meal-1';
const POPPERS = 'meal-2';
const OATS = 'meal-3';
const TACOS = 'meal-4';
const TACOS_PHOTO = 'household-1/tacos.jpg';

const links = (...ids: string[]) => ids.map((tag_id) => ({ tag_id }));

const LIBRARY = buildLibrary(
  [
    makeMealRow({
      id: TACOS,
      name: 'Tacos',
      meal_type: 'dinner',
      image_path: TACOS_PHOTO,
      library_meal_tags: links(COMFORT, QUICK, LEGACY_DINNER),
    }),
    makeMealRow({ id: POPPERS, name: 'Jalapeño poppers', library_meal_tags: links(QUICK) }),
    makeMealRow({
      id: STEW,
      name: 'Beef stew',
      meal_type: 'dinner',
      library_meal_tags: links(COMFORT),
    }),
    makeMealRow({
      id: OATS,
      name: 'Overnight oats',
      meal_type: 'breakfast',
      library_meal_tags: links(FAVOURITE, QUICK),
    }),
  ],
  [
    makeTagRow({ id: QUICK, name: 'Quick & Easy' }),
    makeTagRow({ id: COMFORT, name: 'Comfort food' }),
    makeTagRow({ id: FAVOURITE, name: 'Family Favorite' }),
    makeTagRow({ id: LEGACY_DINNER, name: 'Dinner' }),
  ],
).library;
const EMPTY: Library = { meals: [], tags: LIBRARY.tags, tagsById: LIBRARY.tagsById };
const NAMES = [
  'Tacos',
  'Jalapeño poppers',
  'Beef stew',
  'Overnight oats',
  'Comfort food',
  'Family Favorite',
];
const mealById = (id: string) => LIBRARY.meals.find((meal) => meal.id === id)!;

const onRetry = jest.fn();
const onPressMeal = jest.fn();
const onAdd = jest.fn();
const onSearchChange = jest.fn();

const props = (overrides: Partial<MealBrowserProps> = {}): MealBrowserProps => ({
  library: LIBRARY,
  status: 'ready',
  onRetry,
  onPressMeal,
  rowHint: 'Edits this meal',
  emptyAction: { label: 'Add meal', onPress: onAdd },
  onSearchChange,
  ...overrides,
});

const search = () => screen.getByLabelText('Search meals');
const clearFilters = () => screen.queryByTestId('library-clear-filters');
const typeChip = (key: string) => screen.getByTestId(`type-chip-${key}`);
const tagChip = (id: string) => screen.getByTestId(`tag-chip-${id}`);
/** The IDs of the meals in the list, in order, leaving out the Just saved row. */
function listed() {
  const ids = screen
    .queryAllByTestId(/^meal-row-/)
    .map((row) => (row.props.testID as string).replace('meal-row-', ''));
  // The Just saved row is in the list's header, so it comes first.
  return screen.queryByTestId('library-just-saved') ? ids.slice(1) : ids;
}

/** Taps each tag's chip. */
async function selectTags(...names: string[]) {
  for (const name of names) await fireEvent.press(screen.getByRole('button', { name }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useMealImageUrls).mockReturnValue({});
});

describe('MealBrowser', () => {
  it('lists every meal in alphabetical order', async () => {
    await render(<MealBrowser {...props()} />);

    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
  });

  it('C-LBR-01 filters as the member types, with no Search button', async () => {
    await render(<MealBrowser {...props()} />);

    expect(search()).toHaveProp('placeholder', 'Search meals');
    expect(search()).toHaveProp('testID', 'library-search');
    await fireEvent.changeText(search(), 's');
    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);

    await fireEvent.changeText(search(), 'oat');

    expect(listed()).toEqual([OATS]);
    expect(screen.queryByRole('button', { name: /search/i })).toBeNull();
  });

  it('C-LBR-01 ignores case, accents and surrounding spaces', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.changeText(search(), 'JALA');
    expect(listed()).toEqual([POPPERS]);

    await fireEvent.changeText(search(), 'jalapeno');
    expect(listed()).toEqual([POPPERS]);

    await fireEvent.changeText(search(), '  tacos ');
    expect(listed()).toEqual([TACOS]);
  });

  it('DD-R9 finds meals by their tag names too', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.changeText(search(), 'COMFORT');

    expect(listed()).toEqual([STEW, TACOS]);
  });

  it('DD-R9 lists meals whose names match first, then those whose details do', async () => {
    const library = buildLibrary(
      [
        makeMealRow({ id: 'meal-a', name: 'Apple crumble', ingredients: 'Apples\nOats\nButter' }),
        makeMealRow({ id: 'meal-b', name: 'Banana bread', description: 'With an oat crumble' }),
        makeMealRow({ id: 'meal-c', name: 'Overnight oats' }),
      ],
      [],
    ).library;
    await render(<MealBrowser {...props({ library })} />);

    await fireEvent.changeText(search(), 'oat');

    expect(listed()).toEqual(['meal-c', 'meal-a', 'meal-b']);
  });

  it('R42.6 passes each change of the search to onSearchChange', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.changeText(search(), 'las');
    await fireEvent.changeText(search(), 'lasag');

    expect(onSearchChange.mock.calls).toEqual([['las'], ['lasag']]);
  });

  it('C-LBR-02 starts with All selected and no tag selected', async () => {
    await render(<MealBrowser {...props()} />);

    expect(typeChip('all')).toBeSelected();
    expect(typeChip('all')).toHaveProp('accessibilityLabel', 'All meals');
    for (const key of ['breakfast', 'lunch', 'dinner']) expect(typeChip(key)).not.toBeSelected();
    for (const chip of screen.getAllByTestId(/^tag-chip-/)) expect(chip).not.toBeSelected();
  });

  it('C-LBR-03 shows one row of filters: All, the types, then every tag, Family Favorite first', async () => {
    await render(<MealBrowser {...props()} />);

    expect(screen.queryAllByTestId(/^(type|tag)-chip-/).map((chip) => chip.props.testID)).toEqual([
      'type-chip-all',
      'type-chip-breakfast',
      'type-chip-lunch',
      'type-chip-dinner',
      `tag-chip-${FAVOURITE}`,
      `tag-chip-${COMFORT}`,
      `tag-chip-${QUICK}`,
    ]);
    // DD-R7: the legacy Dinner tag isn't a tag any more, so it has no chip.
    expect(screen.queryByTestId(`tag-chip-${LEGACY_DINNER}`)).toBeNull();
    // DD-R8: Family Favorite has its heart.
    expect(tagChip(FAVOURITE).children[0]).toHaveProp('name', 'heart.fill');
  });

  it('DD-R6 shows only the meals of the chosen type, one type at a time', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.press(typeChip('dinner'));
    expect(listed()).toEqual([STEW, TACOS]);
    expect(typeChip('dinner')).toBeSelected();
    expect(typeChip('all')).not.toBeSelected();

    await fireEvent.press(typeChip('breakfast'));
    expect(listed()).toEqual([OATS]);
    expect(typeChip('dinner')).not.toBeSelected();

    await fireEvent.press(typeChip('lunch'));
    expect(listed()).toEqual([]);
    expect(screen.getByTestId('library-no-match')).toBeOnTheScreen();
  });

  it('DD-R6 shows every meal again for All, or when the chosen type is tapped again', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.press(typeChip('dinner'));
    await fireEvent.press(typeChip('dinner'));
    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
    expect(typeChip('all')).toBeSelected();

    await fireEvent.press(typeChip('breakfast'));
    await fireEvent.press(typeChip('all'));
    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
  });

  it('DD-R6 combines the type with the tags and the search', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.press(typeChip('dinner'));
    await selectTags('Quick & Easy');
    expect(listed()).toEqual([TACOS]);

    await fireEvent.press(screen.getByRole('button', { name: 'Quick & Easy' }));
    await fireEvent.changeText(search(), 'stew');
    expect(listed()).toEqual([STEW]);
  });

  it('C-LBR-04 selecting Comfort food and Quick & Easy shows only meals with both', async () => {
    await render(<MealBrowser {...props()} />);

    await selectTags('Comfort food');
    expect(listed()).toEqual([STEW, TACOS]);

    await selectTags('Quick & Easy');
    expect(listed()).toEqual([TACOS]);
  });

  it('R41.6 a search and tags together show only meals that match both', async () => {
    await render(<MealBrowser {...props()} />);

    await selectTags('Quick & Easy');
    await fireEvent.changeText(search(), 'o');

    expect(listed()).toEqual([POPPERS, OATS, TACOS]);

    await fireEvent.changeText(search(), 'oats');
    expect(listed()).toEqual([OATS]);
  });

  it('R41.5 deselecting every tag shows every meal again', async () => {
    await render(<MealBrowser {...props()} />);

    await selectTags('Family Favorite');
    expect(listed()).toEqual([OATS]);
    await fireEvent.press(screen.getByRole('button', { name: 'Family Favorite' }));

    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
  });

  it('C-LBR-05 the filter row reads how many tags are selected', async () => {
    await render(<MealBrowser {...props()} />);
    expect(screen.getByLabelText('Filter by tags')).toBeOnTheScreen();

    await selectTags('Quick & Easy', 'Comfort food');

    expect(screen.getByLabelText('Filter by tags, 2 selected')).toBeOnTheScreen();
    expect(screen.getByText('✓ Quick & Easy')).toBeOnTheScreen();
    expect(screen.getByText('✓ Comfort food')).toBeOnTheScreen();
    expect(listed()).toEqual([TACOS]);
  });

  it('C-LBR-06 offers Clear filters only while there is a search, a type or a selected tag', async () => {
    await render(<MealBrowser {...props()} />);
    expect(clearFilters()).toBeNull();

    await fireEvent.changeText(search(), 'stew');
    expect(clearFilters()).toBeOnTheScreen();

    await fireEvent.changeText(search(), '');
    expect(clearFilters()).toBeNull();

    await selectTags('Comfort food');
    expect(clearFilters()).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Comfort food' }));
    expect(clearFilters()).toBeNull();

    await fireEvent.press(typeChip('lunch'));
    expect(clearFilters()).toBeOnTheScreen();

    await fireEvent.press(typeChip('all'));
    expect(clearFilters()).toBeNull();
  });

  it('C-LBR-06 Clear filters empties the search, deselects every tag and shows every type', async () => {
    await render(<MealBrowser {...props()} />);
    await fireEvent.changeText(search(), 'taco');
    await selectTags('Comfort food', 'Quick & Easy');
    await fireEvent.press(typeChip('dinner'));
    onSearchChange.mockClear();

    await fireEvent.press(clearFilters()!);

    expect(search()).toHaveDisplayValue('');
    expect(screen.getByLabelText('Filter by tags')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Comfort food' })).not.toBeSelected();
    expect(typeChip('all')).toBeSelected();
    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(clearFilters()).toBeNull();
  });

  it('C-LBR-07 shows "No matching meals" with Clear filters, below the search and filters', async () => {
    await render(<MealBrowser {...props()} />);

    await selectTags('Family Favorite', 'Comfort food');

    expect(listed()).toEqual([]);
    const noMatch = screen.getByTestId('library-no-match');
    expect(within(noMatch).getByRole('header', { name: 'No matching meals' })).toBeOnTheScreen();
    expect(search()).toBeOnTheScreen();
    expect(typeChip('all')).toBeOnTheScreen();
    expect(screen.queryByText('No meals yet')).toBeNull();

    await fireEvent.press(within(noMatch).getByRole('button', { name: 'Clear filters' }));

    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
    expect(screen.queryByTestId('library-no-match')).toBeNull();
  });

  it('C-LBR-07 an empty library shows "No meals yet" and its action, with no search or filters', async () => {
    await render(<MealBrowser {...props({ library: EMPTY })} />);

    expect(screen.getByRole('header', { name: 'No meals yet' })).toBeOnTheScreen();
    expect(screen.queryByText('No matching meals')).toBeNull();
    expect(screen.queryByLabelText('Search meals')).toBeNull();
    expect(screen.queryByTestId('type-chip-all')).toBeNull();
    expect(screen.queryAllByTestId(/^tag-chip-/)).toEqual([]);

    await fireEvent.press(screen.getByRole('button', { name: 'Add meal' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('C-LBR-08 rows show their type and tags and read as the name, the type, then the tags', async () => {
    await render(<MealBrowser {...props()} />);

    const tacos = screen.getByTestId(`meal-row-${TACOS}`);
    expect(tacos).toHaveProp(
      'accessibilityLabel',
      'Tacos, dinner. Tags: Comfort food, Quick & Easy',
    );
    expect(tacos).toHaveProp('accessibilityHint', 'Edits this meal');
    expect(within(tacos).getByTestId('type-pill')).toHaveTextContent('Dinner');
    expect(within(tacos).getByText('Comfort food')).toBeOnTheScreen();
    expect(within(tacos).getByText('Quick & Easy')).toBeOnTheScreen();
  });

  it('R40.7 passes a tapped meal to onPressMeal', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.press(screen.getByTestId(`meal-row-${STEW}`));

    expect(onPressMeal).toHaveBeenCalledWith(LIBRARY.meals[0]);
  });

  describe('photos (§6.5)', () => {
    const images = () => screen.root!.queryAll((node) => node.props.recyclingKey !== undefined);

    it("asks for every meal's photo URL at once, in the meals' order", async () => {
      await render(<MealBrowser {...props()} />);

      expect(useMealImageUrls).toHaveBeenLastCalledWith([null, null, null, TACOS_PHOTO]);
    });

    it('shows a photo once its URL is signed, and the placeholder until then', async () => {
      await render(<MealBrowser {...props()} />);
      expect(images()).toEqual([]);

      jest.mocked(useMealImageUrls).mockReturnValue({ [TACOS_PHOTO]: 'https://storage.test/t' });
      await screen.rerender(<MealBrowser {...props()} />);

      expect(images()).toHaveLength(1);
      expect(images()[0]).toHaveProp('source', [
        { uri: 'https://storage.test/t', cacheKey: TACOS_PHOTO },
      ]);
    });
  });

  describe('Recently used (DD-R10)', () => {
    const recent = [mealById(OATS), mealById(TACOS)];
    const recentMeals = () => screen.queryByTestId('recent-meals');

    it('shows the recent meals as cards above "All meals"', async () => {
      await render(<MealBrowser {...props({ recent })} />);

      const section = within(recentMeals()!);
      expect(section.getByRole('header', { name: 'Recently used' })).toBeOnTheScreen();
      expect(section.getAllByTestId(/^recent-meal-/).map((card) => card.props.testID)).toEqual([
        `recent-meal-${OATS}`,
        `recent-meal-${TACOS}`,
      ]);
      expect(screen.getByRole('header', { name: 'All meals' })).toBeOnTheScreen();
      // The cards are a shortcut: the meals stay in the list.
      expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
    });

    it('passes a tapped card to onPressMeal', async () => {
      await render(<MealBrowser {...props({ recent })} />);

      await fireEvent.press(screen.getByTestId(`recent-meal-${TACOS}`));

      expect(onPressMeal).toHaveBeenCalledWith(mealById(TACOS));
    });

    it('goes while there is a search, a type or a tag, and comes back once cleared', async () => {
      await render(<MealBrowser {...props({ recent })} />);

      await fireEvent.changeText(search(), 'o');
      expect(recentMeals()).toBeNull();
      expect(screen.queryByRole('header', { name: 'All meals' })).toBeNull();

      await fireEvent.changeText(search(), '');
      await fireEvent.press(typeChip('dinner'));
      expect(recentMeals()).toBeNull();

      await fireEvent.press(typeChip('all'));
      await selectTags('Quick & Easy');
      expect(recentMeals()).toBeNull();

      await fireEvent.press(clearFilters()!);
      expect(recentMeals()).toBeOnTheScreen();
    });

    it('shows neither the section nor "All meals" with nothing recent', async () => {
      await render(<MealBrowser {...props({ recent: [] })} />);

      expect(recentMeals()).toBeNull();
      expect(screen.queryByRole('header', { name: 'All meals' })).toBeNull();
    });

    it('shows nothing recent while the library loads', async () => {
      await render(<MealBrowser {...props({ recent, library: EMPTY, status: 'loading' })} />);

      expect(recentMeals()).toBeNull();
    });
  });

  describe('Just saved', () => {
    const justSaved = (id: number, mealId: string) => props({ justSaved: { id, mealId } });
    const justSavedRow = () => screen.queryByTestId('library-just-saved');

    /** Beef stew, saved while the search "taco" hides it. */
    async function saveHiddenStew() {
      await render(<MealBrowser {...props()} />);
      await fireEvent.changeText(search(), 'taco');
      await screen.rerender(<MealBrowser {...justSaved(1, STEW)} />);
    }

    it('C-LBR-10 shows the meal above the list when the search hides it', async () => {
      await saveHiddenStew();

      const row = within(justSavedRow()!);
      expect(row.getByRole('header', { name: 'Just saved' })).toBeOnTheScreen();
      expect(row.getByTestId(`meal-row-${STEW}`)).toBeOnTheScreen();
      expect(listed()).toEqual([TACOS]);

      await fireEvent.press(row.getByTestId(`meal-row-${STEW}`));
      expect(onPressMeal).toHaveBeenCalledWith(LIBRARY.meals[0]);
    });

    it('DD55 shows the meal once, in its place, when the list shows it', async () => {
      await render(<MealBrowser {...justSaved(1, STEW)} />);

      expect(justSavedRow()).toBeNull();
      expect(screen.getAllByTestId(`meal-row-${STEW}`)).toHaveLength(1);
      expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
    });

    it('DD55 shows the meal once, in its place, when the search finds it', async () => {
      await render(<MealBrowser {...props()} />);
      await fireEvent.changeText(search(), 'stew');

      await screen.rerender(<MealBrowser {...justSaved(1, STEW)} />);

      expect(justSavedRow()).toBeNull();
      expect(listed()).toEqual([STEW]);
    });

    it('C-LBR-10 goes when the search changes', async () => {
      await saveHiddenStew();

      // "tacos" still hides Beef stew.
      await fireEvent.changeText(search(), 'tacos');

      expect(justSavedRow()).toBeNull();
      expect(listed()).toEqual([TACOS]);
    });

    it('C-LBR-10 goes when the tags change', async () => {
      await saveHiddenStew();

      // Quick & Easy still hides Beef stew.
      await selectTags('Quick & Easy');

      expect(justSavedRow()).toBeNull();
    });

    it('C-LBR-10 goes when the type changes', async () => {
      await saveHiddenStew();

      // Breakfast still hides Beef stew.
      await fireEvent.press(typeChip('breakfast'));

      expect(justSavedRow()).toBeNull();
    });

    it('C-LBR-10 goes when Clear filters empties the search and tags', async () => {
      await saveHiddenStew();

      await fireEvent.press(clearFilters()!);

      expect(justSavedRow()).toBeNull();
      expect(screen.getAllByTestId(`meal-row-${STEW}`)).toHaveLength(1);
    });

    it('DD51 shows again for the next save, even of the same meal', async () => {
      await saveHiddenStew();
      await fireEvent.changeText(search(), 'tac');
      expect(justSavedRow()).toBeNull();

      await screen.rerender(<MealBrowser {...justSaved(2, STEW)} />);

      expect(within(justSavedRow()!).getByTestId(`meal-row-${STEW}`)).toBeOnTheScreen();
    });

    it('DD55 goes when the screen passes null, and shows nothing for a meal not in the library', async () => {
      await saveHiddenStew();
      expect(justSavedRow()).toBeOnTheScreen();

      await screen.rerender(<MealBrowser {...props({ justSaved: null })} />);
      expect(justSavedRow()).toBeNull();

      await screen.rerender(<MealBrowser {...justSaved(2, 'meal-gone')} />);
      expect(justSavedRow()).toBeNull();
    });

    it("shows the saved meal's photo", async () => {
      jest.mocked(useMealImageUrls).mockReturnValue({ [TACOS_PHOTO]: 'https://storage.test/t' });
      await render(<MealBrowser {...props()} />);
      await fireEvent.changeText(search(), 'stew');
      await screen.rerender(<MealBrowser {...justSaved(1, TACOS)} />);

      const row = screen.getByTestId('library-just-saved');
      expect(row.queryAll((node) => node.props.recyclingKey === TACOS_PHOTO)).toHaveLength(1);
    });
  });

  describe('states', () => {
    it('C-LBR-11 the first load shows skeleton rows, with no search or filters', async () => {
      await render(<MealBrowser {...props({ library: EMPTY, status: 'loading' })} />);

      expect(screen.getByTestId('library-skeleton')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Search meals')).toBeNull();
      expect(screen.queryByTestId('type-chip-all')).toBeNull();
    });

    it('C-LBR-11 an error with nothing loaded shows LoadError, whose Retry calls onRetry', async () => {
      await render(<MealBrowser {...props({ library: EMPTY, status: 'error' })} />);

      await fireEvent.press(
        within(screen.getByTestId('library-load-error')).getByRole('button', { name: 'Retry' }),
      );

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('No meals yet')).toBeNull();
    });

    it('C-LBR-11 offline before the first load shows "Waiting for connection…"', async () => {
      await render(<MealBrowser {...props({ library: EMPTY, status: 'waiting' })} />);

      expect(screen.getByTestId('library-waiting-for-connection')).toBeOnTheScreen();
    });

    it('§3.10 shows the header above the search, and while the library loads', async () => {
      const header = <Text>Picker header</Text>;
      await render(<MealBrowser {...props({ header })} />);
      expect(screen.getByText('Picker header')).toBeOnTheScreen();

      await screen.rerender(
        <MealBrowser {...props({ header, library: EMPTY, status: 'loading' })} />,
      );
      expect(screen.getByText('Picker header')).toBeOnTheScreen();
    });

    it('R45.12 hides the header for an empty library, which offers its own action', async () => {
      const header = <Text>+ Add new meal</Text>;
      await render(
        <MealBrowser
          {...props({
            header,
            library: EMPTY,
            emptyAction: { label: '+ Add new meal', onPress: onAdd },
          })}
        />,
      );

      expect(screen.getAllByText('+ Add new meal')).toHaveLength(1);
      expect(screen.getByRole('button', { name: '+ Add new meal' })).toBeOnTheScreen();
    });

    it('R40.11 gives the list the refresh control it is passed', async () => {
      const refreshControl = <RefreshControl refreshing={false} onRefresh={() => {}} />;
      await render(<MealBrowser {...props({ refreshControl })} />);

      expect(screen.getByTestId('library-list')).toHaveProp('refreshControl', refreshControl);
    });
  });

  it('C-LBR-12 the type chips, tag chips, Clear filters and rows are at least 44 pt', async () => {
    await render(<MealBrowser {...props()} />);
    await selectTags('Comfort food');

    for (const target of [
      typeChip('all'),
      typeChip('dinner'),
      clearFilters()!,
      screen.getByRole('button', { name: 'Comfort food' }),
    ]) {
      const { width, height } = touchTarget(target);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
    // Rows span the list, so only their height can be measured here.
    expect(touchTarget(screen.getByTestId(`meal-row-${TACOS}`)).height).toBeGreaterThanOrEqual(44);
  });

  it('C-LBR-13 no test ID holds a meal or tag name', async () => {
    await render(<MealBrowser {...props({ recent: [mealById(OATS)] })} />);
    const withRecent = screen
      .queryAllByTestId(/./, { includeHiddenElements: true })
      .map((element) => element.props.testID as string);
    // The search hides Beef stew, so it shows as the Just saved row.
    await fireEvent.changeText(search(), 'taco');
    await screen.rerender(<MealBrowser {...props({ justSaved: { id: 1, mealId: STEW } })} />);

    const testIDs = [
      ...withRecent,
      ...screen
        .queryAllByTestId(/./, { includeHiddenElements: true })
        .map((element) => element.props.testID as string),
    ].map((testID) => testID.toLowerCase());
    expect(testIDs).toEqual(
      expect.arrayContaining([
        'library-search',
        'library-list',
        'library-just-saved',
        'library-clear-filters',
        'recent-meals',
        'type-chip-all',
      ]),
    );
    for (const name of [...NAMES, 'Quick', 'Easy']) {
      for (const testID of testIDs) expect(testID).not.toContain(name.toLowerCase());
    }
  });

  it('C-LBR-14 a new browser starts with an empty search, every type and no tags', async () => {
    await render(<MealBrowser {...props()} />);
    await fireEvent.changeText(search(), 'taco');
    await selectTags('Comfort food');
    await fireEvent.press(typeChip('dinner'));
    await screen.unmount();

    await render(<MealBrowser {...props()} />);

    expect(search()).toHaveDisplayValue('');
    expect(screen.getByLabelText('Filter by tags')).toBeOnTheScreen();
    expect(typeChip('all')).toBeSelected();
    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
  });

  it('R41.9 keeps the search, type and tags while the library changes underneath', async () => {
    await render(<MealBrowser {...props()} />);
    await fireEvent.changeText(search(), 'o');
    await selectTags('Quick & Easy');
    await fireEvent.press(typeChip('dinner'));

    const reloaded = buildLibrary(
      [
        makeMealRow({
          id: TACOS,
          name: 'Tacos',
          meal_type: 'dinner',
          library_meal_tags: links(QUICK),
        }),
        makeMealRow({
          id: 'meal-5',
          name: 'Soup',
          meal_type: 'dinner',
          library_meal_tags: links(QUICK),
        }),
        makeMealRow({ id: 'meal-6', name: 'Porridge', library_meal_tags: links(QUICK) }),
      ],
      [makeTagRow({ id: QUICK, name: 'Quick & Easy' })],
    ).library;
    await screen.rerender(<MealBrowser {...props({ library: reloaded })} />);

    expect(search()).toHaveDisplayValue('o');
    expect(screen.getByLabelText('Filter by tags, 1 selected')).toBeOnTheScreen();
    expect(typeChip('dinner')).toBeSelected();
    expect(listed()).toEqual(['meal-5', TACOS]);
  });

  it('R44.8 gives every row, the Just saved row too, Delete and a chevron when asked', async () => {
    const onDeleteMeal = jest.fn();
    const rowProps = { onDeleteMeal, rowDisclosure: true };
    await render(<MealBrowser {...props(rowProps)} />);
    // The search hides Tacos, so it shows as the Just saved row.
    await fireEvent.changeText(search(), 'n');
    await screen.rerender(
      <MealBrowser {...props({ ...rowProps, justSaved: { id: 1, mealId: TACOS } })} />,
    );

    const deletes = screen.getAllByTestId(/^meal-delete-/, { includeHiddenElements: true });
    // Two listed rows, and the Just saved row of Tacos.
    expect(listed()).toEqual([POPPERS, OATS]);
    expect(deletes).toHaveLength(3);
    await fireEvent.press(deletes[0]);
    expect(onDeleteMeal).toHaveBeenCalledWith(expect.objectContaining({ id: TACOS }));
    for (const row of screen.getAllByTestId(/^meal-row-/)) {
      expect(row.children.at(-1)).toHaveProp('name', 'chevron.right');
    }
  });

  it('R45.10 offers no Delete and no chevron by default, as in the picker', async () => {
    await render(<MealBrowser {...props()} />);

    expect(screen.queryAllByTestId(/^meal-delete-/, { includeHiddenElements: true })).toHaveLength(
      0,
    );
    for (const row of screen.getAllByTestId(/^meal-row-/)) {
      expect(row.props.accessibilityActions).toBeUndefined();
    }
  });
});
