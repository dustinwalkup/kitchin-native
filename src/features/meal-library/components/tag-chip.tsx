import { SymbolView } from 'expo-symbols';

import { Chip } from '@/ui/chip';
import { useTheme } from '@/ui/use-theme';

import { FAVORITE_TAG_KEY } from '../constants';

export interface TagChipProps {
  /** The tag's ID, or the form's own key for a tag it hasn't created yet. Only the test ID uses it. */
  id: string;
  name: string;
  /** The tag's key, which marks Family Favorite with a heart (DD-R8). */
  tagKey?: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * A tag to select, in the filter and the form (§3.7). Selected, it's blush with a terracotta edge
 * and label and a leading ✓, so selection shows by more than colour (R43.1, N13). VoiceOver reads
 * the name without the ✓, and "selected" from the chip's state (N10).
 */
export function TagChip({ id, name, tagKey, selected, onPress }: TagChipProps) {
  const theme = useTheme();
  const favourite = tagKey === FAVORITE_TAG_KEY;

  return (
    <Chip
      // An ID, never the tag's name (R26.7).
      testID={`tag-chip-${id}`}
      label={selected ? `✓ ${name}` : name}
      accessibilityLabel={name}
      selected={selected}
      onPress={onPress}
      leading={
        favourite && !selected ? (
          <SymbolView name="heart.fill" tintColor={theme.accent} size={12} />
        ) : undefined
      }
    />
  );
}
