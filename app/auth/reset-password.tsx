import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Input, Screen, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { newPasswordSchema } from '@/schemas/forms';
import { useTheme } from '@/theme';

/** Reached by deep link from the reset email (nailedit://auth/reset-password). */
export default function ResetPassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const session = useSession();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = newPasswordSchema.safeParse({ password, confirm });

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('auth.forgotTitle')}</Text>

        <Input
          label={t('auth.newPassword')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <Input
          label={t('auth.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          error={
            error ??
            (confirm.length > 0 && password !== confirm ? t('auth.passwordsDontMatch') : null)
          }
        />

        <Button
          size="large"
          label={t('auth.updatePassword')}
          disabled={!parsed.success}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            const result = await session.updatePassword(password);
            setBusy(false);
            if (result.ok) router.replace('/(tabs)');
            else setError(t(result.error === 'weak_password' ? 'auth.passwordWeak' : 'errors.genericBody'));
          }}
        />
      </View>
    </Screen>
  );
}
