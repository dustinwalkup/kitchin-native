import { render, screen } from '@testing-library/react-native';

import { CountBadge } from './count-badge';
import { themes } from './theme';

const { light } = themes;

// CountBadge replaced the per-category CategoryBadge (specs/redesign/design.md DD-R1): one sage
// count for what's left, a neutral one for information and an accent one for Today.

describe('CountBadge', () => {
  it('is a sage count by default, for what’s still to do', async () => {
    await render(<CountBadge label="4 left" />);

    expect(screen.getByText('4 left')).toHaveStyle({
      color: light.sageInk,
      fontWeight: '600',
      fontSize: 12,
    });
    expect(screen.getByText('4 left').parent).toHaveStyle({
      backgroundColor: light.sageSoft,
      borderRadius: 999,
    });
  });

  it.each([
    ['sage', light.sageInk, light.sageSoft],
    ['neutral', light.inkMuted, light.sunken],
    ['accent', light.accentInk, light.accentSoft],
  ] as const)('draws the %s tone in its own pair', async (tone, fg, bg) => {
    await render(<CountBadge label="2/3" tone={tone} />);

    expect(screen.getByText('2/3')).toHaveStyle({ color: fg });
    expect(screen.getByText('2/3').parent).toHaveStyle({ backgroundColor: bg });
  });

  it('lets VoiceOver read more than the visible count', async () => {
    await render(<CountBadge label="2/3" accessibilityLabel="2 of 3 meals planned" />);

    expect(screen.getByLabelText('2 of 3 meals planned')).toHaveTextContent('2/3');
  });

  it('reads the visible count without a label of its own', async () => {
    await render(<CountBadge label="Done" />);

    expect(screen.getByText('Done').props.accessibilityLabel).toBeUndefined();
  });
});
