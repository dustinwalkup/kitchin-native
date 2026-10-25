import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { CountBadge } from '@/ui/count-badge';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { CATEGORIES, type CategoryKey } from '../constants';

export interface CategorySectionHeaderProps {
  category: CategoryKey;
  openCount: number;
  collapsed: boolean;
  onToggle: (category: CategoryKey) => void;
}

/** "4 left", or "Done" once every item in the section is checked (R4.3). */
export function leftLabel(openCount: number): string {
  return openCount === 0 ? 'Done' : `${openCount} left`;
}

/**
 * "🥬 Produce", a chevron, and the section's open items as a sage count (R4.3). Straight on the
 * page, with no card, so it reads as a heading. Tapping it collapses or expands the section, which
 * VoiceOver hears as the button's expanded state (specs/redesign/design.md §4.1).
 */
export function CategorySectionHeader({
  category,
  openCount,
  collapsed,
  onToggle,
}: CategorySectionHeaderProps) {
  const theme = useTheme();
  const { label, emoji } = CATEGORIES.find((c) => c.key === category)!;
  const left = leftLabel(openCount);

  return (
    // One element for VoiceOver, without the emoji's own description.
    <Pressable
      testID="section-header"
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${openCount} left`}
      accessibilityHint={collapsed ? 'Shows this section' : 'Hides this section'}
      accessibilityState={{ expanded: !collapsed }}
      onPress={() => onToggle(category)}
      style={({ pressed }) => [styles.header, pressed && styles.pressed]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.title}>
        <Text variant="headline">{label}</Text>
        <SymbolView
          name={collapsed ? 'chevron.right' : 'chevron.down'}
          weight="semibold"
          tintColor={theme.inkMuted}
          size={12}
        />
      </View>
      <CountBadge label={left} tone={openCount === 0 ? 'neutral' : 'sage'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  emoji: { fontSize: 20, lineHeight: 26 },
  // Wraps at large text sizes rather than clipping (N12).
  title: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.6 },
});
