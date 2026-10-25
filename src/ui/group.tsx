import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface GroupProps {
  children: ReactNode;
  /** A small-caps heading above the group, such as "Account". */
  title?: string;
  /** Helper text below the group. */
  footer?: string;
  /** Where the dividers start, so they line up under the rows' text rather than their icons. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Rows on one white surface with hairline dividers between them, iOS's inset grouped list
 * (specs/redesign/design.md DD-R2). Settings, the week start and the theme preview use it.
 */
export function Group({ children, title, footer, inset = 16, style }: GroupProps) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={[styles.section, style]}>
      {title ? <SectionHeader title={title} /> : null}
      <View
        style={[
          styles.group,
          { backgroundColor: theme.background, borderRadius: theme.radius.card },
        ]}
      >
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <Divider inset={inset} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" color="inkMuted" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** A hairline between rows, starting `inset` points in. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.divider, { marginLeft: inset, backgroundColor: theme.border }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** A small-caps heading for a run of content, read by VoiceOver as a header (N10). */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text variant="eyebrow" color="inkMuted" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  group: { overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
  },
  title: { flexShrink: 1 },
  footer: { paddingHorizontal: 4 },
});
