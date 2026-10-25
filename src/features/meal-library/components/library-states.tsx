import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Skeleton } from '@/ui/skeleton';

import { COPY } from '../constants';

// What the library and the picker show in place of meals (§3.8, §3.10).

// Uneven widths, so the placeholder reads as a list of meals with tags.
const ROWS = [
  { name: '58%', tags: [56, 84] },
  { name: '72%', tags: [64] },
  { name: '44%', tags: [72, 52] },
  { name: '64%', tags: [] },
  { name: '50%', tags: [80, 56] },
] as const;

/**
 * Placeholder meal rows for the first load (R40.8): a photo, a name and a few pills each.
 * Skeleton stays still under Reduce Motion (N14). The blocks are hidden from VoiceOver, which reads
 * "Loading meals" instead.
 */
export function SkeletonRows() {
  return (
    <View
      testID="library-skeleton"
      accessible
      accessibilityLabel="Loading meals"
      style={styles.skeleton}
    >
      {ROWS.map(({ name, tags }) => (
        <View key={name} style={styles.skeletonRow}>
          <Skeleton width={56} height={56} radius={12} />
          <View style={styles.skeletonBody}>
            <Skeleton width={name} height={18} />
            {tags.length === 0 ? null : (
              <View style={styles.skeletonTags}>
                {tags.map((width, i) => (
                  <Skeleton key={i} width={width} height={18} radius={9} />
                ))}
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Loading failed with nothing loaded yet (R40.10). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      testID="library-load-error"
      symbol="exclamationmark.triangle"
      title={COPY.loadError}
    >
      <Button label="Retry" onPress={onRetry} />
    </EmptyState>
  );
}

/** Offline before the first load: the fetch waits for the connection (R13.1). */
export function WaitingForConnection() {
  return (
    <EmptyState
      testID="library-waiting-for-connection"
      symbol="wifi.slash"
      title="Waiting for connection…"
    />
  );
}

/**
 * The household has no meals (R40.9, R45.12). The action is Add meal in the library and New meal
 * in the picker.
 */
export function EmptyLibrary({
  actionLabel,
  onAction,
}: {
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <EmptyState
      testID="library-empty"
      emoji="🍲"
      title={COPY.emptyTitle}
      description={COPY.emptyBody}
    >
      <Button label={actionLabel} onPress={onAction} />
    </EmptyState>
  );
}

/**
 * Meals exist, but none matches the search, type and tags (R41.8). It sits just below the search
 * and filters, where the keyboard can't hide it, with its own glyph and a quieter button, so it can't
 * be mistaken for the empty library.
 */
export function NoMatch({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <EmptyState
      testID="library-no-match"
      symbol="magnifyingglass"
      title={COPY.noMatch}
      description={COPY.noMatchBody}
      fill={false}
    >
      <Button label={COPY.clearFilters} variant="secondary" size="small" onPress={onClearFilters} />
    </EmptyState>
  );
}

/**
 * The meal form was opened for a meal the loaded library doesn't hold, such as one deleted on the
 * other phone (§3.9). Close is the only way on.
 */
export function MissingMeal({ onClose }: { onClose: () => void }) {
  return (
    <EmptyState
      testID="meal-form-missing"
      symbol="book.closed"
      title="This meal isn't in the library any more"
    >
      <Button label="Close" onPress={onClose} />
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: 4, paddingTop: 8 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  skeletonBody: { flex: 1, gap: 8 },
  skeletonTags: { flexDirection: 'row', gap: 6 },
});
