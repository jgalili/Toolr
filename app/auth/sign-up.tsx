import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Input, Screen, Text } from '@/components/primitives';
import { useSession, type AuthError } from '@/features/auth/session';
import { signUpSchema } from '@/schemas/forms';
import { useTheme } from '@/theme';

const ERROR_KEY: Record<AuthError, string> = {
  invalid_credentials: 'auth.invalidCredentials',
  email_in_use: 'auth.emailInUse',
  email_not_confirmed: 'auth.emailNotConfirmed',
  too_many_attempts: 'auth.tooManyAttempts',
  weak_password: 'auth.passwordWeak',
  cancelled: 'errors.genericBody',
  unknown: 'errors.genericBody',
};

/** A rough strength hint. It advises; it never blocks. */
function strength(password: string): 'weak' | 'fair' | 'good' | 'strong' {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  if (/\d/.test(password) && /[a-zA-Z]/.test(password)) score += 1;
  return (['weak', 'fair', 'good', 'strong'] as const)[Math.min(score, 3)]!;
}

export default function SignUp() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const session = useSession();

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = signUpSchema.safeParse({ firstName, email, password });

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await session.signUpWithPassword({ firstName: firstName.trim(), email: email.trim(), password });
    setBusy(false);

    if (!result.ok) {
      setError(t(ERROR_KEY[result.error]));
      return;
    }
    if (result.needsConfirmation) {
      router.replace({ pathname: '/auth/check-email', params: { email: email.trim() } });
    } else {
      router.back();
    }
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('auth.signUp')}</Text>

        {session.googleAvailable ? (
          <Button
            label={t('auth.continueWithGoogle')}
            onPress={async () => {
              const result = await session.signInWithGoogle();
              if (result.ok) router.back();
            }}
          />
        ) : null}

        <Input
          label={t('auth.firstNameLabel')}
          help={t('auth.firstNameHelp')}
          value={firstName}
          onChangeText={setFirstName}
          autoComplete="given-name"
        />
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
          autoComplete="new-password"
          help={
            password.length > 0
              ? t(`auth.passwordStrength.${strength(password)}`)
              : t('auth.passwordTooShort')
          }
          error={error}
        />

        <Button
          size="large"
          label={t('auth.signUp')}
          disabled={!parsed.success}
          loading={busy}
          onPress={submit}
        />

        <Button
          label={`${t('auth.haveAccount')} ${t('auth.signIn')}`}
          variant="ghost"
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}
