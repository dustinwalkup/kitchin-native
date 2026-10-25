import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/ui/button';
import { Divider } from '@/ui/group';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import type { Progress } from '../domain';

export interface ProgressHeaderProps {
  progress: Progress;
  /** Whether checked items are hidden from the list (specs/redesign/design.md §4.1). */
  hideChecked: boolean;
  onHideCheckedChange: (hide: boolean) => void;
  /** How many checked items Uncheck all would reopen, from `planUncheckAll` (R10.7). */
  uncheckCount: number;
  /** Uncheck all and Clear checked. Each confirms first (R10.2, R10.8). */
  onUncheckAll: () => void;
  onClearChecked: () => void;
}

/** "2 of 8 items" (R4.7), or "All 8 items" once everything is checked. */
export function progressSummary({ checked, total }: Progress): string {
  if (total > 0 && checked === total) return `All ${total} ${total === 1 ? 'item' : 'items'}`;
  return `${checked} of ${total} ${total === 1 ? 'item' : 'items'}`;
}

/**
 * The shopping trip at a glance: how many are in the cart, the percentage and a slim sage bar
 * (R4.7), the switch that hides what's checked, and, once something is checked, Uncheck all and
 * Clear checked. One compact surface, so the list starts high on the screen. VoiceOver reads the
 * summary as one element. An empty list has no percentage (R4.8).
 */
export function ProgressHeader({
  progress,
  hideChecked,
  onHideCheckedChange,
  uncheckCount,
  onUncheckAll,
  onClearChecked,
}: ProgressHeaderProps) {
  const theme = useTheme();
  const { checked, total, percent } = progress;
  const summary = progressSummary(progress);

  return (
    <View
      style={[styles.panel, { backgroundColor: theme.background, borderRadius: theme.radius.card }]}
    >
      <View
        testID="progress-header"
        accessible
        accessibilityLabel={
          percent === null
            ? `${checked} of ${total} checked`
            : `${checked} of ${total} checked, ${percent}%`
        }
        style={styles.progress}
      >
        <View style={styles.row}>
          <Text variant="subhead" weight="medium">
            {summary}
          </Text>
          {percent === null ? null : (
            // Terracotta carries text only in bold (N13).
            <Text variant="subhead" color="accent" bold>
              {percent}%
            </Text>
          )}
        </View>
        {percent === null ? null : (
          <View style={[styles.track, { backgroundColor: theme.sunken }]}>
            <View
              testID="progress-fill"
              style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.sage }]}
            />
          </View>
        )}
      </View>
      <Divider />
      <View style={styles.toggle}>
        <Text variant="subhead" color="inkMuted" style={styles.toggleLabel}>
          Hide checked items
        </Text>
        <Switch
          testID="hide-checked"
          accessibilityLabel="Hide checked items"
          value={hideChecked}
          onValueChange={onHideCheckedChange}
          trackColor={{ true: theme.sage, false: theme.border }}
          ios_backgroundColor={theme.border}
          style={styles.switch}
        />
      </View>
      {checked > 0 ? (
        <>
          <Divider />
          {/* Apart, at either end, so the destructive Clear checked isn't a slip of the thumb away. */}
          <View style={styles.actions}>
            <Button
              testID="uncheck-all"
              label="Uncheck all"
              variant="text"
              size="small"
              disabled={uncheckCount === 0}
              onPress={onUncheckAll}
            />
            <Button
              testID="clear-checked"
              label="Clear checked"
              variant="text"
              size="small"
              destructive
              onPress={onClearChecked}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginTop: 4, marginBottom: 8, overflow: 'hidden' },
  progress: { gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 12,
  },
  toggleLabel: { flex: 1 },
  // The iOS switch is 51 × 31; scaled down it stays above 44 pt wide and sits quieter in the row.
  switch: { transform: [{ scale: 0.85 }] },
  // Wraps at large text sizes, so the two actions stack rather than clip (N12).
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
});
