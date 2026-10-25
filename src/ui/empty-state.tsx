import { type SFSymbol, SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from './use-theme';

export interface EmptyStateProps {
  /** Static, never household text (R26.7). */
  testID: string;
  /** An emoji in a soft circle, or an SF Symbol. */
  emoji?: string;
  symbol?: SFSymbol;
  title: string;
  description?: string;
  /** The way on, such as a button. */
  children?: ReactNode;
  /** Centred in the space below, or placed straight after what's above it. */
  fill?: boolean;
}

/**
 * What a list shows when it has nothing to draw: loading failed, waiting for the connection, or no
 * content yet. One element for each part, so VoiceOver reads the title as a header and the action as
 * a button (N10). The groceries, meals and library states all draw through it.
 */
export function EmptyState({
  testID,
  emoji,
  symbol,
  title,
  description,
  children,
  fill = true,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View testID={testID} style={[styles.message, fill && styles.fill]}>
      {emoji || symbol ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.badge, { backgroundColor: theme.accentSoft }]}
        >
          {emoji ? (
            <Text style={styles.emoji}>{emoji}</Text>
          ) : (
            <SymbolView name={symbol!} tintColor={theme.accent} size={28} />
          )}
        </View>
      ) : null}
      <Text variant="headline" accessibilityRole="header" style={styles.centred}>
        {title}
      </Text>
      {description ? (
        <Text variant="subhead" color="inkMuted" style={[styles.centred, styles.description]}>
          {description}
        </Text>
      ) : null}
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { alignItems: 'center', gap: 6, paddingHorizontal: 32, paddingVertical: 40 },
  fill: { flex: 1, justifyContent: 'center' },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emoji: { fontSize: 30, lineHeight: 36 },
  centred: { textAlign: 'center' },
  description: { maxWidth: 300 },
  action: { marginTop: 14 },
});
