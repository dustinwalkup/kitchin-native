import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY } from '../constants';

// What the library and the picker show in place of meals (§3.8, §3.10). The layout repeats the
// grocery and meals states rather than importing across features (N30).

// Uneven widths, so the placeholder reads as a list of meals with tags.
const ROWS = [
  { name: '58%', tags: [56, 84] },
  { name: '72%', tags: [64] },
  { name: '44%', tags: [72, 52, 60] },
  { name: '64%', tags: [] },
  { name: '50%', tags: [80, 56] },
] as const;

/**
 * Placeholder meal cards for the first load (R40.8). Skeleton stays still under Reduce Motion
 * (N14). The blocks are hidden from VoiceOver, which reads "Loading meals" instead.
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
        <Card key={name} style={styles.skeletonCard}>
          <Skeleton width={name} height={18} />
          {tags.length === 0 ? null : (
            <View style={styles.skeletonTags}>
              {tags.map((width, i) => (
                <Skeleton key={i} width={width} height={18} radius={9} />
              ))}
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}

/** Loading failed with nothing loaded yet (R40.10). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <LibraryMessage testID="library-load-error" icon="alert-circle-outline" title={COPY.loadError}>
      <Button label="Retry" tone="accent" onPress={onRetry} />
    </LibraryMessage>
  );
}

/** Offline before the first load: the fetch waits for the connection (R13.1). */
export function WaitingForConnection() {
  return (
    <LibraryMessage
      testID="library-waiting-for-connection"
      icon="wifi-off"
      title="Waiting for connection…"
    />
  );
}

/**
 * The household has no meals (R40.9, R45.12). The action is Add meal in the library and "+ Add new
 * meal" in the picker.
 */
export function EmptyLibrary({
  actionLabel,
  onAction,
}: {
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <LibraryMessage
      testID="library-empty"
      icon="book-open-variant"
      title={COPY.emptyTitle}
      description={COPY.emptyBody}
    >
      <Button label={actionLabel} tone="accent" onPress={onAction} />
    </LibraryMessage>
  );
}

/**
 * Meals exist, but none matches the search and tags (R41.8). It sits just below the search and
 * filter, where the keyboard can't hide it, with its own icon and an outlined button, so it can't
 * be mistaken for the empty library.
 */
export function NoMatch({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <LibraryMessage
      testID="library-no-match"
      icon="magnify-close"
      title={COPY.noMatch}
      fill={false}
    >
      <Button
        label={COPY.clearFilters}
        variant="secondary"
        tone="accent"
        onPress={onClearFilters}
      />
    </LibraryMessage>
  );
}

/**
 * The meal form was opened for a meal the loaded library doesn't hold, such as one deleted on the
 * other phone (§3.9). Close is the only way on.
 */
export function MissingMeal({ onClose }: { onClose: () => void }) {
  return (
    <LibraryMessage
      testID="meal-form-missing"
      icon="book-remove-outline"
      title="This meal isn't in the library any more"
    >
      <Button label="Close" tone="accent" onPress={onClose} />
    </LibraryMessage>
  );
}

function LibraryMessage({
  testID,
  icon,
  title,
  description,
  fill = true,
  children,
}: {
  testID: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  description?: string;
  /** Centred in the space below, or placed straight after what's above it. */
  fill?: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View testID={testID} style={[styles.message, fill && styles.fill]}>
      <MaterialCommunityIcons
        name={icon}
        size={48}
        color={theme.inkMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text variant="headline" accessibilityRole="header" style={styles.centred}>
        {title}
      </Text>
      {description ? (
        <Text variant="subhead" color="inkMuted" style={styles.centred}>
          {description}
        </Text>
      ) : null}
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: 12 },
  skeletonCard: { gap: 10, paddingVertical: 14 },
  skeletonTags: { flexDirection: 'row', gap: 6 },
  message: { alignItems: 'center', gap: 8, padding: 32 },
  fill: { flex: 1, justifyContent: 'center' },
  centred: { textAlign: 'center' },
  action: { marginTop: 8 },
});
