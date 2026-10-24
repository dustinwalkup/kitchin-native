import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef, useState } from 'react';
import { AccessibilityInfo, TextInput } from 'react-native';

import { touchTarget } from '@/test/a11y';
import { makeTagRow } from '@/test/factories';
import { themes } from '@/ui/theme';

import { COPY } from '../constants';
import { buildLibrary, type FormValues } from '../domain';
import type { FormProblem } from './form-error';
import { counterLabel, MealForm, type MealFormHandle } from './meal-form';

// Meal form components C-LFM-01 to 05 and 09 to 12 (4-test-plan §4.3). The tags' own cases, C-LFM-06
// to 08, are in tag-picker.test.tsx. The screen's header Save calls the form's `save()`, which these
// tests call through the ref.

const theme = themes.light;

const { tags } = buildLibrary(
  [],
  [
    makeTagRow({ id: 'tag-dinner', name: 'Dinner' }),
    makeTagRow({ id: 'tag-quick', name: 'Quick & Easy' }),
  ],
).library;

const EMPTY: FormValues = { name: '', description: '', ingredients: '', tags: [] };
const LASAGNA: FormValues = {
  name: '  Lasagna ',
  description: 'Beef and ricotta\n',
  ingredients: '',
  tags: [{ kind: 'existing', id: 'tag-dinner' }],
};

const onSave = jest.fn();
const onSaveAsNew = jest.fn();
const onDelete = jest.fn();
const onRetryDelete = jest.fn();
const handle = createRef<MealFormHandle>();
// What the component last passed to onChange.
const changed = jest.fn<void, [FormValues]>();
const latest = (): FormValues => changed.mock.lastCall![0];
let announce: jest.SpyInstance;
let focus: jest.SpyInstance;

interface FormOptions {
  initial?: FormValues;
  editing?: boolean;
  problem?: FormProblem | null;
  busy?: boolean;
}

// Holds the values, as the form screen does, so each change shows.
function Form({ initial = EMPTY, editing = false, problem = null, busy = false }: FormOptions) {
  const [values, setValues] = useState(initial);
  return (
    <MealForm
      ref={handle}
      values={values}
      onChange={(next) => {
        changed(next);
        setValues(next);
      }}
      tags={tags}
      editing={editing}
      problem={problem}
      busy={busy}
      onSave={onSave}
      onSaveAsNew={onSaveAsNew}
      onDelete={onDelete}
      onRetryDelete={onRetryDelete}
    />
  );
}

const nameField = () => screen.getByLabelText('Name');
const descriptionField = () => screen.getByLabelText('Description (optional)');
const ingredientsField = () => screen.getByLabelText('Ingredients (optional)');
const save = () => act(() => handle.current!.save());
const announced = () => announce.mock.calls.map(([message]) => message);
/** The fields that `focus()` was called on, by label. */
const focused = () =>
  focus.mock.contexts.map((field: { props: { accessibilityLabel: string } }) => {
    return field.props.accessibilityLabel;
  });
const counters = () => screen.queryAllByText(/characters? left$/).map((t) => t.props.children);

beforeEach(() => {
  jest.clearAllMocks();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(TextInput.prototype, 'focus');
});

afterEach(() => jest.restoreAllMocks());

describe('MealForm', () => {
  it('C-LFM-01 has Name, Description (optional), Ingredients (optional) and Tags, in that order', async () => {
    await render(<Form />);

    expect(nameField()).toHaveProp('testID', 'meal-form-name');
    expect(descriptionField()).toHaveProp('testID', 'meal-form-description');
    expect(ingredientsField()).toHaveProp('testID', 'meal-form-ingredients');
    expect(screen.getByText('Tags')).toBeOnTheScreen();

    const tree = JSON.stringify(screen.toJSON());
    const positions = ['Name', 'Description (optional)', 'Ingredients (optional)', 'Tags'].map(
      (label) => tree.indexOf(`"${label}"`),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('C-LFM-02 keeps Name on one line, turning pasted line breaks into spaces', async () => {
    await render(<Form />);

    expect(nameField().props.multiline).toBeFalsy();
    await fireEvent.changeText(nameField(), 'Two\nlines');
    expect(nameField()).toHaveProp('value', 'Two lines');

    // Description and Ingredients keep their line breaks.
    expect(descriptionField()).toHaveProp('multiline', true);
    expect(ingredientsField()).toHaveProp('multiline', true);
    expect(ingredientsField()).toHaveProp('placeholder', 'One per line');
    await fireEvent.changeText(ingredientsField(), '1 lb beef\n1 box noodles');
    expect(latest().ingredients).toBe('1 lb beef\n1 box noodles');
  });

  it('C-LFM-03 sizes each maxLength from the characters left, and clamps pasted text', async () => {
    await render(<Form />);

    expect(nameField()).toHaveProp('maxLength', 100);
    expect(descriptionField()).toHaveProp('maxLength', 300);
    expect(ingredientsField()).toHaveProp('maxLength', 2000);

    // An emoji is one character but two UTF-16 units, so the native limit grows to match (DD56).
    await fireEvent.changeText(nameField(), '🍕'.repeat(10));
    expect(nameField()).toHaveProp('maxLength', 110);

    await fireEvent.changeText(nameField(), 'a'.repeat(150));
    await fireEvent.changeText(descriptionField(), 'b'.repeat(301));
    await fireEvent.changeText(ingredientsField(), 'c'.repeat(2001));
    expect(latest()).toMatchObject({
      name: 'a'.repeat(100),
      description: 'b'.repeat(300),
      ingredients: 'c'.repeat(2000),
    });
  });

  it('C-LFM-04 shows each counter once few characters are left, and announces it', async () => {
    await render(<Form />);

    await fireEvent.changeText(nameField(), 'a'.repeat(80));
    expect(counters()).toEqual([]);
    await fireEvent.changeText(nameField(), 'a'.repeat(81));
    expect(counters()).toEqual(['19 characters left']);
    await fireEvent.changeText(nameField(), 'a'.repeat(82));
    await fireEvent.changeText(nameField(), 'a'.repeat(100));
    expect(counters()).toEqual(['No characters left']);
    expect(screen.getByText('No characters left')).toHaveStyle({ fontWeight: '700' });

    await fireEvent.changeText(descriptionField(), 'b'.repeat(251));
    expect(counters()).toEqual(['No characters left', '49 characters left']);

    // When each counter appears, and when one reaches zero (N10).
    expect(announced()).toEqual(['19 characters left', 'No characters left', '49 characters left']);
  });

  it('labels the counter in characters', () => {
    expect([counterLabel(12), counterLabel(1), counterLabel(0)]).toEqual([
      '12 characters left',
      '1 character left',
      'No characters left',
    ]);
  });

  it('C-LFM-05 stops at an empty name: shows the message there, focuses and announces it', async () => {
    await render(<Form initial={{ ...EMPTY, name: '   ' }} />);

    await save();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.nameRequired)).toHaveStyle({ color: theme.destructive });
    expect(focused()).toEqual(['Name']);
    expect(announced()).toEqual([COPY.nameRequired]);

    // Typing a name clears the message.
    await fireEvent.changeText(nameField(), 'Tacos');
    expect(screen.queryByText(COPY.nameRequired)).toBeNull();
  });

  it('R42.4 saves the values trimmed, with an empty optional field as none', async () => {
    await render(<Form initial={LASAGNA} />);

    await save();

    expect(onSave.mock.calls).toEqual([
      [
        {
          name: 'Lasagna',
          description: 'Beef and ricotta',
          ingredients: null,
          tags: [{ kind: 'existing', id: 'tag-dinner' }],
        },
      ],
    ]);
  });

  it('R42.2 moves from Name to Description on Return', async () => {
    await render(<Form />);

    await fireEvent(nameField(), 'submitEditing');

    expect(focused()).toEqual(['Description (optional)']);
  });

  describe('C-LFM-09 a failed save or delete', () => {
    it('offers Retry after an offline save, which saves the current values again', async () => {
      await render(
        <Form
          initial={LASAGNA}
          problem={{ kind: 'save', outcome: { ok: false, reason: 'offline' } }}
        />,
      );

      expect(screen.getByText(COPY.offline)).toBeOnTheScreen();
      expect(announced()).toEqual([COPY.offline]);
      await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lasagna' }));
    });

    it('offers Retry after a save that failed otherwise', async () => {
      await render(
        <Form
          initial={LASAGNA}
          problem={{ kind: 'save', outcome: { ok: false, reason: 'failed' } }}
        />,
      );

      expect(screen.getByText(COPY.saveError)).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('offers Save as new meal after the other phone deleted the meal', async () => {
      await render(
        <Form
          initial={LASAGNA}
          editing
          problem={{ kind: 'save', outcome: { ok: false, reason: 'deleted' } }}
        />,
      );

      expect(screen.getByText(COPY.deletedElsewhere)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: COPY.saveAsNew }));

      expect(onSaveAsNew).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lasagna' }));
      expect(onSave).not.toHaveBeenCalled();
    });

    it("doesn't save as new with an empty name", async () => {
      await render(
        <Form
          initial={{ ...LASAGNA, name: ' ' }}
          editing
          problem={{ kind: 'save', outcome: { ok: false, reason: 'deleted' } }}
        />,
      );

      await fireEvent.press(screen.getByRole('button', { name: COPY.saveAsNew }));

      expect(onSaveAsNew).not.toHaveBeenCalled();
      expect(screen.getByText(COPY.nameRequired)).toBeOnTheScreen();
    });

    it('offers nothing after a forbidden save', async () => {
      await render(
        <Form problem={{ kind: 'save', outcome: { ok: false, reason: 'forbidden' } }} />,
      );

      expect(screen.getByText(COPY.forbidden)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      expect(screen.queryByRole('button', { name: COPY.saveAsNew })).toBeNull();
    });

    it('offers Retry after a failed delete, which deletes again without asking', async () => {
      await render(
        <Form editing problem={{ kind: 'delete', outcome: { ok: false, reason: 'failed' } }} />,
      );

      expect(screen.getByText(COPY.deleteError)).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

      expect(onRetryDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('disables the action while a request is in progress', async () => {
      await render(
        <Form busy problem={{ kind: 'save', outcome: { ok: false, reason: 'offline' } }} />,
      );

      expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    });
  });

  it.each(['name', 'description', 'ingredients'] as const)(
    'C-LFM-10 shows a value the database rejected at %s, with no Retry',
    async (field) => {
      await render(
        <Form
          initial={LASAGNA}
          problem={{ kind: 'save', outcome: { ok: false, reason: 'invalid', field } }}
        />,
      );

      expect(screen.getByText(COPY.fieldRejected)).toHaveStyle({ color: theme.destructive });
      expect(screen.getByText(COPY.saveError)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      const input = {
        name: nameField,
        description: descriptionField,
        ingredients: ingredientsField,
      };
      expect(input[field]()).toHaveStyle({ borderColor: theme.destructive });
    },
  );

  it('C-LFM-10 shows a rejected tag name at the tags', async () => {
    await render(
      <Form
        initial={LASAGNA}
        problem={{ kind: 'save', outcome: { ok: false, reason: 'invalid', field: 'tags' } }}
      />,
    );

    expect(screen.getByText(COPY.fieldRejected)).toBeOnTheScreen();
    expect(nameField()).toHaveStyle({ borderColor: theme.controlBorder });
  });

  it('C-LFM-11 offers Delete meal only when editing, in bold destructive red', async () => {
    const { rerender } = await render(<Form />);
    expect(screen.queryByRole('button', { name: 'Delete meal' })).toBeNull();

    await rerender(<Form editing />);
    const remove = screen.getByRole('button', { name: 'Delete meal' });
    expect(remove).toHaveProp('testID', 'meal-form-delete');
    expect(screen.getByText('Delete meal')).toHaveStyle({
      color: theme.destructive,
      fontWeight: '700',
    });

    await fireEvent.press(remove);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('C-LFM-11 disables Delete meal while a request is in progress', async () => {
    await render(<Form editing busy />);

    const remove = screen.getByRole('button', { name: 'Delete meal' });
    expect(remove).toBeDisabled();
    await fireEvent.press(remove);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('C-LFM-12 labels every field and button, with touch targets of at least 44 pt', async () => {
    await render(<Form editing />);

    for (const field of [nameField(), descriptionField(), ingredientsField()]) {
      expect(touchTarget(field).height).toBeGreaterThanOrEqual(44);
    }
    const remove = touchTarget(screen.getByRole('button', { name: 'Delete meal' }));
    expect(remove.width).toBeGreaterThanOrEqual(44);
    expect(remove.height).toBeGreaterThanOrEqual(44);
  });

  it('R26.7 uses test IDs without meal text', async () => {
    await render(<Form initial={LASAGNA} editing />);

    const ids = screen.queryAllByTestId(/.+/).map((e) => e.props.testID as string);
    expect(ids.join(' ')).not.toMatch(/lasagna|ricotta/i);
  });
});
