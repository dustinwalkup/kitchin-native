import { fireEvent, render, screen } from '@testing-library/react-native';

import { LoadError, WaitingForConnection } from './week-states';

// C-WEEK-13 (meals 4-test-plan §4.1).

describe('week states', () => {
  it('C-WEEK-13 LoadError says "Couldn\'t load meals", and Retry calls onRetry', async () => {
    const onRetry = jest.fn();
    await render(<LoadError onRetry={onRetry} />);

    expect(screen.getByRole('header', { name: "Couldn't load meals" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('C-WEEK-13 WaitingForConnection says "Waiting for connection…"', async () => {
    await render(<WaitingForConnection />);

    expect(screen.getByTestId('meals-waiting-for-connection')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Waiting for connection…' })).toBeOnTheScreen();
  });
});
