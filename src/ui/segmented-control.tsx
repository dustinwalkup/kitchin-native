import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface Segment<K extends string> {
  key: K;
  label: string;
}

// Segments are 38 pt tall; the slop reaches over the track's padding, bringing each touch target to
// 44 pt (N11).
const SEGMENT_SLOP = { top: 3, bottom: 3, left: 0, right: 0 };

export interface SegmentedControlProps<K extends string> {
  segments: readonly Segment<K>[];
  selected: K;
  onSelect: (key: K) => void;
  /** Static, never household text (R26.7). Each segment gets `<testID>-<key>`. */
  testID?: string;
}

/**
 * Two or three mutually exclusive views, such as "Choose from library" and "Write it in". The
 * chosen segment is a raised white tab on a sunken track, with a terracotta label, so it shows by
 * shape as well as colour (N13). VoiceOver reads each as a tab with its selected state (N10).
 */
export function SegmentedControl<K extends string>({
  segments,
  selected,
  onSelect,
  testID,
}: SegmentedControlProps<K>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: theme.sunken, borderRadius: theme.radius.base }]}
    >
      {segments.map(({ key, label }) => {
        const active = key === selected;
        return (
          <Pressable
            key={key}
            testID={testID ? `${testID}-${key}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            hitSlop={SEGMENT_SLOP}
            onPress={() => onSelect(key)}
            style={[
              styles.segment,
              { borderRadius: theme.radius.sm },
              active && [
                styles.active,
                { backgroundColor: theme.background, shadowColor: theme.ink },
              ],
            ]}
          >
            <Text
              variant="subhead"
              color={active ? 'accentInk' : 'inkMuted'}
              weight={active ? 'semibold' : 'medium'}
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
  track: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A whisper of shadow, so the chosen tab sits above the track.
  active: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  label: { textAlign: 'center' },
});
