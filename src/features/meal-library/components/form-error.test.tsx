import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { touchTarget } from '@/test/a11y';

import { COPY } from '../constants';
import { describeProblem, FormError, type FormProblem } from './form-error';

// Meal form components C-LFM-09 for the error box (4-test-plan §4.3): each row of the design §3.9
// table, and the delete's (R44.4).

let announce: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('describeProblem', () => {
  it.each<[string, FormProblem, ReturnType<typeof describeProblem>]>([
    [
      'an offline save',
      { kind: 'save', outcome: { ok: false, reason: 'offline' } },
      { message: COPY.offline, action: 'retry', field: null },
    ],
    [
      'a value the database rejected at a field',
      { kind: 'save', outcome: { ok: false, reason: 'invalid', field: 'name' } },
      { message: COPY.saveError, action: null, field: 'name' },
    ],
    [
      'a value the database rejected at no known field',
      { kind: 'save', outcome: { ok: false, reason: 'invalid', field: null } },
      { message: COPY.saveError, action: null, field: null },
    ],
    [
      'a forbidden save',
      { kind: 'save', outcome: { ok: false, reason: 'forbidden' } },
      { message: "You don't have access to that", action: null, field: null },
    ],
    [
      'an edit of a meal deleted on the other phone',
      { kind: 'save', outcome: { ok: false, reason: 'deleted' } },
      { message: 'This meal was deleted on another device', action: 'saveAsNew', field: null },
    ],
    [
      'a save that failed otherwise',
      { kind: 'save', outcome: { ok: false, reason: 'failed' } },
      { message: "Couldn't save this meal", action: 'retry', field: null },
    ],
    [
      'an offline delete',
      { kind: 'delete', outcome: { ok: false, reason: 'offline' } },
      { message: COPY.offline, action: 'retry', field: null },
    ],
    [
      'a forbidden delete',
      { kind: 'delete', outcome: { ok: false, reason: 'forbidden' } },
      { message: "You don't have access to that", action: null, field: null },
    ],
    [
      'a delete that failed otherwise',
      { kind: 'delete', outcome: { ok: false, reason: 'failed' } },
      { message: "Couldn't delete this meal", action: 'retry', field: null },
    ],
  ])('C-LFM-09 describes %s', (_, problem, expected) => {
    expect(describeProblem(problem)).toEqual(expected);
  });
});

describe('FormError', () => {
  it('C-LFM-09 shows the message and its action, which the member can press', async () => {
    const onPress = jest.fn();
    await render(<FormError message={COPY.offline} action={{ label: 'Retry', onPress }} />);

    expect(screen.getByText(COPY.offline)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('C-LFM-09 offers nothing when there is no action', async () => {
    await render(<FormError message={COPY.forbidden} />);

    expect(screen.getByText(COPY.forbidden)).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('C-LFM-09 is announced when it appears, and is a live region', async () => {
    await render(<FormError message={COPY.saveError} />);

    expect(announce.mock.calls).toEqual([[COPY.saveError]]);
    expect(screen.getByTestId('meal-form-error')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it("disables its action while it's busy", async () => {
    const onPress = jest.fn();
    await render(
      <FormError message={COPY.offline} action={{ label: 'Retry', onPress, disabled: true }} />,
    );

    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeDisabled();
    await fireEvent.press(retry);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('C-LFM-12 gives its action a touch target of at least 44 × 44 pt', async () => {
    await render(
      <FormError
        message={COPY.deletedElsewhere}
        action={{ label: COPY.saveAsNew, onPress() {} }}
      />,
    );

    const { width, height } = touchTarget(screen.getByRole('button', { name: COPY.saveAsNew }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });
});
