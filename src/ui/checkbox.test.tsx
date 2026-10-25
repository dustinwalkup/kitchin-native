import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';

import { Checkbox, CheckboxMark } from './checkbox';
import { themes } from './theme';

const { light } = themes;
const TICK = String.fromCodePoint(Number(MaterialCommunityIcons.glyphMap['check-bold']));

describe('Checkbox', () => {
  it('C-UI-01 exposes the checkbox role, its label and its checked state', async () => {
    await render(<Checkbox label="Milk" checked onChange={() => {}} />);

    expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
  });

  it('C-UI-01 reports an unchecked box as not checked', async () => {
    await render(<Checkbox label="Milk" checked={false} onChange={() => {}} />);

    expect(screen.getByRole('checkbox', { name: 'Milk' })).not.toBeChecked();
  });

  it('C-UI-02 has a touch target of at least 44 × 44 pt', async () => {
    await render(<Checkbox label="Milk" checked={false} onChange={() => {}} />);

    const { width, height } = touchTarget(screen.getByRole('checkbox', { name: 'Milk' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('asks for the opposite state when pressed', async () => {
    const onChange = jest.fn();
    await render(<Checkbox label="Milk" checked={false} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Milk' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('ignores presses while disabled', async () => {
    const onChange = jest.fn();
    await render(<Checkbox label="Milk" checked disabled onChange={onChange} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Milk' }));

    expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CheckboxMark', () => {
  it('R4.6 fills a checked box with sage and draws a white tick, so it reads by shape too', async () => {
    await render(<CheckboxMark checked />);

    const mark = screen.getByTestId('checkbox-mark');
    expect(mark).toHaveStyle({
      width: 24,
      height: 24,
      backgroundColor: light.sage,
      borderColor: light.sage,
    });
    expect(within(mark).getByText(TICK)).toHaveStyle({ color: light.onBrand });
  });

  it('outlines an unchecked box in controlBorder, its only boundary (N13), with no tick', async () => {
    await render(<CheckboxMark checked={false} />);

    const mark = screen.getByTestId('checkbox-mark');
    expect(mark).toHaveStyle({
      backgroundColor: light.background,
      borderColor: light.controlBorder,
    });
    expect(within(mark).queryByText(TICK)).not.toBeOnTheScreen();
  });

  it('is the mark inside Checkbox', async () => {
    await render(<Checkbox label="Milk" checked onChange={() => {}} />);

    expect(
      within(screen.getByRole('checkbox', { name: 'Milk' })).getByTestId('checkbox-mark'),
    ).toHaveStyle({ backgroundColor: light.sage });
  });
});
