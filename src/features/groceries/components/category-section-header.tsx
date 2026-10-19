import { StyleSheet, View } from 'react-native';

import { CategoryBadge } from '@/ui/category-badge';
import { Text } from '@/ui/text';

import { CATEGORIES, type CategoryKey } from '../constants';

/** "🥬 Produce" with an "N left" badge of the section's open items (R4.3, R16.4). */
export function CategorySectionHeader({
  category,
  openCount,
}: {
  category: CategoryKey;
  openCount: number;
}) {
  const { label, emoji } = CATEGORIES.find((c) => c.key === category)!;
  const left = `${openCount} left`;

  return (
    // One element for VoiceOver, without the emoji's own description.
    <View
      testID="section-header"
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${label}, ${left}`}
      style={styles.header}
    >
      <Text variant="headline" style={styles.title}>
        {emoji} {label}
      </Text>
      <CategoryBadge category={category} label={left} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: { flexShrink: 1 },
});
