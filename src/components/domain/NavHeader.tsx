import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { backIcon } from '@/i18n/direction';
import { useTheme } from '@/theme';

import { AppHeader } from './AppHeader';

/**
 * The bar that every pushed screen wears.
 *
 * The root navigator runs with `headerShown: false` so screens can draw their
 * own brand header — which was fine for the handful that do, and left everyone
 * else with no way back at all. "I need a tool" was a one-way street: you got
 * there, and then the only exit was the OS back gesture, which does not exist
 * on web.
 *
 * So this is wired in at the navigator, not per screen: a back control that is
 * always present, the wordmark, and a way home. Screens that draw their own
 * header opt out in the layout rather than opting in one at a time — the
 * default is now "you can leave".
 */
export function NavHeader({ canGoBack }: { canGoBack?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.xs,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <AppHeader
        align="center"
        size={26}
        tagline={false}
        left={
          canGoBack
            ? { icon: backIcon(), label: t('common.back'), onPress: () => router.back() }
            : undefined
        }
        right={{
          icon: 'home',
          label: t('common.home'),
          onPress: () => router.navigate('/(tabs)'),
        }}
      />
    </View>
  );
}
