import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/use-theme';

// Toast text stays on the device. Never log it or send it to Sentry (§3.9).

export interface ToastOptions {
  message: string;
  /** For example Retry (R12.2). Pressing it also dismisses the toast. */
  action?: { label: string; onPress: () => void };
}

export interface ToastApi {
  show: (options: ToastOptions) => void;
}

export const TOAST_MS = 4000;
/** A toast with an action stays up longer, so there's time to reach the action. */
export const TOAST_WITH_ACTION_MS = 8000;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; options: ToastOptions } | null>(null);

  const show = useCallback((options: ToastOptions) => {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, options }));
    AccessibilityInfo.announceForAccessibility(options.message);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.options.action ? TOAST_WITH_ACTION_MS : TOAST_MS,
    );
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={api}>
      <View style={styles.root}>
        {children}
        {toast ? (
          <Toast key={toast.id} options={toast.options} onDismiss={() => setToast(null)} />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

function Toast({ options, onDismiss }: { options: ToastOptions; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { action } = options;

  return (
    // 56 pt above the safe area clears the tab bar.
    <View
      style={[
        styles.toast,
        { bottom: insets.bottom + 56, backgroundColor: theme.ink, borderRadius: theme.radius.base },
      ]}
    >
      <Text variant="subhead" color="onBrand" style={styles.message}>
        {options.message}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            onDismiss();
            action.onPress();
          }}
          style={styles.action}
        >
          <Text variant="subhead" color="onBrand" style={styles.actionLabel}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 4,
    minHeight: 52,
  },
  message: { flex: 1, paddingVertical: 8 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center' },
  actionLabel: { textDecorationLine: 'underline' },
});
