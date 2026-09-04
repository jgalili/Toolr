import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Input, Screen, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { emailSchema } from '@/schemas/forms';
import { useTheme } from '@/theme';

/**
 * Password reset.
 *
 * The response is identical whether or not the address has an account, so this
 * form cannot be used to enumerate who is registered.
 */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const session = useSession();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const valid = emailSchema.safeParse(email).success;

  if (sent) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xl }}>
          <Text variant="heading" center>
            {t('auth.forgotSent')}
          </Text>
          <Button label={t('common.done')} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('auth.forgotTitle')}</Text>
        <Text variant="body" tone="secondary">
          {t('auth.forgotBody')}
        </Text>

        <Input
          label={t('auth.emailLabel')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Button
          size="large"
          label={t('auth.sendResetLink')}
          disabled={!valid}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await session.requestPasswordReset(email.trim());
            setBusy(false);
            setSent(true);
          }}
        />
        <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
