import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { Screen, Text } from '@/components/primitives';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * OAuth landing route.
 *
 * On native, `WebBrowser.openAuthSessionAsync` intercepts the redirect and
 * hands it straight back to the caller, so this screen is rarely seen. On web
 * the redirect really does navigate here, carrying `?code=…`, and supabase-js
 * (pkce + `detectSessionInUrl`) exchanges it for a session as it loads.
 *
 * That exchange is a network round trip. The previous version waited a flat
 * 400 ms and then left — which raced the exchange, and when it lost you landed
 * back on the tabs still signed out, with no clue why. So: wait for the
 * session, with a ceiling, and leave either way.
 */
const TIMEOUT_MS = 8000;

export default function AuthCallback() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();

  useEffect(() => {
    let done = false;
    const leave = () => {
      if (done) return;
      done = true;
      router.replace('/(tabs)');
    };

    if (!supabase) {
      const timer = setTimeout(leave, 400);
      return () => clearTimeout(timer);
    }

    // Either the session is already in place, or it arrives when the code
    // exchange finishes. Listen for both.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) leave();
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) leave();
    });

    // Don't strand anyone on a spinner if the exchange fails outright.
    const timer = setTimeout(leave, TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
        <ActivityIndicator color={colors.accent} />
        <Text variant="body" tone="muted">
          {t('common.loading')}
        </Text>
      </View>
    </Screen>
  );
}
