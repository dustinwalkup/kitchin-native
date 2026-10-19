import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { touchTarget } from '@/test/a11y';

import { ClearCheckedButton } from './clear-checked-button';

// Clear checked tests C-ITEM-07–09 (4-test-plan §4.6).

const onClear = jest.fn();
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const button = () => screen.getByRole('button', { name: 'Clear checked' });

/** Presses Clear checked and returns the confirmation's title and buttons. */
async function openConfirmation(): Promise<{ title: string; buttons: AlertButton[] }> {
  await fireEvent.press(button());
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, , buttons] = alert.mock.calls[0];
  return { title, buttons };
}

const press = (buttons: AlertButton[], text: string) =>
  act(async () => buttons.find((b) => b.text === text)?.onPress?.());

describe('ClearCheckedButton', () => {
  it('C-ITEM-07 is disabled, and asks nothing, while nothing is checked', async () => {
    await render(<ClearCheckedButton checkedCount={0} onClear={onClear} />);

    expect(button()).toBeDisabled();
    await fireEvent.press(button());

    expect(alert).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('C-ITEM-08 asks "Clear 4 checked items?", with Cancel and a destructive Clear', async () => {
    await render(<ClearCheckedButton checkedCount={4} onClear={onClear} />);

    const { title, buttons } = await openConfirmation();

    expect(title).toBe('Clear 4 checked items?');
    expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive' },
    ]);
  });

  it('C-ITEM-08 says "item" for one', async () => {
    await render(<ClearCheckedButton checkedCount={1} onClear={onClear} />);

    expect((await openConfirmation()).title).toBe('Clear 1 checked item?');
  });

  it('C-ITEM-08 changes nothing on Cancel (R10.5)', async () => {
    await render(<ClearCheckedButton checkedCount={4} onClear={onClear} />);

    await press((await openConfirmation()).buttons, 'Cancel');

    expect(onClear).not.toHaveBeenCalled();
  });

  it('C-ITEM-09 clears once when confirmed', async () => {
    await render(<ClearCheckedButton checkedCount={4} onClear={onClear} />);

    await press((await openConfirmation()).buttons, 'Clear');

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('is a 44 pt target in bold text (N11, N13)', async () => {
    await render(<ClearCheckedButton checkedCount={2} onClear={onClear} />);

    const { width, height } = touchTarget(button());
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
    expect(screen.getByText('Clear checked')).toHaveStyle({ fontWeight: '700' });
  });
});
