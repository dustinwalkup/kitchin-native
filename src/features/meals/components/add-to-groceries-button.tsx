import { IconButton } from '@/ui/icon-button';

import { COPY } from '../constants';

/**
 * The cart-plus in the Meals header, which opens the add-item sheet over Meals (R37.1, DD33). It
 * takes nothing from the week, so no meal text reaches the sheet (R37.4). `accentInk` on the ivory
 * header, an ICON_PAIRS pair.
 */
export function AddToGroceriesButton({ onPress }: { onPress: () => void }) {
  return (
    <IconButton
      testID="add-to-groceries"
      symbol="cart.badge.plus"
      label={COPY.addToGroceries}
      tint="accentInk"
      size={22}
      onPress={onPress}
    />
  );
}
