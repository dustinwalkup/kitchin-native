import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { touchTarget } from '@/test/a11y';
import { makeLibraryTag, makeTagRow } from '@/test/factories';
import { themes } from '@/ui/theme';

import { COPY } from '../constants';
import { buildLibrary, type FormValues, type Tag, type TagChoice } from '../domain';
import { TagPicker } from './tag-picker';

// Meal form components C-LFM-06 to 08 for the tags (4-test-plan §4.3).

// Out of order, so the test proves the picker shows them as buildLibrary sorts them (R43.10).
const { tags } = buildLibrary(
  [],
  [
    makeTagRow({ id: 'tag-quick', name: 'Quick & Easy' }),
    makeTagRow({ id: 'tag-appetizer', name: 'Appetizer' }),
    makeTagRow({ id: 'tag-comfort', name: 'Comfort food' }),
  ],
).library;

// What the component last passed to onChange.
const changed = jest.fn<void, [FormValues]>();
const latest = (): FormValues => changed.mock.lastCall![0];
let announce: jest.SpyInstance;

// Holds the values, as the form screen does, so each change shows.
function Picker({
  chosen = [],
  error,
  household = tags,
}: {
  chosen?: TagChoice[];
  error?: string;
  household?: Tag[];
}) {
  const [values, setValues] = useState<FormValues>({
    name: 'Tacos',
    description: '',
    ingredients: '',
    mealType: null,
    image: { kind: 'none' },
    tags: chosen,
  });
  return (
    <TagPicker
      tags={household}
      values={values}
      onChange={(next) => {
        changed(next);
        setValues(next);
      }}
      error={error}
    />
  );
}

const chips = () =>
  screen.queryAllByTestId(/^tag-chip-/).map((chip) => ({
    id: chip.props.testID as string,
    name: chip.props.accessibilityLabel as string,
    selected: chip.props.accessibilityState?.selected === true,
  }));
const selectedNames = () => chips().flatMap((chip) => (chip.selected ? [chip.name] : []));
const announced = () => announce.mock.calls.map(([message]) => message);

async function addTag(typed: string) {
  await fireEvent.press(screen.getByRole('button', { name: 'New tag' }));
  await fireEvent.changeText(screen.getByLabelText('New tag'), typed);
  await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('TagPicker', () => {
  it('C-LFM-06 shows every household tag as a chip, in alphabetical order', async () => {
    await render(<Picker chosen={[{ kind: 'existing', id: 'tag-comfort' }]} />);

    expect(screen.getByRole('header', { name: /^Tags/ })).toBeOnTheScreen();
    expect(chips()).toEqual([
      { id: 'tag-chip-tag-appetizer', name: 'Appetizer', selected: false },
      { id: 'tag-chip-tag-comfort', name: 'Comfort food', selected: true },
      { id: 'tag-chip-tag-quick', name: 'Quick & Easy', selected: false },
    ]);
    expect(screen.getByText('✓ Comfort food')).toBeOnTheScreen();
  });

  it('§5.3 says the tags are optional', async () => {
    await render(<Picker />);

    expect(screen.getByRole('header', { name: 'Tags  Optional' })).toBeOnTheScreen();
  });

  it('DD-R8 marks Family Favorite with a heart', async () => {
    const household = [makeLibraryTag({ id: 'tag-favourite', name: 'Family Favorite' })];
    await render(<Picker household={household} />);

    const [heart] = screen.getByRole('button', { name: 'Family Favorite' }).children;
    expect(heart).toHaveProp('name', 'heart.fill');
  });

  it('DD-R8 lists Family Favorite first, then the rest in alphabetical order', async () => {
    const household = [...tags, makeLibraryTag({ id: 'tag-favourite', name: 'Family Favorite' })];
    await render(<Picker household={household} />);

    expect(chips().map((chip) => chip.name)).toEqual([
      'Family Favorite',
      'Appetizer',
      'Comfort food',
      'Quick & Easy',
    ]);
  });

  it('C-LFM-06 selects and deselects a tag when its chip is tapped', async () => {
    await render(<Picker />);

    await fireEvent.press(screen.getByRole('button', { name: 'Quick & Easy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Appetizer' }));
    expect(selectedNames()).toEqual(['Appetizer', 'Quick & Easy']);
    expect(latest().tags).toEqual([
      { kind: 'existing', id: 'tag-quick' },
      { kind: 'existing', id: 'tag-appetizer' },
    ]);

    await fireEvent.press(screen.getByRole('button', { name: 'Quick & Easy' }));
    expect(selectedNames()).toEqual(['Appetizer']);
    expect(latest().tags).toEqual([{ kind: 'existing', id: 'tag-appetizer' }]);
  });

  it('C-LFM-07 adds a new tag as a selected chip, in order, and announces it', async () => {
    await render(<Picker />);

    await addTag('Fixture Taco Night');

    expect(chips().map((chip) => chip.name)).toEqual([
      'Appetizer',
      'Comfort food',
      'Fixture Taco Night',
      'Quick & Easy',
    ]);
    expect(selectedNames()).toEqual(['Fixture Taco Night']);
    expect(latest().tags).toEqual([{ kind: 'new', name: 'Fixture Taco Night' }]);
    expect(announced()).toEqual(['Added Fixture Taco Night']);
    // The field closes again.
    expect(screen.queryByTestId('tag-picker-field')).toBeNull();
    expect(screen.getByRole('button', { name: 'New tag' })).toBeOnTheScreen();
  });

  it('C-LFM-07 selects an existing tag with the same name, without an error', async () => {
    await render(<Picker />);

    await addTag(' comfort FOOD ');

    expect(selectedNames()).toEqual(['Comfort food']);
    expect(chips()).toHaveLength(3);
    expect(latest().tags).toEqual([{ kind: 'existing', id: 'tag-comfort' }]);
    expect(announced()).toEqual(['Selected Comfort food']);
  });

  it.each(['Dinner', ' breakfast ', 'LUNCH'])(
    'DD-R7 keeps the field open for %j, saying it is the meal type',
    async (typed) => {
      await render(<Picker />);

      await addTag(typed);

      const field = screen.getByTestId('tag-picker-field');
      expect(field).toHaveProp('value', typed);
      expect(field).toHaveStyle({ borderColor: themes.light.destructive });
      expect(screen.getByText(COPY.typeTagReserved)).toBeOnTheScreen();
      expect(announced()).toEqual([COPY.typeTagReserved]);
      expect(changed).not.toHaveBeenCalled();
      expect(chips()).toHaveLength(3);
    },
  );

  it('DD-R7 clears the meal-type message once the member types again, and then adds the tag', async () => {
    await render(<Picker />);
    await addTag('Dinner');

    await fireEvent.changeText(screen.getByLabelText('New tag'), 'Dinner party');
    expect(screen.queryByText(COPY.typeTagReserved)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(latest().tags).toEqual([{ kind: 'new', name: 'Dinner party' }]);
    expect(screen.queryByTestId('tag-picker-field')).toBeNull();
  });

  it('C-LFM-07 selects a tag already added in this form instead of adding another', async () => {
    await render(<Picker />);

    await addTag('Fixture Taco Night');
    await addTag('fixture  TACO night');

    expect(chips()).toHaveLength(4);
    expect(latest().tags).toEqual([{ kind: 'new', name: 'Fixture Taco Night' }]);
    expect(announced()).toEqual(['Added Fixture Taco Night', 'Selected Fixture Taco Night']);
  });

  it('C-LFM-07 adds nothing for an empty name', async () => {
    await render(<Picker />);

    await addTag('   ');

    expect(chips()).toHaveLength(3);
    expect(changed).not.toHaveBeenCalled();
    expect(announced()).toEqual([]);
  });

  it('C-LFM-07 stops the name at 30 characters, on one line', async () => {
    await render(<Picker />);
    await fireEvent.press(screen.getByRole('button', { name: 'New tag' }));
    const field = screen.getByLabelText('New tag');

    expect(field).toHaveProp('maxLength', 30);
    expect(field.props.multiline).toBeFalsy();
    await fireEvent.changeText(field, `Two\nwords${'x'.repeat(40)}`);
    expect(field).toHaveProp('value', `Two words${'x'.repeat(21)}`);
    // An emoji is one character but two UTF-16 units, so the native limit grows to match (DD56).
    await fireEvent.changeText(field, '🌮'.repeat(10));
    expect(field).toHaveProp('maxLength', 40);
  });

  it('C-LFM-08 removes a new tag when it is deselected', async () => {
    await render(<Picker />);
    await addTag('Fixture Taco Night');

    await fireEvent.press(screen.getByRole('button', { name: 'Fixture Taco Night' }));

    expect(chips().map((chip) => chip.name)).toEqual(['Appetizer', 'Comfort food', 'Quick & Easy']);
    expect(latest().tags).toEqual([]);
  });

  it('C-LBR-13 gives a new tag a test ID without its name', async () => {
    await render(<Picker chosen={[{ kind: 'new', name: 'Fixture Taco Night' }]} />);

    const ids = chips().map((chip) => chip.id);
    expect(ids).toContain('tag-chip-new-0');
    expect(ids.join(' ')).not.toMatch(/taco/i);
  });

  it('R42.10 shows a rejected tag name at the tags', async () => {
    await render(<Picker error="This couldn't be saved. Check it and try again." />);

    expect(screen.getByText("This couldn't be saved. Check it and try again.")).toBeOnTheScreen();
  });

  it('§5.3 shows New tag as an "Add tag" chip, read as "New tag"', async () => {
    await render(<Picker />);

    const chip = screen.getByTestId('tag-picker-new');
    expect(chip).toHaveProp('accessibilityLabel', 'New tag');
    expect(chip).toHaveTextContent(/Add tag/);
  });

  it('C-LFM-12 gives New tag a touch target of at least 44 × 44 pt', async () => {
    await render(<Picker />);

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'New tag' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });
});
