import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { touchTarget } from '@/test/a11y';

import { UncheckAllButton } from './uncheck-all-button';

// Uncheck all tests C-ITEM-11–13 (4-test-plan §4.6).

const onUncheck = jest.fn();
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const button = () => screen.getByRole('button', { name: 'Uncheck all' });

/** Presses Uncheck all and returns the confirmation's title and buttons. */
async function openConfirmation(): Promise<{ title: string; buttons: AlertButton[] }> {
  await fireEvent.press(button());
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, , buttons] = alert.mock.calls[0];
  return { title, buttons };
}

const press = (buttons: AlertButton[], text: string) =>
  act(async () => buttons.find((b) => b.text === text)?.onPress?.());

describe('UncheckAllButton', () => {
  it('C-ITEM-11 is disabled, and asks nothing, while nothing can be unchecked', async () => {
    await render(<UncheckAllButton uncheckCount={0} onUncheck={onUncheck} />);

    expect(button()).toBeDisabled();
    await fireEvent.press(button());

    expect(alert).not.toHaveBeenCalled();
    expect(onUncheck).not.toHaveBeenCalled();
  });

  it('C-ITEM-12 asks "Uncheck 4 items?", with Cancel and a non-destructive Uncheck', async () => {
    await render(<UncheckAllButton uncheckCount={4} onUncheck={onUncheck} />);

    const { title, buttons } = await openConfirmation();

    expect(title).toBe('Uncheck 4 items?');
    expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Uncheck', style: undefined },
    ]);
  });

  it('C-ITEM-12 says "item" for one', async () => {
    await render(<UncheckAllButton uncheckCount={1} onUncheck={onUncheck} />);

    expect((await openConfirmation()).title).toBe('Uncheck 1 item?');
  });

  it('C-ITEM-12 changes nothing on Cancel', async () => {
    await render(<UncheckAllButton uncheckCount={4} onUncheck={onUncheck} />);

    await press((await openConfirmation()).buttons, 'Cancel');

    expect(onUncheck).not.toHaveBeenCalled();
  });

  it('C-ITEM-13 unchecks once when confirmed', async () => {
    await render(<UncheckAllButton uncheckCount={4} onUncheck={onUncheck} />);

    await press((await openConfirmation()).buttons, 'Uncheck');

    expect(onUncheck).toHaveBeenCalledTimes(1);
  });

  it('is a 44 pt target in bold text (N11, N13)', async () => {
    await render(<UncheckAllButton uncheckCount={2} onUncheck={onUncheck} />);

    const { width, height } = touchTarget(button());
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
    expect(screen.getByText('Uncheck all')).toHaveStyle({ fontWeight: '700' });
  });
});
