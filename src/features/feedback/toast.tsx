import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/primitives';
import { useTheme } from '@/theme';

/**
 * The app's one way of saying "that didn't work".
 *
 * Deliberately a single global surface rather than per-screen error text. The
 * failures that actually reached users came from mutations — accept, decline,
 * save, delete — and a mutation can be fired from a card in a list, a modal, or
 * a header button. Asking every one of those to grow its own error slot is how
 * you end up with the state this app was in, where most of them had none.
 *
 * A toast is not the right home for a *validation* message, which belongs next
 * to the field. It is the right home for "the server refused, and here is why".
 */

export type ToastTone = 'error' | 'success';

export type Toast = {
  message: string;
  tone?: ToastTone;
  /** Optional one-tap remedy, e.g. "Change the return time". */
  action?: { label: string; onPress: () => void };
};

type ToastApi = { show: (toast: Toast) => void };

const ToastContext = createContext<ToastApi | null>(null);

/**
 * A module-level escape hatch so code *outside* the React tree can raise a
 * toast — specifically the react-query MutationCache, which is created once at
 * module scope and is the only place that sees every failed mutation in the
 * app. Without this, surfacing errors would again be opt-in per call site, and
 * opt-in is what failed.
 */
let sink: ((toast: Toast) => void) | null = null;
export function pushToast(toast: Toast) {
  sink?.(toast);
}

const VISIBLE_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() =>
      setToast(null),
    );
  }, [opacity]);

  const show = useCallback(
    (next: Toast) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(next);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(dismiss, VISIBLE_MS);
    },
    [dismiss, opacity],
  );

  useEffect(() => {
    sink = show;
    return () => {
      if (sink === show) sink = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [show]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.xl,
            opacity,
          }}
        >
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="toast"
            style={{
              backgroundColor: toast.tone === 'success' ? colors.accent : colors.danger,
              borderRadius: radius.md,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              gap: spacing.sm,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Text variant="body" style={{ color: '#FFFFFF', flex: 1 }}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  dismiss();
                  toast.action?.onPress();
                }}
                hitSlop={8}
              >
                <Text variant="bodyStrong" style={{ color: '#FFFFFF', textDecorationLine: 'underline' }}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={dismiss} hitSlop={8}>
                <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                  ×
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  // A no-op rather than a throw: a missing provider should never be the reason
  // a screen crashes on top of whatever already went wrong.
  return api ?? { show: () => undefined };
}

/** Translate a describeError() result and show it. */
export function useErrorToast() {
  const { show } = useToast();
  const { t } = useTranslation();
  return useCallback(
    (key: string, action?: { label: string; onPress: () => void }) =>
      show({ message: t(`errors.${key}`, { defaultValue: t('errors.generic') }), tone: 'error', action }),
    [show, t],
  );
}
