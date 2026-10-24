import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

import { COPY } from '../constants';
import type { FormField } from '../domain';
import type { DeleteOutcome, SaveOutcome } from '../hooks';

/** A save or delete that failed, which the meal form shows until the next one starts (§3.9). */
export type FormProblem =
  | { kind: 'save'; outcome: Extract<SaveOutcome, { ok: false }> }
  | { kind: 'delete'; outcome: Extract<DeleteOutcome, { ok: false }> };

export interface ProblemCopy {
  message: string;
  /** What the form offers. None when repeating would fail the same way (R14.3, DD58). */
  action: 'retry' | 'saveAsNew' | null;
  /** The field whose value the database rejected, which shows `fieldRejected` (R42.10, DD58). */
  field: FormField | null;
}

/** What each failure says and offers: the §3.9 table, and the delete's row (R44.4). */
export function describeProblem(problem: FormProblem): ProblemCopy {
  const { outcome } = problem;
  switch (outcome.reason) {
    case 'offline': // R46.3
      return { message: COPY.offline, action: 'retry', field: null };
    case 'forbidden': // R14.3
      return { message: COPY.forbidden, action: null, field: null };
    case 'deleted': // R46.7
      return { message: COPY.deletedElsewhere, action: 'saveAsNew', field: null };
    case 'invalid': // the app checks the same rules first, so the app and database disagree
      return { message: COPY.saveError, action: null, field: outcome.field };
    case 'failed': // R42.10, R44.4
      return {
        message: problem.kind === 'save' ? COPY.saveError : COPY.deleteError,
        action: 'retry',
        field: null,
      };
  }
}

export interface FormErrorProps {
  message: string;
  action?: { label: string; onPress: () => void; disabled?: boolean } | null;
}

/**
 * Why a save or delete failed, at the top of the form. It stays until the member acts, which a
 * toast wouldn't (R42.10, DD60), and is announced when it appears.
 */
export function FormError({ message, action }: FormErrorProps) {
  const theme = useTheme();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View
      testID="meal-form-error"
      accessibilityLiveRegion="polite"
      style={[
        styles.box,
        {
          backgroundColor: theme.background,
          borderColor: theme.destructive,
          borderRadius: theme.radius.base,
        },
      ]}
    >
      <SymbolView
        name="exclamationmark.triangle.fill"
        tintColor={theme.destructive}
        size={17}
        style={styles.icon}
      />
      <Text variant="subhead" style={styles.message}>
        {message}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: action.disabled ?? false }}
          disabled={action.disabled}
          onPress={action.onPress}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          {/* Terracotta carries text only in bold (N13). */}
          <Text variant="subhead" color="accent" bold>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps at large text sizes, so the action moves below the message rather than clipping (N12).
  box: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    borderWidth: 1,
  },
  icon: { width: 17, height: 17 },
  message: { flex: 1, minWidth: 160, paddingVertical: 8 },
  action: {
    minHeight: 44,
    minWidth: 44,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
