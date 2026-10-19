import { StyleSheet, View } from 'react-native';

import { Chip } from '@/ui/chip';
import { Text } from '@/ui/text';

import { CATEGORIES, type CategoryKey } from '../constants';

/**
 * One chip per category, in the fixed order, with exactly one selected (R5.1). The selected chip
 * shows its label and the others only their emoji, so the row stays short above the keyboard
 * (§3.4). VoiceOver reads every chip's label.
 */
export function CategoryChips({
  selected,
  onSelect,
}: {
  selected: CategoryKey;
  onSelect: (category: CategoryKey) => void;
}) {
  return (
    <View style={styles.field}>
      <Text variant="subhead" bold>
        Category
      </Text>
      <View style={styles.chips}>
        {CATEGORIES.map(({ key, label, emoji }) => (
          <Chip
            key={key}
            label={key === selected ? `${emoji} ${label}` : emoji}
            accessibilityLabel={label}
            selected={key === selected}
            onPress={() => onSelect(key)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
