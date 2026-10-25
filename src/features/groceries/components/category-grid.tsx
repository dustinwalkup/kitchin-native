import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { CATEGORIES, type CategoryKey } from '../constants';

/**
 * Every category as a tile, its emoji over its name, four to a row, with exactly one selected (R5.1).
 * The selected tile is blush with a terracotta edge and label, so it shows by more than colour
 * (N13). VoiceOver reads each tile's name and selected state, without the emoji (N10).
 */
export function CategoryGrid({
  selected,
  onSelect,
}: {
  selected: CategoryKey;
  onSelect: (category: CategoryKey) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.grid}>
      {CATEGORIES.map(({ key, label, emoji }) => {
        const active = key === selected;
        return (
          <Pressable
            key={key}
            testID={`category-${key}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(key)}
            style={({ pressed }) => [
              styles.tile,
              { borderRadius: theme.radius.base },
              active
                ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                : {
                    backgroundColor: pressed ? theme.sunken : theme.background,
                    borderColor: theme.border,
                  },
            ]}
          >
            <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
              {emoji}
            </Text>
            <Text
              variant="caption"
              color={active ? 'accentInk' : 'ink'}
              weight={active ? 'semibold' : 'medium'}
              numberOfLines={2}
              style={styles.label}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Four to a row on every iPhone width; at large text sizes the labels wrap to two lines.
  tile: {
    flexBasis: '22%',
    flexGrow: 1,
    minHeight: 64,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emoji: { fontSize: 22, lineHeight: 28 },
  label: { textAlign: 'center' },
});
