import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { touchTarget } from '@/test/a11y';
import { makeLibraryTag } from '@/test/factories';
import { themes } from '@/ui/theme';

import { filterLabel, MealFilters, type MealFiltersProps } from './meal-filters';

// The library's one row of filters: All and the meal types, a hairline, then the tags
// (specs/redesign/design.md §5.2, DD-R6, DD-R8).

const theme = themes.light;

const FAVOURITE = makeLibraryTag({ id: 'tag-favourite', name: 'Family Favorite' });
const QUICK = makeLibraryTag({ id: 'tag-quick', name: 'Quick & Easy' });

const onMealType = jest.fn();
const onToggleTag = jest.fn();
const onClear = jest.fn();

const ui = (overrides: Partial<MealFiltersProps> = {}) => (
  <MealFilters
    mealType={null}
    onMealType={onMealType}
    tags={[FAVOURITE, QUICK]}
    selectedTagIds={new Set()}
    onToggleTag={onToggleTag}
    {...overrides}
  />
);

const chip = (testID: string) => screen.getByTestId(testID);
// The hairline between the types and the tags.
const rules = () =>
  screen.root!.queryAll((node) => {
    const style = StyleSheet.flatten(node.props.style) ?? {};
    return style.width === StyleSheet.hairlineWidth && style.backgroundColor === theme.border;
  });

beforeEach(() => jest.clearAllMocks());

describe('filterLabel', () => {
  it('N27 reads the tags as "Filter by tags", with how many are selected', () => {
    expect(filterLabel(0)).toBe('Filter by tags');
    expect(filterLabel(1)).toBe('Filter by tags, 1 selected');
    expect(filterLabel(3)).toBe('Filter by tags, 3 selected');
  });
});

describe('MealFilters', () => {
  it('shows All, Breakfast, Lunch and Dinner, a hairline, then the tags in the order given', async () => {
    await render(ui());

    expect(screen.getAllByRole('button').map((button) => button.props.testID as string)).toEqual([
      'type-chip-all',
      'type-chip-breakfast',
      'type-chip-lunch',
      'type-chip-dinner',
      'tag-chip-tag-favourite',
      'tag-chip-tag-quick',
    ]);
    expect(rules()).toHaveLength(1);
  });

  it('scrolls sideways as one row, keeping the first tap while the keyboard is up', async () => {
    await render(ui());

    const bar = screen.getByLabelText('Filter by tags');
    expect(bar).toHaveProp('horizontal', true);
    expect(bar).toHaveProp('keyboardShouldPersistTaps', 'handled');
  });

  it('reads how many tags are selected (N27)', async () => {
    await render(ui({ selectedTagIds: new Set([QUICK.id, FAVOURITE.id]) }));

    expect(screen.getByLabelText('Filter by tags, 2 selected')).toBeOnTheScreen();
  });

  it('draws no hairline when the household has no tags', async () => {
    await render(ui({ tags: [] }));

    expect(rules()).toEqual([]);
    expect(screen.queryAllByTestId(/^tag-chip-/)).toEqual([]);
  });

  describe('the types (DD-R6)', () => {
    it('selects All for every meal, read as "All meals"', async () => {
      await render(ui());

      expect(chip('type-chip-all')).toBeSelected();
      expect(chip('type-chip-all')).toHaveProp('accessibilityLabel', 'All meals');
      expect(chip('type-chip-all')).toHaveTextContent('All');
      for (const key of ['breakfast', 'lunch', 'dinner']) {
        expect(chip(`type-chip-${key}`)).not.toBeSelected();
      }
    });

    it('shows the chosen type as selected, and All as not', async () => {
      await render(ui({ mealType: 'lunch' }));

      expect(chip('type-chip-lunch')).toBeSelected();
      expect(chip('type-chip-all')).not.toBeSelected();
    });

    it.each([
      ['breakfast', 'Breakfast', 'sunrise.fill', theme.breakfast],
      ['lunch', 'Lunch', 'sun.max.fill', theme.lunch],
      ['dinner', 'Dinner', 'moon.stars.fill', theme.dinner],
    ] as const)(
      'labels %s "%s" with its glyph in its colour',
      async (key, label, symbol, colour) => {
        await render(ui());

        const type = chip(`type-chip-${key}`);
        expect(type).toHaveProp('accessibilityLabel', label);
        expect(type.children[0]).toHaveProp('name', symbol);
        expect(type.children[0]).toHaveProp('tintColor', colour);
      },
    );

    it('chooses a type when tapped, and All again when the chosen type is tapped', async () => {
      await render(ui());
      await fireEvent.press(chip('type-chip-dinner'));
      expect(onMealType).toHaveBeenLastCalledWith('dinner');

      await screen.rerender(ui({ mealType: 'dinner' }));
      await fireEvent.press(chip('type-chip-dinner'));
      expect(onMealType).toHaveBeenLastCalledWith(null);

      await fireEvent.press(chip('type-chip-breakfast'));
      expect(onMealType).toHaveBeenLastCalledWith('breakfast');

      await fireEvent.press(chip('type-chip-all'));
      expect(onMealType).toHaveBeenLastCalledWith(null);
    });
  });

  describe('the tags', () => {
    it('shows the selected tags as selected', async () => {
      await render(ui({ selectedTagIds: new Set([QUICK.id]) }));

      expect(screen.getByRole('button', { name: 'Quick & Easy' })).toBeSelected();
      expect(screen.getByRole('button', { name: 'Family Favorite' })).not.toBeSelected();
    });

    it('DD-R8 marks Family Favorite with a heart', async () => {
      await render(ui());

      expect(chip('tag-chip-tag-favourite').children[0]).toHaveProp('name', 'heart.fill');
    });

    it('toggles a tag by its ID when tapped', async () => {
      await render(ui());

      await fireEvent.press(screen.getByRole('button', { name: 'Quick & Easy' }));

      expect(onToggleTag).toHaveBeenCalledWith(QUICK.id);
      expect(onMealType).not.toHaveBeenCalled();
    });
  });

  describe('Clear filters (R41.7)', () => {
    it('shows only when the screen offers it, at the end of the row', async () => {
      await render(ui());
      expect(screen.queryByTestId('library-clear-filters')).toBeNull();

      await screen.rerender(ui({ onClear }));
      const buttons = screen.getAllByRole('button');
      expect(buttons.at(-1)).toHaveProp('testID', 'library-clear-filters');
      expect(buttons.at(-1)).toHaveProp('accessibilityLabel', 'Clear filters');
    });

    it('calls onClear when tapped', async () => {
      await render(ui({ onClear }));

      await fireEvent.press(screen.getByTestId('library-clear-filters'));

      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  it('N11 gives every chip and Clear filters a touch target of at least 44 × 44 pt', async () => {
    await render(ui({ onClear }));

    for (const button of screen.getAllByRole('button')) {
      const { width, height } = touchTarget(button);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });
});
