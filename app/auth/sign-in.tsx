import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Input, Screen, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { useTheme } from '@/theme';

/**
 * A full sign-in screen exists for deep links and for Settings, but it is not
 * the normal path — in the app itself the wall is the sheet in AuthSheet.tsx,
 * which keeps the person on the screen they were already using.
 */
export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const session = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('auth.signIn')}</Text>

        {session.googleAvailable ? (
          <Button
            label={t('auth.continueWithGoogle')}
            onPress={async () => {
              const result = await session.signInWithGoogle();
              if (result.ok) router.replace('/(tabs)');
            }}
          />
        ) : null}

        <Input
          label={t('auth.emailLabel')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Input
          label={t('auth.passwordLabel')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          error={error}
        />

        <Button
          size="large"
          label={t('auth.signIn')}
          loading={busy}
          disabled={!email || !password}
          onPress={async () => {
            setBusy(true);
            setError(null);
            const result = await session.signInWithPassword(email.trim(), password);
            setBusy(false);
            if (result.ok) router.replace('/(tabs)');
            else setError(t('auth.invalidCredentials'));
          }}
        />

        <Button
          label={t('auth.forgotPassword')}
          variant="ghost"
          onPress={() => router.push('/auth/forgot-password')}
        />
        <Button
          label={`${t('auth.noAccount')} ${t('auth.signUp')}`}
          variant="ghost"
          onPress={() => router.push('/auth/sign-up')}
        />
      </View>
    </Screen>
  );
}
