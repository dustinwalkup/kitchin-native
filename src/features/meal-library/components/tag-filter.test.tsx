import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';
import { makeTagRow } from '@/test/factories';
import { Text } from '@/ui/text';

import { buildLibrary } from '../domain';
import { filterLabel, TagFilter } from './tag-filter';

// Browser components C-LBR-02, 03, 05 and 12 for the filter (4-test-plan §4.1).

const onToggle = jest.fn();

// Out of order, so the test proves the filter shows them as buildLibrary sorts them (R43.10).
const { tags } = buildLibrary(
  [],
  [
    makeTagRow({ id: 'tag-quick', name: 'Quick & Easy' }),
    makeTagRow({ id: 'tag-breakfast', name: 'Breakfast' }),
    makeTagRow({ id: 'tag-dinner', name: 'Dinner' }),
  ],
).library;

const ui = (selected: string[] = []) => (
  <TagFilter tags={tags} selected={new Set(selected)} onToggle={onToggle} />
);

const toggle = () => screen.getByTestId('library-filter');
const chipIds = () =>
  screen.queryAllByTestId(/^tag-chip-/).map((chip) => chip.props.testID as string);

beforeEach(() => jest.clearAllMocks());

describe('TagFilter', () => {
  it('C-LBR-02 starts collapsed, with no tag chips', async () => {
    await render(ui());

    expect(toggle()).toBeCollapsed();
    expect(toggle()).toHaveProp('accessibilityLabel', 'Filter by tags');
    expect(screen.getByText('Filter by tags')).toBeOnTheScreen();
    expect(chipIds()).toEqual([]);
  });

  it('C-LBR-03 opens to every tag in alphabetical order, and Done collapses it', async () => {
    await render(ui());

    await fireEvent.press(toggle());

    expect(toggle()).toBeExpanded();
    expect(chipIds()).toEqual([
      'tag-chip-tag-breakfast',
      'tag-chip-tag-dinner',
      'tag-chip-tag-quick',
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(toggle()).toBeCollapsed();
    expect(chipIds()).toEqual([]);
  });

  it('C-LBR-03 collapses when the toggle is tapped again', async () => {
    await render(ui());

    await fireEvent.press(toggle());
    await fireEvent.press(toggle());

    expect(toggle()).toBeCollapsed();
    expect(chipIds()).toEqual([]);
  });

  it('R41.2 passes a tapped tag to onToggle, selected or not', async () => {
    await render(ui(['tag-dinner']));
    await fireEvent.press(toggle());

    await fireEvent.press(screen.getByRole('button', { name: 'Breakfast' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Dinner' }));

    expect(onToggle.mock.calls).toEqual([['tag-breakfast'], ['tag-dinner']]);
  });

  it('C-LBR-05 collapsed with two selected, shows the count and the names', async () => {
    await render(ui(['tag-quick', 'tag-dinner']));

    expect(screen.getByText('Filter by tags · 2')).toBeOnTheScreen();
    expect(screen.getByText('Dinner, Quick & Easy')).toBeOnTheScreen();
    expect(chipIds()).toEqual([]);
  });

  it('C-LBR-05 reads "Filter by tags, 2 selected", with its expanded state', async () => {
    await render(ui(['tag-quick', 'tag-dinner']));

    expect(toggle()).toHaveProp('accessibilityLabel', 'Filter by tags, 2 selected');
    expect(toggle()).toHaveProp('accessibilityRole', 'button');
    expect(toggle()).toBeCollapsed();

    await fireEvent.press(toggle());

    expect(toggle()).toBeExpanded();
    expect(toggle()).toHaveProp('accessibilityLabel', 'Filter by tags, 2 selected');
  });

  it('C-LBR-05 open, marks the selected chips and drops the names line', async () => {
    await render(ui(['tag-dinner']));

    await fireEvent.press(toggle());

    expect(screen.getByRole('button', { name: 'Dinner' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Breakfast' })).not.toBeSelected();
    expect(screen.getByText('✓ Dinner')).toBeOnTheScreen();
    expect(screen.queryByText(/^Dinner$/)).toBeNull();
  });

  it('filterLabel says how many are selected (N27)', () => {
    expect(filterLabel(0)).toBe('Filter by tags');
    expect(filterLabel(1)).toBe('Filter by tags, 1 selected');
  });

  it('shows its action beside the toggle', async () => {
    await render(
      <TagFilter
        tags={tags}
        selected={new Set()}
        onToggle={onToggle}
        action={<Text>Action</Text>}
      />,
    );

    expect(screen.getByText('Action')).toBeOnTheScreen();
  });

  it('C-LBR-12 the toggle and Done are at least 44 × 44 pt', async () => {
    await render(ui());
    await fireEvent.press(toggle());

    for (const target of [toggle(), screen.getByRole('button', { name: 'Done' })]) {
      const { width, height } = touchTarget(target);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });
});
