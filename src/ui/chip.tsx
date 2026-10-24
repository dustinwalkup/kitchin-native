import { Pressable, StyleSheet } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface ChipProps {
  label: string;
  /** What VoiceOver reads, when the visible label is shorter, such as an emoji alone. */
  accessibilityLabel?: string;
  onPress: () => void;
  /** White bold text on the tone's colour, for the chosen category or tag. */
  selected?: boolean;
  /** A selected chip's colour: cactus by default, or terracotta for the meal library (DD57). */
  tone?: 'cactus' | 'accent';
  /** Shown as ✓ in `inkMuted`, for an item that's already on the list (R6.2). */
  disabled?: boolean;
}

// Chips are 32 pt tall; the slop brings the touch target to 44 pt (N11).
const HIT_SLOP = { top: 6, bottom: 6, left: 0, right: 0 };

export function Chip({
  label,
  accessibilityLabel = label,
  onPress,
  selected = false,
  disabled = false,
  tone = 'cactus',
}: ChipProps) {
  const theme = useTheme();
  const fill = theme[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={disabled ? `${accessibilityLabel}, already added` : accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: fill, borderColor: fill }
          : {
              backgroundColor: pressed ? theme.secondarySoft : theme.background,
              borderColor: theme.border,
            },
      ]}
    >
      <Text variant="subhead" color={selected ? 'onBrand' : disabled ? 'inkMuted' : 'ink'}>
        {disabled ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 32,
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
