import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  EmptyLibrary,
  LoadError,
  NoMatch,
  SkeletonRows,
  WaitingForConnection,
} from './library-states';

// Browser components C-LBR-07 and C-LBR-11 (4-test-plan §4.1).

describe('library states', () => {
  it('C-LBR-11 SkeletonRows reads "Loading meals", with its blocks hidden', async () => {
    await render(<SkeletonRows />);

    const skeleton = screen.getByTestId('library-skeleton');
    expect(skeleton).toHaveProp('accessible', true);
    expect(skeleton).toHaveProp('accessibilityLabel', 'Loading meals');
  });

  it('C-LBR-11 LoadError says "Couldn\'t load meals", and Retry calls onRetry', async () => {
    const onRetry = jest.fn();
    await render(<LoadError onRetry={onRetry} />);

    expect(screen.getByRole('header', { name: "Couldn't load meals" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('C-LBR-11 WaitingForConnection says "Waiting for connection…"', async () => {
    await render(<WaitingForConnection />);

    expect(screen.getByTestId('library-waiting-for-connection')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Waiting for connection…' })).toBeOnTheScreen();
  });

  it('C-LBR-07 EmptyLibrary says "No saved meals yet", what the library is for, and its action', async () => {
    const onAction = jest.fn();
    await render(<EmptyLibrary actionLabel="Add meal" onAction={onAction} />);

    expect(screen.getByRole('header', { name: 'No saved meals yet' })).toBeOnTheScreen();
    expect(
      screen.getByText('Save the meals you make often, then choose them when you plan the week.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add meal' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('C-LBR-07 NoMatch says "No meals match", and Clear filters calls onClearFilters', async () => {
    const onClearFilters = jest.fn();
    await render(<NoMatch onClearFilters={onClearFilters} />);

    expect(screen.getByRole('header', { name: 'No meals match' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'No saved meals yet' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
