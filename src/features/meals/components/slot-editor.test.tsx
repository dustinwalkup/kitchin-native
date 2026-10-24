import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus, StyleSheet } from 'react-native';

import type { IsoDate } from '@/lib/calendar';
import { touchTarget } from '@/test/a11y';
import { makeMealEntry } from '@/test/factories';
import { themes } from '@/ui/theme';

import { buildWeek, type Slot } from '../domain';
import { DayCard } from './day-card';
import { counterLabel, SlotEditor } from './slot-editor';

// Slot editor C-SLOT-01 to C-SLOT-15 (meals 4-test-plan §4.2), one or more for each row of the
// design §3.5 table. The test plan's `onSave({ kind })` is `setMeal` here, as in 3-tasks 12.2 and
// design §3.5: a save sends `body`, a clear sends `body: null`. 2026-10-22 is a Thursday.

const theme = themes.light;
const setMeal = jest.fn();
const onClose = jest.fn();
let announce: jest.SpyInstance;

const THURSDAY = '2026-10-22' as IsoDate;
const slot = (body?: string): Slot => ({
  date: THURSDAY,
  mealType: 'dinner',
  entry: body === undefined ? null : makeMealEntry({ date: THURSDAY, body }),
});
const saved = (body: string | null) => ({ date: THURSDAY, mealType: 'dinner', body });

const ui = (s: Slot) => (
  <SlotEditor slot={s} name="Thursday dinner" setMeal={setMeal} onClose={onClose} />
);

const field = () => screen.getByTestId('slot-editor');
const type = (text: string) => fireEvent.changeText(field(), text);
// With `blurAndSubmit`, Return submits and then blurs (finding 4).
const pressReturn = async () => {
  await fireEvent(field(), 'submitEditing');
  await fireEvent(field(), 'blur');
};

// A mocked AppState emitter (4-test-plan §8.4), as in use-household-today.test.tsx.
let appStateListeners: ((state: AppStateStatus) => void)[] = [];
const emitAppState = (state: AppStateStatus) =>
  act(async () => appStateListeners.forEach((l) => l(state)));

beforeEach(() => {
  jest.clearAllMocks();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return {
      remove: () => (appStateListeners = appStateListeners.filter((other) => other !== listener)),
    };
  });
});

afterEach(() => jest.restoreAllMocks());

describe('SlotEditor', () => {
  it('C-SLOT-01 opens with the slot text, focused; Return saves once and closes', async () => {
    await render(ui(slot('Pasta')));

    expect(field()).toHaveDisplayValue('Pasta');
    expect(field()).toHaveProp('autoFocus', true);

    await type('Tacos');
    await pressReturn();

    expect(setMeal).toHaveBeenCalledTimes(1);
    expect(setMeal).toHaveBeenCalledWith(saved('Tacos'));
    expect(onClose).toHaveBeenCalled();
  });

  it('C-SLOT-01 opens an empty slot with an empty field and its placeholder', async () => {
    await render(ui(slot()));

    expect(field()).toHaveDisplayValue('');
    expect(field()).toHaveProp('placeholder', 'Add dinner');
  });

  it('C-SLOT-02 saves on blur without Return, and closes', async () => {
    await render(ui(slot()));

    await type('Tacos');
    await fireEvent(field(), 'blur');

    expect(setMeal).toHaveBeenCalledTimes(1);
    expect(setMeal).toHaveBeenCalledWith(saved('Tacos'));
    expect(onClose).toHaveBeenCalled();
  });

  it('C-SLOT-03 saves the draft when the screen unmounts it for another slot or week', async () => {
    await render(ui(slot('Pasta')));

    await type('Tacos');
    expect(setMeal).not.toHaveBeenCalled();
    await screen.unmount();

    expect(setMeal).toHaveBeenCalledTimes(1);
    expect(setMeal).toHaveBeenCalledWith(saved('Tacos'));
  });

  it.each<AppStateStatus>(['inactive', 'background'])(
    'C-SLOT-04 saves when the app goes %s, and stays open',
    async (state) => {
      await render(ui(slot()));

      await type('Tacos');
      await emitAppState(state);

      expect(setMeal).toHaveBeenCalledTimes(1);
      expect(setMeal).toHaveBeenCalledWith(saved('Tacos'));
      expect(onClose).not.toHaveBeenCalled();
      expect(field()).toHaveDisplayValue('Tacos');

      // Coming back changes nothing, and a second commit of the same text sends nothing.
      await emitAppState('active');
      await emitAppState(state);
      expect(setMeal).toHaveBeenCalledTimes(1);

      await type('Tacos al pastor');
      await fireEvent(field(), 'blur');
      await fireEvent(field(), 'blur');

      expect(setMeal).toHaveBeenCalledTimes(2);
      expect(setMeal).toHaveBeenLastCalledWith(saved('Tacos al pastor'));
    },
  );

  it('C-SLOT-04 stops listening to AppState once closed', async () => {
    await render(ui(slot()));
    expect(appStateListeners).toHaveLength(1);

    await screen.unmount();

    expect(appStateListeners).toHaveLength(0);
  });

  it('C-SLOT-05 sends exactly one save for a blur followed by an unmount', async () => {
    await render(ui(slot('Pasta')));

    await type('Tacos');
    await fireEvent(field(), 'blur');
    await screen.unmount();

    expect(setMeal).toHaveBeenCalledTimes(1);
  });

  it('C-SLOT-05 sends nothing when the editor closes untouched', async () => {
    await render(ui(slot('Pasta')));

    await pressReturn();
    await screen.unmount();

    expect(setMeal).not.toHaveBeenCalled();
  });

  it('C-SLOT-06 sends nothing for text changed only by surrounding whitespace', async () => {
    await render(ui(slot('Pasta')));

    await type('  Pasta\n\t\u0085');
    await pressReturn();

    expect(setMeal).not.toHaveBeenCalled();
  });

  it('R32.4 saves the text trimmed', async () => {
    await render(ui(slot()));

    await type('  Tacos\n');
    await pressReturn();

    expect(setMeal).toHaveBeenCalledWith(saved('Tacos'));
  });

  it('C-SLOT-07 keeps the draft when the entry changes, and closing then sends nothing', async () => {
    await render(ui(slot('Pasta')));

    await screen.rerender(ui(slot('Pizza')));

    expect(field()).toHaveDisplayValue('Pasta');
    await pressReturn();
    await screen.unmount();
    // Writing "Pasta" back would undo the other member's save (DD27).
    expect(setMeal).not.toHaveBeenCalled();
  });

  it('C-SLOT-07 keeps a half-typed draft when the entry changes', async () => {
    await render(ui(slot('Pasta')));

    await type('Pasta bake');
    await screen.rerender(ui(slot('Pizza')));

    expect(field()).toHaveDisplayValue('Pasta bake');
  });

  it("C-SLOT-08 saves the member's text after the entry changed underneath", async () => {
    await render(ui(slot('Pasta')));

    await screen.rerender(ui(slot('Pizza')));
    await type('Tacos');
    await pressReturn();

    expect(setMeal).toHaveBeenCalledTimes(1);
    expect(setMeal).toHaveBeenCalledWith(saved('Tacos'));
  });

  it('C-SLOT-09 clears a planned slot emptied with Return', async () => {
    await render(ui(slot('Pasta')));

    await type('');
    await pressReturn();

    expect(setMeal).toHaveBeenCalledTimes(1);
    expect(setMeal).toHaveBeenCalledWith(saved(null));
  });

  it('C-SLOT-09 sends nothing for an empty slot left empty, or holding only spaces', async () => {
    await render(ui(slot()));

    await type('   ');
    await pressReturn();

    expect(setMeal).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('C-SLOT-10 Clear clears a planned slot at once and closes the editor', async () => {
    await render(ui(slot('Pasta')));

    await type('Pasta bake');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));

    expect(setMeal).toHaveBeenCalledTimes(1);
    expect(setMeal).toHaveBeenCalledWith(saved(null));
    expect(onClose).toHaveBeenCalledTimes(1);

    // The unmount that follows sends nothing more.
    await screen.unmount();
    expect(setMeal).toHaveBeenCalledTimes(1);
  });

  it('C-SLOT-10 Clear on a slot that was empty discards the draft and sends nothing', async () => {
    await render(ui(slot()));

    await type('Tac');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));

    expect(setMeal).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('C-SLOT-10 Clear removes text already saved while the editor was open', async () => {
    await render(ui(slot()));

    await type('Tacos');
    await emitAppState('background');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));

    expect(setMeal.mock.calls).toEqual([[saved('Tacos')], [saved(null)]]);
  });

  it('N11 Clear is at least 44 × 44 pt', async () => {
    await render(ui(slot('Pasta')));

    const target = touchTarget(screen.getByRole('button', { name: 'Clear' }));
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  });

  it('C-SLOT-11 keeps the first 500 characters of typing past the limit', async () => {
    await render(ui(slot()));

    await type('a'.repeat(501));

    expect(field()).toHaveDisplayValue('a'.repeat(500));
  });

  it('C-SLOT-11 keeps the first 500 code points of a pasted 600, emoji counting as one', async () => {
    await render(ui(slot()));

    await type('😀'.repeat(600));
    await pressReturn();

    expect(field()).toHaveDisplayValue('😀'.repeat(500));
    expect(setMeal).toHaveBeenCalledWith(saved('😀'.repeat(500)));
  });

  it('C-SLOT-12 shows the counter only below 50 left, and tells VoiceOver at first and at zero', async () => {
    await render(ui(slot()));
    const counter = () => screen.queryByText(/characters? left$/);

    await type('a'.repeat(450));
    expect(counter()).toBeNull();
    expect(announce).not.toHaveBeenCalled();

    await type('a'.repeat(451));
    expect(counter()).toHaveTextContent('49 characters left');
    expect(announce).toHaveBeenLastCalledWith('49 characters left');

    await type('a'.repeat(499));
    expect(counter()).toHaveTextContent('1 character left');

    await type('a'.repeat(500));
    expect(counter()).toHaveTextContent('No characters left');

    expect(announce.mock.calls).toEqual([['49 characters left'], ['No characters left']]);
  });

  it('C-SLOT-12 announces once for a paste straight to the limit', async () => {
    await render(ui(slot()));

    await type('a'.repeat(600));

    expect(announce.mock.calls).toEqual([['No characters left']]);
  });

  it('C-SLOT-12 shows the counter at once for a slot already near the limit', async () => {
    await render(ui(slot('a'.repeat(460))));

    expect(screen.getByText('40 characters left')).toBeOnTheScreen();
  });

  it('C-SLOT-13 is multi-line, with Return as Done, and keeps a pasted line break', async () => {
    await render(ui(slot()));

    expect(field()).toHaveProp('multiline', true);
    expect(field()).toHaveProp('returnKeyType', 'done');
    expect(field()).toHaveProp('submitBehavior', 'blurAndSubmit');

    await type('Tacos\nand salsa');
    await pressReturn();

    expect(setMeal).toHaveBeenCalledWith(saved('Tacos\nand salsa'));
  });

  it('C-SLOT-14 labels the field "Thursday dinner" for VoiceOver', async () => {
    await render(ui(slot('Pasta')));

    expect(screen.getByLabelText('Thursday dinner')).toBe(field());
    // The visible "Dinner" label and the icon are hidden, so VoiceOver reads the field's label once.
    expect(screen.queryByText('Dinner')).toBeNull();
  });

  it('R26.7 has only static test IDs, none with meal text', async () => {
    await render(ui(slot('Tacos')));
    await type('a'.repeat(480));

    const ids = screen
      .getAllByTestId(/./, { includeHiddenElements: true })
      .map((e) => e.props.testID as string);
    expect(new Set(ids)).toEqual(new Set(['meal-type-icon', 'slot-editor', 'slot-clear']));
  });

  it('C-SLOT-15 typing re-renders only the open day, not the week’s other DayCards', async () => {
    const week = buildWeek('2026-10-19' as IsoDate, [
      makeMealEntry({ date: THURSDAY, body: 'Pasta' }),
    ]);
    const renderEditor = (s: Slot, name: string) => (
      <SlotEditor slot={s} name={name} setMeal={setMeal} onClose={onClose} />
    );
    const onRender = jest.fn<void, Parameters<ProfilerOnRenderCallback>>();
    await render(
      <>
        {week.map((day) => (
          <Profiler key={day.date} id={day.date} onRender={onRender}>
            <DayCard
              day={day}
              isToday={false}
              editing={day.date === THURSDAY ? 'dinner' : null}
              renderEditor={renderEditor}
              onEdit={jest.fn()}
              onClear={jest.fn()}
            />
          </Profiler>
        ))}
      </>,
    );
    onRender.mockClear();

    await type('Pasta b');
    await type('Pasta ba');

    const drawn = onRender.mock.calls.map(([id]) => id);
    expect(drawn.length).toBeGreaterThan(0);
    expect(new Set(drawn)).toEqual(new Set([THURSDAY]));
  });
});

// Choose from Meal Library, C-SLOT-16 to C-SLOT-18 (meal-library 4-test-plan §4.5, design §3.11).
describe('SlotEditor with Choose from Meal Library', () => {
  const onChooseFromLibrary = jest.fn();
  const withChoose = (s: Slot) => (
    <SlotEditor
      slot={s}
      name="Thursday dinner"
      setMeal={setMeal}
      onClose={onClose}
      onChooseFromLibrary={onChooseFromLibrary}
    />
  );
  const choose = () => screen.getByRole('button', { name: 'Choose from Meal Library' });

  it('C-SLOT-16 has no Choose button without onChooseFromLibrary', async () => {
    await render(ui(slot('Pasta')));

    expect(screen.queryByRole('button', { name: 'Choose from Meal Library' })).toBeNull();
    expect(screen.queryByTestId('slot-choose')).toBeNull();
  });

  it('C-SLOT-17 shows Choose before Clear, in bold terracotta, with a static test ID', async () => {
    await render(withChoose(slot('Pasta')));

    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'Choose from Meal Library',
      'Clear',
    ]);
    expect(screen.getByTestId('slot-choose')).toBe(choose());
    // Terracotta carries text only in bold (N13).
    expect(screen.getByText('Choose from Meal Library')).toHaveStyle({
      color: theme.accent,
      fontWeight: '700',
    });
  });

  it('C-SLOT-17 Choose is at least 44 × 44 pt', async () => {
    await render(withChoose(slot('Pasta')));

    const target = touchTarget(choose());
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  });

  it('C-SLOT-17 tapping Choose calls the prop, and the unmount that follows saves the draft', async () => {
    await render(withChoose(slot('Pasta')));

    await type('Tacos');
    await fireEvent.press(choose());

    expect(onChooseFromLibrary).toHaveBeenCalledTimes(1);
    // The editor's saving doesn't change: the screen's navigation closes it (design §3.11).
    expect(setMeal).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await screen.unmount();
    expect(setMeal).toHaveBeenCalledTimes(1);
    expect(setMeal).toHaveBeenCalledWith(saved('Tacos'));
  });

  it('C-SLOT-18 wraps the counter, Choose and Clear at the largest text size, clipping none', async () => {
    await render(withChoose(slot('a'.repeat(480))));

    // The footer wraps its items onto new lines rather than clipping them.
    expect(choose().parent).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap' });
    expect(screen.getByText('20 characters left').parent).toBe(choose().parent);
    // Choose grows with its label and shrinks to the footer's width, so its text wraps inside it.
    expect(choose()).toHaveStyle({ flexShrink: 1 });
    expect(StyleSheet.flatten(choose().props.style).height).toBeUndefined();
    const label = screen.getByText('Choose from Meal Library');
    expect(label).toHaveProp('allowFontScaling', true);
    expect(label).toHaveProp('maxFontSizeMultiplier', 2);
    expect(label).not.toHaveProp('numberOfLines');
  });
});

describe('counterLabel', () => {
  it.each([
    [49, '49 characters left'],
    [2, '2 characters left'],
    [1, '1 character left'],
    [0, 'No characters left'],
  ])('reads %i as "%s"', (left, label) => {
    expect(counterLabel(left)).toBe(label);
  });
});
