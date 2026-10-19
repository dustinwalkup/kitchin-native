import { StyleSheet, View } from 'react-native';

import { Chip } from '@/ui/chip';
import { Text } from '@/ui/text';

import { CATEGORIES, type CategoryKey } from '../constants';
import type { QuickAddGroup } from '../domain';

/**
 * The common items by category (R6.1). A chip whose item is open on the list shows ✓ and is
 * disabled (R6.2); tapping any other adds it to its category with no quantity (R6.3).
 */
export function QuickAddChips({
  groups,
  onAdd,
}: {
  groups: QuickAddGroup[];
  onAdd: (item: { name: string; category: CategoryKey }) => void;
}) {
  return (
    <View style={styles.quickAdd}>
      <Text variant="headline" accessibilityRole="header">
        Quick add
      </Text>
      {groups.map(({ category, chips }) => {
        const { label, emoji } = CATEGORIES.find((c) => c.key === category)!;
        return (
          <View key={category} testID="quick-add-group" style={styles.group}>
            {/* Read as the label alone, without the emoji's own description. */}
            <Text variant="subhead" color="inkMuted" accessibilityLabel={label}>
              {emoji} {label}
            </Text>
            <View style={styles.chips}>
              {chips.map(({ name, disabled }) => (
                <Chip
                  key={name}
                  label={name}
                  disabled={disabled}
                  onPress={() => onAdd({ name, category })}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  quickAdd: { gap: 16 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
