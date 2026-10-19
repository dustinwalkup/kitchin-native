import { render, screen } from '@testing-library/react-native';
import { useReducedMotion, withRepeat } from 'react-native-reanimated';

import { SkeletonWeek } from './skeleton-week';

// C-WEEK-12 (meals 4-test-plan §4.1). Reanimated's Jest mock, with Reduce Motion and the repeating
// pulse under the test's control, as in skeleton.test.tsx.
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  return { ...mock, useReducedMotion: jest.fn(), withRepeat: jest.fn(mock.withRepeat) };
});

const reduceMotion = jest.mocked(useReducedMotion);
const repeat = jest.mocked(withRepeat);

afterEach(() => jest.clearAllMocks());

describe('SkeletonWeek', () => {
  it('C-WEEK-12 draws seven placeholder day cards, read as "Loading meals"', async () => {
    reduceMotion.mockReturnValue(false);

    await render(<SkeletonWeek />);

    const week = screen.getByLabelText('Loading meals');
    expect(week).toHaveProp('testID', 'skeleton-week');
    expect(week.children).toHaveLength(7);
    expect(repeat).toHaveBeenCalled();
  });

  it('C-WEEK-12 starts no animation under Reduce Motion', async () => {
    reduceMotion.mockReturnValue(true);

    await render(<SkeletonWeek />);

    expect(repeat).not.toHaveBeenCalled();
  });
});
