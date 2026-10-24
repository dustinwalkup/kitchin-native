import { SymbolView } from 'expo-symbols';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY } from '../constants';
import type { Tag } from '../domain';
import { TagChip } from './tag-chip';

export interface TagFilterProps {
  /** Every household tag, in alphabetical order (R43.10). */
  tags: Tag[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Shown at the end of the toggle's row: the browser's Clear filters (R41.7). */
  action?: ReactNode;
}

/** What VoiceOver reads for the toggle: "Filter by tags, 2 selected" (N27). */
export function filterLabel(count: number): string {
  return count === 0 ? COPY.filter : `${COPY.filter}, ${count} selected`;
}

/**
 * One Filter by tags control (R41.2, DD53). Collapsed, it shows how many tags are selected, and
 * which, without listing every tag (R41.3). Expanded in place, it shows every tag as a chip to
 * select or deselect, and Done.
 */
export function TagFilter({ tags, selected, onToggle, action }: TagFilterProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const chosen = tags.filter((tag) => selected.has(tag.id));

  return (
    <View style={styles.filter}>
      {/* Wraps at large text sizes, so Clear filters moves below rather than clipping (N12). */}
      <View style={styles.bar}>
        <Pressable
          testID="library-filter"
          accessibilityRole="button"
          accessibilityLabel={filterLabel(chosen.length)}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((open) => !open)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <Text variant="subhead" bold style={styles.shrink}>
            {chosen.length === 0 ? COPY.filter : `${COPY.filter} · ${chosen.length}`}
          </Text>
          <SymbolView
            name={expanded ? 'chevron.up' : 'chevron.down'}
            weight="semibold"
            tintColor={theme.ink}
            size={13}
          />
        </Pressable>
        {action}
      </View>
      {expanded ? (
        <>
          <View style={styles.chips}>
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                id={tag.id}
                name={tag.name}
                selected={selected.has(tag.id)}
                onPress={() => onToggle(tag.id)}
              />
            ))}
          </View>
          <Pressable
            testID="library-filter-done"
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={() => setExpanded(false)}
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}
          >
            {/* Terracotta carries text only in bold (N13). */}
            <Text variant="subhead" color="accent" bold>
              Done
            </Text>
          </Pressable>
        </>
      ) : chosen.length === 0 ? null : (
        <Text variant="subhead" color="inkMuted">
          {chosen.map((tag) => tag.name).join(', ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filter: { gap: 4 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 6,
    minHeight: 44,
    minWidth: 44,
  },
  shrink: { flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 6 },
  done: {
    alignSelf: 'flex-end',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
