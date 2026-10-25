import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';

import { SegmentedControl } from './segmented-control';
import { themes } from './theme';

const { light } = themes;

const MODES = [
  { key: 'library', label: 'Choose from library' },
  { key: 'write', label: 'Enter manually' },
] as const;

describe('SegmentedControl', () => {
  it('N10 is a tab list whose segments are tabs with their selected state', async () => {
    await render(<SegmentedControl segments={MODES} selected="library" onSelect={() => {}} />);

    // A container rather than an element of its own, so VoiceOver reaches each tab.
    expect(screen.root).toHaveProp('accessibilityRole', 'tablist');
    expect(screen.getByRole('tab', { name: 'Choose from library' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Enter manually' })).not.toBeSelected();
  });

  it('N13 raises the chosen segment as a white tab with a semibold accentInk label', async () => {
    await render(<SegmentedControl segments={MODES} selected="write" onSelect={() => {}} />);

    expect(screen.getByRole('tab', { name: 'Enter manually' })).toHaveStyle({
      backgroundColor: light.background,
      shadowColor: light.ink,
    });
    expect(screen.getByText('Enter manually')).toHaveStyle({
      color: light.accentInk,
      fontWeight: '600',
    });
    expect(screen.getByRole('tab', { name: 'Choose from library' })).not.toHaveStyle({
      backgroundColor: light.background,
    });
    expect(screen.getByText('Choose from library')).toHaveStyle({
      color: light.inkMuted,
      fontWeight: '500',
    });
  });

  it('sits on the sunken track', async () => {
    await render(<SegmentedControl segments={MODES} selected="write" onSelect={() => {}} />);

    expect(screen.root).toHaveStyle({
      backgroundColor: light.sunken,
      borderRadius: light.radius.base,
    });
  });

  it('asks for the segment pressed', async () => {
    const onSelect = jest.fn();
    await render(<SegmentedControl segments={MODES} selected="library" onSelect={onSelect} />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Enter manually' }));

    expect(onSelect).toHaveBeenCalledWith('write');
  });

  it('gives each segment a static test ID from its key', async () => {
    await render(
      <SegmentedControl
        testID="plan-mode"
        segments={MODES}
        selected="library"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId('plan-mode-library')).toHaveAccessibleName('Choose from library');
    expect(screen.getByTestId('plan-mode-write')).toHaveAccessibleName('Enter manually');
  });

  it('gives the segments no test IDs without one', async () => {
    await render(<SegmentedControl segments={MODES} selected="library" onSelect={() => {}} />);

    expect(screen.getByRole('tab', { name: 'Enter manually' }).props.testID).toBeUndefined();
  });

  it('N11 gives each 38 pt segment a 44 pt touch target, counting its hitSlop', async () => {
    await render(<SegmentedControl segments={MODES} selected="library" onSelect={() => {}} />);

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveStyle({ minHeight: 38 });
      expect(touchTarget(tab).height).toBeGreaterThanOrEqual(44);
    }
  });
});
