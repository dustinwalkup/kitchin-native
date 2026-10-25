import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';
import { themes } from '@/ui/theme';

import { TagChip } from './tag-chip';

// Browser components C-LBR-09, 12 and 13 for tag chips (4-test-plan §4.1), as redesigned
// (specs/redesign/design.md DD-R3, DD-R8).

const theme = themes.light;

describe('TagChip', () => {
  it('C-LBR-09 shows "✓ Quick & Easy" when selected, read as "Quick & Easy" and selected', async () => {
    await render(<TagChip id="tag-quick" name="Quick & Easy" selected onPress={() => {}} />);

    const chip = screen.getByRole('button', { name: 'Quick & Easy' });
    expect(chip).toBeSelected();
    // DD-R3: blush, a terracotta edge and a semibold terracotta label.
    expect(chip).toHaveStyle({ backgroundColor: theme.accentSoft, borderColor: theme.accent });
    expect(screen.getByText('✓ Quick & Easy')).toHaveStyle({
      color: theme.accentInk,
      fontWeight: '600',
    });
  });

  it('C-LBR-09 shows the name alone, not selected, when deselected', async () => {
    await render(
      <TagChip id="tag-quick" name="Quick & Easy" selected={false} onPress={() => {}} />,
    );

    const chip = screen.getByRole('button', { name: 'Quick & Easy' });
    expect(chip).not.toBeSelected();
    expect(chip).toHaveStyle({ backgroundColor: theme.background, borderColor: theme.border });
    expect(screen.getByText('Quick & Easy')).toHaveStyle({ color: theme.ink });
    expect(screen.queryByText('✓ Quick & Easy')).toBeNull();
  });

  it('DD-R8 marks Family Favorite with a heart, by its key', async () => {
    await render(
      <TagChip
        id="tag-favourite"
        name="Family Favorite"
        tagKey="family favorite"
        selected={false}
        onPress={() => {}}
      />,
    );

    const [heart] = screen.getByRole('button', { name: 'Family Favorite' }).children;
    expect(heart).toHaveProp('name', 'heart.fill');
    expect(heart).toHaveProp('tintColor', theme.accent);
  });

  it('DD-R8 shows the ✓ in place of the heart once Family Favorite is selected', async () => {
    await render(
      <TagChip
        id="tag-favourite"
        name="Family Favorite"
        tagKey="family favorite"
        selected
        onPress={() => {}}
      />,
    );

    expect(screen.getByText('✓ Family Favorite')).toBeOnTheScreen();
    expect(screen.root!.queryAll((node) => node.props.name === 'heart.fill')).toEqual([]);
  });

  it('DD-R8 draws no heart on any other tag', async () => {
    await render(
      <TagChip
        id="tag-quick"
        name="Quick & Easy"
        tagKey="quick & easy"
        selected={false}
        onPress={() => {}}
      />,
    );

    expect(screen.root!.queryAll((node) => node.props.name === 'heart.fill')).toEqual([]);
  });

  it('R43.2 calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<TagChip id="tag-quick" name="Quick & Easy" selected={false} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Quick & Easy' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('C-LBR-12 has a touch target of at least 44 × 44 pt', async () => {
    await render(
      <TagChip id="tag-quick" name="Quick & Easy" selected={false} onPress={() => {}} />,
    );

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'Quick & Easy' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('C-LBR-13 has a test ID with the tag ID and no tag name', async () => {
    await render(
      <TagChip id="tag-quick" name="Quick & Easy" selected={false} onPress={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'Quick & Easy' })).toHaveProp(
      'testID',
      'tag-chip-tag-quick',
    );
  });
});
