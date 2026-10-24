import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '@/test/a11y';
import { themes } from '@/ui/theme';

import { TagChip } from './tag-chip';

// Browser components C-LBR-09, 12 and 13 for tag chips (4-test-plan §4.1).

const theme = themes.light;

describe('TagChip', () => {
  it('C-LBR-09 shows "✓ Dinner" when selected, read as "Dinner" and selected', async () => {
    await render(<TagChip id="tag-dinner" name="Dinner" selected onPress={() => {}} />);

    const chip = screen.getByRole('button', { name: 'Dinner' });
    expect(chip).toBeSelected();
    expect(chip).toHaveStyle({ backgroundColor: theme.accent });
    expect(screen.getByText('✓ Dinner')).toHaveStyle({ color: theme.onBrand, fontWeight: '700' });
  });

  it('C-LBR-09 shows the name alone, not selected, when deselected', async () => {
    await render(<TagChip id="tag-dinner" name="Dinner" selected={false} onPress={() => {}} />);

    const chip = screen.getByRole('button', { name: 'Dinner' });
    expect(chip).not.toBeSelected();
    expect(screen.getByText('Dinner')).toBeOnTheScreen();
    expect(screen.queryByText('✓ Dinner')).toBeNull();
  });

  it('R43.2 calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<TagChip id="tag-dinner" name="Dinner" selected={false} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Dinner' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('C-LBR-12 has a touch target of at least 44 × 44 pt', async () => {
    await render(<TagChip id="tag-dinner" name="Dinner" selected={false} onPress={() => {}} />);

    const { width, height } = touchTarget(screen.getByRole('button', { name: 'Dinner' }));
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it('C-LBR-13 has a test ID with the tag ID and no tag name', async () => {
    await render(<TagChip id="tag-dinner" name="Dinner" selected={false} onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Dinner' })).toHaveProp(
      'testID',
      'tag-chip-tag-dinner',
    );
  });
});
