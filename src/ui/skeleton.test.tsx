import { render, screen } from '@testing-library/react-native';
import { useReducedMotion, withRepeat } from 'react-native-reanimated';

import { Skeleton } from './skeleton';
import { themes } from './theme';

// Reanimated's Jest mock, with Reduce Motion and the repeating shimmer under the test's control.
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  return { ...mock, useReducedMotion: jest.fn(), withRepeat: jest.fn(mock.withRepeat) };
});

const reduceMotion = jest.mocked(useReducedMotion);
const repeat = jest.mocked(withRepeat);

afterEach(() => jest.clearAllMocks());

describe('Skeleton', () => {
  it('pulses when Reduce Motion is off', async () => {
    reduceMotion.mockReturnValue(false);

    await render(<Skeleton />);

    expect(repeat).toHaveBeenCalled();
  });

  it('C-UI-06 starts no animation when Reduce Motion is on', async () => {
    reduceMotion.mockReturnValue(true);

    await render(<Skeleton height={20} />);

    expect(repeat).not.toHaveBeenCalled();
  });

  it('is a block on the sunken tone, hidden from VoiceOver', async () => {
    reduceMotion.mockReturnValue(true);

    await render(<Skeleton width={120} height={20} radius={4} />);

    expect(screen.root).toHaveStyle({
      width: 120,
      height: 20,
      borderRadius: 4,
      backgroundColor: themes.light.sunken,
    });
    expect(screen.root).toHaveProp('accessibilityElementsHidden', true);
    expect(screen.root).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  });
});
