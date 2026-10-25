import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

import { touchTarget } from '@/test/a11y';
import { makeMealRow, makeTagRow } from '@/test/factories';
import { Text } from '@/ui/text';

import { buildLibrary, type Library } from '../domain';
import { MealBrowser, type MealBrowserProps } from './meal-browser';

// Browser components C-LBR-01 to C-LBR-14 (4-test-plan §4.1). The IDs hold no names, so C-LBR-13
// can check that no test ID contains one.

const BREAKFAST = 'tag-1';
const DINNER = 'tag-2';
const QUICK = 'tag-3';
const STEW = 'meal-1';
const POPPERS = 'meal-2';
const OATS = 'meal-3';
const TACOS = 'meal-4';

const links = (...ids: string[]) => ids.map((tag_id) => ({ tag_id }));

const LIBRARY = buildLibrary(
  [
    makeMealRow({ id: TACOS, name: 'Tacos', library_meal_tags: links(DINNER, QUICK) }),
    makeMealRow({ id: POPPERS, name: 'Jalapeño poppers', library_meal_tags: links(QUICK) }),
    makeMealRow({ id: STEW, name: 'Beef stew', library_meal_tags: links(DINNER) }),
    makeMealRow({ id: OATS, name: 'Overnight oats', library_meal_tags: links(BREAKFAST, QUICK) }),
  ],
  [
    makeTagRow({ id: QUICK, name: 'Quick & Easy' }),
    makeTagRow({ id: DINNER, name: 'Dinner' }),
    makeTagRow({ id: BREAKFAST, name: 'Breakfast' }),
  ],
).library;
const EMPTY: Library = { meals: [], tags: LIBRARY.tags, tagsById: LIBRARY.tagsById };
const NAMES = ['Tacos', 'Jalapeño poppers', 'Beef stew', 'Overnight oats', 'Breakfast', 'Dinner'];

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
const filter = () => screen.getByTestId('library-filter');
const clearFilters = () => screen.queryByTestId('library-clear-filters');
/** The IDs of the meals in the list, in order, leaving out the Just saved row. */
function listed() {
  const ids = screen
    .queryAllByTestId(/^meal-row-/)
    .map((row) => (row.props.testID as string).replace('meal-row-', ''));
  // The Just saved row is in the list's header, so it comes first.
  return screen.queryByTestId('library-just-saved') ? ids.slice(1) : ids;
}

/** Opens the filter, if it isn't open, and taps each tag's chip. */
async function selectTags(...names: string[]) {
  if (!filter().props.accessibilityState?.expanded) await fireEvent.press(filter());
  for (const name of names) await fireEvent.press(screen.getByRole('button', { name }));
}

beforeEach(() => jest.clearAllMocks());

describe('MealBrowser', () => {
  it('lists every meal in alphabetical order', async () => {
    await render(<MealBrowser {...props()} />);

    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
  });

  it('C-LBR-01 filters as the member types, with no Search button', async () => {
    await render(<MealBrowser {...props()} />);

    expect(search()).toHaveProp('placeholder', 'Search meals');
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

  it('R42.6 passes each change of the search to onSearchChange', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.changeText(search(), 'las');
    await fireEvent.changeText(search(), 'lasag');

    expect(onSearchChange.mock.calls).toEqual([['las'], ['lasag']]);
  });

  it('C-LBR-02 starts with the filter collapsed and no tag chips', async () => {
    await render(<MealBrowser {...props()} />);

    expect(filter()).toBeCollapsed();
    expect(screen.queryAllByTestId(/^tag-chip-/)).toEqual([]);
  });

  it('C-LBR-03 opening the filter shows every tag, in alphabetical order', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.press(filter());

    expect(screen.queryAllByTestId(/^tag-chip-/).map((chip) => chip.props.testID)).toEqual([
      `tag-chip-${BREAKFAST}`,
      `tag-chip-${DINNER}`,
      `tag-chip-${QUICK}`,
    ]);
  });

  it('C-LBR-04 selecting Dinner and Quick & Easy shows only meals with both', async () => {
    await render(<MealBrowser {...props()} />);

    await selectTags('Dinner');
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

    await selectTags('Breakfast');
    expect(listed()).toEqual([OATS]);
    await fireEvent.press(screen.getByRole('button', { name: 'Breakfast' }));

    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
  });

  it('C-LBR-05 collapsed, the filter shows how many tags are selected, and which', async () => {
    await render(<MealBrowser {...props()} />);

    await selectTags('Quick & Easy', 'Dinner');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByText('Filter by tags · 2')).toBeOnTheScreen();
    expect(screen.getByText('Dinner, Quick & Easy')).toBeOnTheScreen();
    expect(filter()).toHaveProp('accessibilityLabel', 'Filter by tags, 2 selected');
    expect(filter()).toBeCollapsed();
    expect(listed()).toEqual([TACOS]);
  });

  it('C-LBR-06 offers Clear filters only while there is a search or a selected tag', async () => {
    await render(<MealBrowser {...props()} />);
    expect(clearFilters()).toBeNull();

    await fireEvent.changeText(search(), 'stew');
    expect(clearFilters()).toBeOnTheScreen();

    await fireEvent.changeText(search(), '');
    expect(clearFilters()).toBeNull();

    await selectTags('Dinner');
    expect(clearFilters()).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Dinner' }));
    expect(clearFilters()).toBeNull();
  });

  it('C-LBR-06 Clear filters empties the search and deselects every tag', async () => {
    await render(<MealBrowser {...props()} />);
    await fireEvent.changeText(search(), 'taco');
    await selectTags('Dinner', 'Quick & Easy');
    onSearchChange.mockClear();

    await fireEvent.press(clearFilters()!);

    expect(search()).toHaveDisplayValue('');
    expect(filter()).toHaveProp('accessibilityLabel', 'Filter by tags');
    expect(screen.getByRole('button', { name: 'Dinner' })).not.toBeSelected();
    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(clearFilters()).toBeNull();
  });

  it('C-LBR-07 shows "No meals match" with Clear filters, below the search and filter', async () => {
    await render(<MealBrowser {...props()} />);

    await selectTags('Breakfast', 'Dinner');

    expect(listed()).toEqual([]);
    const noMatch = screen.getByTestId('library-no-match');
    expect(within(noMatch).getByRole('header', { name: 'No meals match' })).toBeOnTheScreen();
    expect(search()).toBeOnTheScreen();
    expect(filter()).toBeOnTheScreen();
    expect(screen.queryByText('No saved meals yet')).toBeNull();

    await fireEvent.press(within(noMatch).getByRole('button', { name: 'Clear filters' }));

    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
    expect(screen.queryByTestId('library-no-match')).toBeNull();
  });

  it('C-LBR-07 an empty library shows "No saved meals yet" and its action, with no search or filter', async () => {
    await render(<MealBrowser {...props({ library: EMPTY })} />);

    expect(screen.getByRole('header', { name: 'No saved meals yet' })).toBeOnTheScreen();
    expect(screen.queryByText('No meals match')).toBeNull();
    expect(screen.queryByLabelText('Search meals')).toBeNull();
    expect(screen.queryByTestId('library-filter')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Add meal' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('C-LBR-08 rows show their tags and read as the name followed by the tags', async () => {
    await render(<MealBrowser {...props()} />);

    const tacos = screen.getByTestId(`meal-row-${TACOS}`);
    expect(tacos).toHaveProp('accessibilityLabel', 'Tacos. Tags: Dinner, Quick & Easy');
    expect(tacos).toHaveProp('accessibilityHint', 'Edits this meal');
    expect(within(tacos).getByText('Dinner')).toBeOnTheScreen();
    expect(within(tacos).getByText('Quick & Easy')).toBeOnTheScreen();
  });

  it('R40.7 passes a tapped meal to onPressMeal', async () => {
    await render(<MealBrowser {...props()} />);

    await fireEvent.press(screen.getByTestId(`meal-row-${STEW}`));

    expect(onPressMeal).toHaveBeenCalledWith(LIBRARY.meals[0]);
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

      // "o" still hides Beef stew.
      await fireEvent.changeText(search(), 'o');

      expect(justSavedRow()).toBeNull();
      expect(listed()).toEqual([POPPERS, OATS, TACOS]);
    });

    it('C-LBR-10 goes when the tags change', async () => {
      await saveHiddenStew();

      // Quick & Easy still hides Beef stew.
      await selectTags('Quick & Easy');

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
  });

  describe('states', () => {
    it('C-LBR-11 the first load shows skeleton rows, with no search or filter', async () => {
      await render(<MealBrowser {...props({ library: EMPTY, status: 'loading' })} />);

      expect(screen.getByTestId('library-skeleton')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Search meals')).toBeNull();
      expect(screen.queryByTestId('library-filter')).toBeNull();
    });

    it('C-LBR-11 an error with nothing loaded shows LoadError, whose Retry calls onRetry', async () => {
      await render(<MealBrowser {...props({ library: EMPTY, status: 'error' })} />);

      await fireEvent.press(
        within(screen.getByTestId('library-load-error')).getByRole('button', { name: 'Retry' }),
      );

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('No saved meals yet')).toBeNull();
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

  it('C-LBR-12 the filter, Clear filters, chips and rows are at least 44 pt', async () => {
    await render(<MealBrowser {...props()} />);
    await selectTags('Dinner');

    for (const target of [
      filter(),
      clearFilters()!,
      screen.getByRole('button', { name: 'Dinner' }),
    ]) {
      const { width, height } = touchTarget(target);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
    // Rows span the list, so only their height can be measured here.
    expect(touchTarget(screen.getByTestId(`meal-row-${TACOS}`)).height).toBeGreaterThanOrEqual(44);
  });

  it('C-LBR-13 no test ID holds a meal or tag name', async () => {
    await render(<MealBrowser {...props()} />);
    // The search hides Beef stew, so it shows as the Just saved row.
    await fireEvent.changeText(search(), 'taco');
    await screen.rerender(<MealBrowser {...props({ justSaved: { id: 1, mealId: STEW } })} />);
    await fireEvent.press(filter());

    const testIDs = screen
      .queryAllByTestId(/./, { includeHiddenElements: true })
      .map((element) => (element.props.testID as string).toLowerCase());
    expect(testIDs).toEqual(
      expect.arrayContaining([
        'library-search',
        'library-filter',
        'library-list',
        'library-just-saved',
      ]),
    );
    for (const name of [...NAMES, 'Quick', 'Easy']) {
      for (const testID of testIDs) expect(testID).not.toContain(name.toLowerCase());
    }
  });

  it('C-LBR-14 a new browser starts with an empty search and no tags', async () => {
    await render(<MealBrowser {...props()} />);
    await fireEvent.changeText(search(), 'taco');
    await selectTags('Dinner');
    await screen.unmount();

    await render(<MealBrowser {...props()} />);

    expect(search()).toHaveDisplayValue('');
    expect(filter()).toHaveProp('accessibilityLabel', 'Filter by tags');
    expect(listed()).toEqual([STEW, POPPERS, OATS, TACOS]);
  });

  it('R41.9 keeps the search and tags while the library changes underneath', async () => {
    await render(<MealBrowser {...props()} />);
    await fireEvent.changeText(search(), 'o');
    await selectTags('Quick & Easy');

    const reloaded = buildLibrary(
      [
        makeMealRow({ id: TACOS, name: 'Tacos', library_meal_tags: links(QUICK) }),
        makeMealRow({ id: 'meal-5', name: 'Soup', library_meal_tags: links(QUICK) }),
      ],
      [makeTagRow({ id: QUICK, name: 'Quick & Easy' })],
    ).library;
    await screen.rerender(<MealBrowser {...props({ library: reloaded })} />);

    expect(search()).toHaveDisplayValue('o');
    expect(filter()).toHaveProp('accessibilityLabel', 'Filter by tags, 1 selected');
    expect(listed()).toEqual(['meal-5', TACOS]);
  });

  it('R44.8 gives every row, the Just saved row too, Delete and a chevron when asked', async () => {
    const onDeleteMeal = jest.fn();
    const rowProps = { onDeleteMeal, rowDisclosure: true };
    await render(<MealBrowser {...props(rowProps)} />);
    // The search hides Tacos, so it shows as the Just saved row.
    await fireEvent.changeText(search(), 'e');
    await screen.rerender(
      <MealBrowser {...props({ ...rowProps, justSaved: { id: 1, mealId: TACOS } })} />,
    );

    const deletes = screen.getAllByTestId(/^meal-delete-/, { includeHiddenElements: true });
    // Three listed rows, and the Just saved row of Tacos.
    expect(deletes).toHaveLength(4);
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
