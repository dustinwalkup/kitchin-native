import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  EmptyLibrary,
  LoadError,
  MissingMeal,
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

  it('C-LBR-07 EmptyLibrary says "No meals yet", what the library is for, and its action', async () => {
    const onAction = jest.fn();
    await render(<EmptyLibrary actionLabel="Add meal" onAction={onAction} />);

    expect(screen.getByTestId('library-empty')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'No meals yet' })).toBeOnTheScreen();
    expect(
      screen.getByText('Save the meals you make often, then choose them when you plan the week.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add meal' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('C-LBR-07 NoMatch says "No matching meals", and Clear filters calls onClearFilters', async () => {
    const onClearFilters = jest.fn();
    await render(<NoMatch onClearFilters={onClearFilters} />);

    expect(screen.getByTestId('library-no-match')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'No matching meals' })).toBeOnTheScreen();
    expect(screen.getByText('Try another search, or clear the filters.')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'No meals yet' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("§3.9 MissingMeal says the meal isn't in the library, and Close calls onClose", async () => {
    const onClose = jest.fn();
    await render(<MissingMeal onClose={onClose} />);

    expect(screen.getByTestId('meal-form-missing')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: "This meal isn't in the library any more" }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
