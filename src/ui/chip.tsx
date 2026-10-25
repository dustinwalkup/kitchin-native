import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface ChipProps {
  label: string;
  /** What VoiceOver reads, when the visible label is shorter, such as an emoji alone. */
  accessibilityLabel?: string;
  onPress: () => void;
  /** Blush with a terracotta edge and label, for the chosen filter, category or tag. */
  selected?: boolean;
  /** Shown as ✓ in `inkMuted`, for an item that's already on the list (R6.2). */
  disabled?: boolean;
  /** A glyph or emoji before the label. Decorative. */
  leading?: ReactNode;
  /** Static parts and IDs only, never household text (R26.7). */
  testID?: string;
}

// Chips are 34 pt tall; the slop brings the touch target to 44 pt (N11).
const HIT_SLOP = { top: 5, bottom: 5, left: 0, right: 0 };

/**
 * A rounded choice: a filter, a quick-add item or a tag. Selection shows by its edge, fill and label
 * weight together, so colour is never the only sign (N13).
 */
export function Chip({
  label,
  accessibilityLabel = label,
  onPress,
  selected = false,
  disabled = false,
  leading,
  testID,
}: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={disabled ? `${accessibilityLabel}, already added` : accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderRadius: theme.radius.pill },
        selected
          ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
          : {
              backgroundColor: pressed ? theme.sunken : theme.background,
              borderColor: theme.border,
            },
      ]}
    >
      {leading}
      <Text
        variant="subhead"
        color={selected ? 'accentInk' : disabled ? 'inkMuted' : 'ink'}
        weight={selected ? 'semibold' : 'regular'}
      >
        {disabled ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
