import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

/**
 * A small count, such as "4 left" or "2/3". `sage` is for what's still to do on a list; `neutral`
 * is quieter, for a count that's only information; `accent` marks something current, such as Today.
 */
export function CountBadge({
  label,
  tone = 'sage',
  accessibilityLabel,
}: {
  label: string;
  tone?: 'sage' | 'neutral' | 'accent';
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const colours = {
    sage: { bg: theme.sageSoft, fg: 'sageInk' },
    neutral: { bg: theme.sunken, fg: 'inkMuted' },
    accent: { bg: theme.accentSoft, fg: 'accentInk' },
  } as const;
  const { bg, fg } = colours[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="caption" color={fg} weight="semibold" accessibilityLabel={accessibilityLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
