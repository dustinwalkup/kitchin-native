import { Alert, type AlertButton } from 'react-native';

import { confirmClearChecked, confirmUncheckAll } from './list-actions';

// The confirmations behind the progress panel's Clear checked and Uncheck all (specs/redesign/
// design.md §4.1): tests C-ITEM-08–09 and C-ITEM-12–13 (4-test-plan §4.6). progress-header.test.tsx
// covers the buttons, and groceries.test.tsx the wiring to the hooks.

let alert: jest.SpyInstance;

beforeEach(() => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The title, message and buttons of the latest confirmation. */
function confirmation(): { title: string; message: string; buttons: AlertButton[] } {
  expect(alert).toHaveBeenCalled();
  const [title, message, buttons] = alert.mock.calls.at(-1);
  return { title, message, buttons };
}

const press = (text: string) =>
  confirmation()
    .buttons.find((b) => b.text === text)
    ?.onPress?.();
const buttonStyles = () => confirmation().buttons.map(({ text, style }) => ({ text, style }));

describe('confirmClearChecked', () => {
  const onClear = jest.fn();

  beforeEach(() => onClear.mockReset());

  it('C-ITEM-08 asks "Clear 4 checked items?", with Cancel and a destructive Clear', () => {
    confirmClearChecked(4, onClear);

    expect(confirmation().title).toBe('Clear 4 checked items?');
    expect(confirmation().message).toBe("They'll be removed from the list.");
    expect(buttonStyles()).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive' },
    ]);
    expect(onClear).not.toHaveBeenCalled();
  });

  it('C-ITEM-08 says "item" for one', () => {
    confirmClearChecked(1, onClear);

    expect(confirmation().title).toBe('Clear 1 checked item?');
  });

  it('C-ITEM-08 changes nothing on Cancel (R10.5)', () => {
    confirmClearChecked(4, onClear);
    press('Cancel');

    expect(onClear).not.toHaveBeenCalled();
  });

  it('C-ITEM-09 clears once when confirmed', () => {
    confirmClearChecked(4, onClear);
    press('Clear');

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('confirmUncheckAll', () => {
  const onUncheck = jest.fn();

  beforeEach(() => onUncheck.mockReset());

  it('C-ITEM-12 asks "Uncheck 4 items?", with Cancel and a non-destructive Uncheck', () => {
    confirmUncheckAll(4, onUncheck);

    expect(confirmation().title).toBe('Uncheck 4 items?');
    expect(confirmation().message).toBe("They'll go back on the list to buy again.");
    expect(buttonStyles()).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Uncheck', style: undefined },
    ]);
  });

  it('C-ITEM-12 says "item" for one', () => {
    confirmUncheckAll(1, onUncheck);

    expect(confirmation().title).toBe('Uncheck 1 item?');
  });

  it('C-ITEM-12 changes nothing on Cancel', () => {
    confirmUncheckAll(4, onUncheck);
    press('Cancel');

    expect(onUncheck).not.toHaveBeenCalled();
  });

  it('C-ITEM-13 unchecks once when confirmed', () => {
    confirmUncheckAll(4, onUncheck);
    press('Uncheck');

    expect(onUncheck).toHaveBeenCalledTimes(1);
  });
});
