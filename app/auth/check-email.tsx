import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { Button, Screen, Text } from '@/components/primitives';
import { useTheme } from '@/theme';

const RESEND_SECONDS = 60;

export default function CheckEmail() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  // A visible countdown rather than a silent rate-limit failure.
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xl }}>
        <Text variant="title" center>
          {t('auth.checkEmailTitle')}
        </Text>
        <Text variant="bodyLarge" tone="secondary" center>
          {t('auth.checkEmailBody', { email: email ?? '' })}
        </Text>

        <View style={{ gap: spacing.md }}>
          <Button label={t('auth.openMail')} onPress={() => void Linking.openURL('mailto:')} />
          <Button
            label={seconds > 0 ? t('auth.resendIn', { seconds }) : t('auth.resend')}
            variant="secondary"
            disabled={seconds > 0}
            onPress={() => setSeconds(RESEND_SECONDS)}
          />
          <Button
            label={t('auth.useDifferentEmail')}
            variant="ghost"
            onPress={() => router.replace('/auth/sign-up')}
          />
        </View>
      </View>
    </Screen>
  );
}
