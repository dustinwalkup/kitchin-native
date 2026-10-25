import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';
import { themes } from '@/ui/theme';

import { type Progress, progress } from '../domain';
import { ProgressHeader, progressSummary } from './progress-header';

// The progress panel (R4.7, R10 as redesigned, specs/redesign/design.md §4.1). groceries.test.tsx
// covers it on the screen; this covers the copy for every count, the switch and the action row on
// their own.

const { light } = themes;

describe('progressSummary', () => {
  it.each([
    [0, 0, '0 of 0 items'],
    [0, 1, '0 of 1 item'],
    [1, 1, 'All 1 item'],
    [2, 8, '2 of 8 items'],
    [7, 8, '7 of 8 items'],
    [8, 8, 'All 8 items'],
  ])('says %i checked of %i as %j', (checked, total, summary) => {
    expect(progressSummary({ checked, total, percent: null })).toBe(summary);
  });
});

describe('ProgressHeader', () => {
  const onHideCheckedChange = jest.fn();
  const onUncheckAll = jest.fn();
  const onClearChecked = jest.fn();
  const TWO_OF_EIGHT: Progress = { checked: 2, total: 8, percent: 25 };

  const panel = ({
    hideChecked = false,
    uncheckCount = 2,
    value = TWO_OF_EIGHT,
  }: { hideChecked?: boolean; uncheckCount?: number; value?: Progress } = {}) => (
    <ProgressHeader
      progress={value}
      hideChecked={hideChecked}
      onHideCheckedChange={onHideCheckedChange}
      uncheckCount={uncheckCount}
      onUncheckAll={onUncheckAll}
      onClearChecked={onClearChecked}
    />
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const uncheckAll = () => screen.getByRole('button', { name: 'Uncheck all' });
  const clearChecked = () => screen.getByRole('button', { name: 'Clear checked' });

  it('reads the summary to VoiceOver as one element, with the percentage', async () => {
    await render(panel());

    const summary = screen.getByTestId('progress-header');
    expect(summary).toHaveProp('accessible', true);
    expect(summary).toHaveProp('accessibilityLabel', '2 of 8 checked, 25%');
    expect(screen.getByText('2 of 8 items')).toBeOnTheScreen();
  });

  it('shows the Hide checked items switch as it is set, and reports a change', async () => {
    await render(panel());
    const toggle = screen.getByRole('switch', { name: 'Hide checked items' });
    expect(toggle).toHaveProp('value', false);
    // Sage when on, the soft border when off.
    expect(toggle).toHaveProp('onTintColor', light.sage);
    expect(toggle).toHaveProp('tintColor', light.border);

    await fireEvent(toggle, 'valueChange', true);
    expect(onHideCheckedChange).toHaveBeenCalledWith(true);

    await screen.rerender(panel({ hideChecked: true }));
    expect(screen.getByRole('switch', { name: 'Hide checked items' })).toHaveProp('value', true);
  });

  it('has no bar for an empty list (R4.8)', async () => {
    await render(panel({ value: progress([]), uncheckCount: 0 }));

    expect(screen.getByLabelText('0 of 0 checked')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-fill')).not.toBeOnTheScreen();
  });

  it('offers Uncheck all and a destructive Clear checked once something is checked', async () => {
    await render(panel());

    expect(uncheckAll()).toBe(screen.getByTestId('uncheck-all'));
    expect(clearChecked()).toBe(screen.getByTestId('clear-checked'));
    expect(uncheckAll()).toBeEnabled();
    expect(within(uncheckAll()).getByText('Uncheck all')).toHaveStyle({ color: light.accentInk });
    expect(within(clearChecked()).getByText('Clear checked')).toHaveStyle({
      color: light.destructive,
    });

    await fireEvent.press(uncheckAll());
    await fireEvent.press(clearChecked());

    expect(onUncheckAll).toHaveBeenCalledTimes(1);
    expect(onClearChecked).toHaveBeenCalledTimes(1);
  });

  it('C-ITEM-07 C-ITEM-11 offers neither while nothing is checked (R10.1, R10.6)', async () => {
    await render(panel({ value: { checked: 0, total: 8, percent: 0 }, uncheckCount: 0 }));

    expect(screen.queryByTestId('uncheck-all')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('clear-checked')).not.toBeOnTheScreen();
  });

  it('C-ITEM-11 disables Uncheck all while every checked item stays checked (R10.7)', async () => {
    await render(panel({ uncheckCount: 0 }));

    expect(uncheckAll()).toBeDisabled();
    expect(clearChecked()).toBeEnabled();
    await fireEvent.press(uncheckAll());

    expect(onUncheckAll).not.toHaveBeenCalled();
  });

  it('N11 makes each action a target of at least 44 pt', async () => {
    await render(panel());

    for (const button of [uncheckAll(), clearChecked()]) {
      const { width, height } = touchTarget(button);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });
});
