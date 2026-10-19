import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';

import { Checkbox } from './checkbox';

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
