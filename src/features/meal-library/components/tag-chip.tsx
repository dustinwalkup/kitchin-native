import { Chip } from '@/ui/chip';

export interface TagChipProps {
  /** The tag's ID, or the form's own key for a tag it hasn't created yet. Only the test ID uses it. */
  id: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * A tag to select, in the filter and the form (§3.7). Selected, it's terracotta with bold white
 * text and a leading ✓, so selection shows by more than colour (R43.1, N13). VoiceOver reads the
 * name without the ✓, and "selected" from the chip's state (N10).
 */
export function TagChip({ id, name, selected, onPress }: TagChipProps) {
  return (
    <Chip
      // An ID, never the tag's name (R26.7).
      testID={`tag-chip-${id}`}
      label={selected ? `✓ ${name}` : name}
      accessibilityLabel={name}
      tone="accent"
      selected={selected}
      onPress={onPress}
    />
  );
}
