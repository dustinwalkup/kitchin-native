import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { render, screen, within } from '@testing-library/react-native';

import { LogoTile } from './logo-tile';
import { themes } from './theme';

const { light } = themes;

describe('LogoTile', () => {
  it('C-UI-08 renders the white chef-hat icon on a terracotta tile (R16.5 as redesigned)', async () => {
    await render(<LogoTile />);

    const tile = screen.getByRole('image', { name: 'Kitchin' });
    const chefHat = String.fromCodePoint(Number(MaterialCommunityIcons.glyphMap['chef-hat']));

    expect(tile).toHaveStyle({ backgroundColor: light.accent });
    expect(within(tile).getByText(chefHat)).toHaveStyle({ color: light.onBrand });
  });
});
