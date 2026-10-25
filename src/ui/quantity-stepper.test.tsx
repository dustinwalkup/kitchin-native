import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Pressable, TextInput } from 'react-native';

import { touchTarget } from '@/test/a11y';

import { QuantityStepper, StepButton } from './quantity-stepper';
import { themes } from './theme';

const { light } = themes;

// "− 2 +" (specs/redesign/design.md §4.1): one adjustable element for VoiceOver on its own, or a
// field between the buttons. The buttons themselves are hidden from VoiceOver.
//
// A disabled step leaves `onPress` off its Pressable but still takes the touch. `fireEvent.press`
// would find StepButton's own `onPress` prop by walking up the component tree, so those tests press
// with `userEvent`, which goes through the host view's responder handlers as a real touch does.

const STEPPER = 'stepper';

function stepper(props: Partial<Parameters<typeof QuantityStepper>[0]> = {}) {
  const onDecrement = jest.fn();
  const onIncrement = jest.fn();
  return {
    onDecrement,
    onIncrement,
    ui: (
      <QuantityStepper
        testID={STEPPER}
        label="Apples quantity"
        value="2"
        onDecrement={onDecrement}
        onIncrement={onIncrement}
        {...props}
      />
    ),
  };
}

/** The − and + buttons, which VoiceOver doesn't see. */
const steps = () => {
  const [decrement, , increment] = screen.getByTestId(STEPPER, {
    includeHiddenElements: true,
  }).children;
  if (typeof decrement === 'string' || typeof increment === 'string') {
    throw new Error('Expected the step buttons');
  }
  return { decrement, increment };
};

/** VoiceOver's swipe up or down on the adjustable element. */
const adjust = (actionName: 'increment' | 'decrement') =>
  fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName } });

describe('QuantityStepper', () => {
  it('N10 is one adjustable element, named by its label, with the value', async () => {
    await render(stepper().ui);

    const element = screen.getByRole('adjustable', { name: 'Apples quantity' });
    expect(element).toHaveProp('accessible', true);
    expect(element).toHaveProp('accessibilityValue', { text: '2' });
    expect(element.props.accessibilityActions).toEqual([
      { name: 'increment' },
      { name: 'decrement' },
    ]);
    expect(screen.getByText('2')).toHaveStyle({ fontWeight: '600' });
  });

  it('draws a soft-edged white pill', async () => {
    await render(stepper().ui);

    expect(screen.getByTestId(STEPPER)).toHaveStyle({
      borderColor: light.border,
      backgroundColor: light.background,
      borderRadius: 999,
    });
  });

  it('steps down with − and up with +', async () => {
    const { ui, onDecrement, onIncrement } = stepper();
    await render(ui);

    await fireEvent.press(steps().decrement);
    expect(onDecrement).toHaveBeenCalledTimes(1);
    await fireEvent.press(steps().increment);
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it('steps with VoiceOver’s adjust actions', async () => {
    const { ui, onDecrement, onIncrement } = stepper();
    await render(ui);

    await adjust('increment');
    await adjust('decrement');

    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it('ignores an adjust action it can’t take, and any other action', async () => {
    const { ui, onDecrement, onIncrement } = stepper({ canDecrement: false, canIncrement: false });
    await render(ui);

    await adjust('increment');
    await adjust('decrement');
    await fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(onIncrement).not.toHaveBeenCalled();
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it('marks − disabled and dims it at the bottom of the range, and ignores a press', async () => {
    const { ui, onDecrement } = stepper({ canDecrement: false });
    await render(ui);

    await userEvent.setup().press(steps().decrement);

    expect(onDecrement).not.toHaveBeenCalled();
    expect(steps().decrement).toBeDisabled();
    expect(steps().decrement).toHaveStyle({ opacity: 0.3 });
    expect(steps().increment).toBeEnabled();
    expect(steps().increment).not.toHaveStyle({ opacity: 0.3 });
  });

  it('marks + disabled when it can’t go up, and ignores a press', async () => {
    const { ui, onIncrement } = stepper({ canIncrement: false });
    await render(ui);

    await userEvent.setup().press(steps().increment);

    expect(onIncrement).not.toHaveBeenCalled();
    expect(steps().increment).toBeDisabled();
  });

  it('keeps a disabled step’s touch, so a tap at a limit never reaches the row around it', async () => {
    const onRowPress = jest.fn();
    const { ui, onDecrement } = stepper({ canDecrement: false, accessible: false });
    await render(
      <Pressable testID="row" onPress={onRowPress}>
        {ui}
      </Pressable>,
    );

    // It still claims the touch, which a disabled Pressable would leave to the row.
    expect(steps().decrement.props.onStartShouldSetResponder()).toBe(true);
    await userEvent.setup().press(steps().decrement);

    expect(onDecrement).not.toHaveBeenCalled();
    expect(onRowPress).not.toHaveBeenCalled();
  });

  it('steps without pressing the row around it', async () => {
    const onRowPress = jest.fn();
    const { ui, onIncrement } = stepper({ accessible: false });
    await render(
      <Pressable testID="row" onPress={onRowPress}>
        {ui}
      </Pressable>,
    );

    await userEvent.setup().press(steps().increment);

    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onRowPress).not.toHaveBeenCalled();
    // The row itself still presses.
    await userEvent.setup().press(screen.getByTestId('row'));
    expect(onRowPress).toHaveBeenCalledTimes(1);
  });

  it('hides the step buttons from VoiceOver', async () => {
    await render(stepper().ui);

    for (const step of Object.values(steps())) {
      expect(step).toHaveProp('accessibilityElementsHidden', true);
      expect(step).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    }
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('shows a field in place of the value, which VoiceOver reaches instead', async () => {
    await render(
      stepper({
        value: '2 lbs',
        children: <TextInput accessibilityLabel="Quantity" value="2 lbs" />,
      }).ui,
    );

    expect(screen.queryByRole('adjustable')).not.toBeOnTheScreen();
    expect(screen.getByTestId(STEPPER)).toHaveProp('accessible', false);
    expect(screen.getByLabelText('Quantity')).toBeOnTheScreen();
    expect(screen.queryByText('2 lbs')).not.toBeOnTheScreen();
  });

  it('leaves the actions to a row that reads as one element', async () => {
    await render(stepper({ accessible: false }).ui);

    const element = screen.getByTestId(STEPPER);
    expect(screen.queryByRole('adjustable')).not.toBeOnTheScreen();
    expect(element).toHaveProp('accessible', false);
    expect(element.props.accessibilityActions).toBeUndefined();
    expect(element.props.accessibilityLabel).toBeUndefined();
  });
});

describe('StepButton', () => {
  it('N11 is 30 pt, with slop that brings its touch target to 44 pt', async () => {
    await render(<StepButton testID="step" kind="increment" onPress={() => {}} />);

    const button = screen.getByTestId('step', { includeHiddenElements: true });
    const { width, height } = touchTarget(button);
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it.each([
    ['decrement', 'minus'],
    ['increment', 'plus'],
  ] as const)('draws %s as an ink %s', async (kind, symbol) => {
    await render(<StepButton testID="step" kind={kind} onPress={() => {}} />);

    const [glyph] = screen.getByTestId('step', { includeHiddenElements: true }).children;
    expect(glyph).toHaveProp('name', symbol);
    expect(glyph).toHaveProp('tintColor', light.ink);
  });
});
