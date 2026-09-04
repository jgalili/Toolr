import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Input, Sheet, Text } from '@/components/primitives';
import { useTheme } from '@/theme';

import { useSession } from './session';

export type AuthReason =
  | { kind: 'borrow'; name: string; tool: string }
  | { kind: 'message' }
  | { kind: 'list' }
  | { kind: 'favourite' }
  | { kind: 'request' }
  | { kind: 'rate' }
  | { kind: 'default' };

type Translate = (key: string, options?: Record<string, unknown>) => string;

function headlineFor(reason: AuthReason, t: Translate): string {
  switch (reason.kind) {
    case 'borrow':
      return t('auth.reasonBorrow', { name: reason.name, tool: reason.tool });
    case 'message':
      return t('auth.reasonMessage');
    case 'list':
      return t('auth.reasonList');
    case 'favourite':
      return t('auth.reasonFavourite');
    case 'request':
      return t('auth.reasonRequest');
    case 'rate':
      return t('auth.reasonRate');
    default:
      return t('auth.reasonDefault');
  }
}

/**
 * The auth wall. A sheet, never a screen.
 *
 * Dismissing it must leave the person exactly where they were, still a guest,
 * with nothing lost — which is why it renders over the current route rather
 * than navigating away from it. The headline names the action, not the
 * ceremony: "Sign in to ask Yossi for the drill", not "Create an account".
 */
export function AuthSheet({
  visible,
  reason,
  onClose,
  onSignedIn,
}: {
  visible: boolean;
  reason: AuthReason;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const router = useRouter();
  const session = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Two error slots, deliberately. A failed Google sign-in has nothing to do
  // with the password field, and painting that field red for it sends the
  // person hunting for a password they never typed.
  const [error, setError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function withPassword() {
    setBusy(true);
    setError(null);
    setGoogleError(null);
    const result = await session.signInWithPassword(email.trim(), password);
    setBusy(false);
    if (result.ok) {
      onSignedIn();
      onClose();
    } else {
      setError(t(`auth.${result.error === 'invalid_credentials' ? 'invalidCredentials' : 'tooManyAttempts'}`));
    }
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    setGoogleError(null);
    const result = await session.signInWithGoogle();
    setBusy(false);
    if (result.ok) {
      onSignedIn();
      onClose();
      return;
    }
    // Closing the Google sheet is a decision, not a failure.
    if (result.error !== 'cancelled') {
      setGoogleError(
        __DEV__ && result.detail
          ? `${t('errors.genericBody')} (${result.detail})`
          : t('errors.genericBody'),
      );
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} testID="auth-sheet">
      <View style={{ gap: spacing.lg }}>
        <Text variant="title">{headlineFor(reason, t as unknown as Translate)}</Text>

        {session.googleAvailable ? (
          <View style={{ gap: spacing.xs }}>
            <Button label={t('auth.continueWithGoogle')} onPress={withGoogle} loading={busy} />
            {googleError ? (
              <Text variant="caption" tone="danger">
                {googleError}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text variant="caption" tone="muted">
            {t('common.orDivider')}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <Input
          label={t('auth.emailLabel')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
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
          label={t('auth.signIn')}
          onPress={withPassword}
          loading={busy}
          disabled={email.length === 0 || password.length === 0}
          variant="secondary"
        />

        <Button
          label={t('auth.forgotPassword')}
          variant="ghost"
          onPress={() => {
            onClose();
            router.push('/auth/forgot-password');
          }}
        />

        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text variant="caption" tone="muted">
            {t('auth.noAccount')}
          </Text>
          <Button
            label={t('auth.signUp')}
            variant="ghost"
            onPress={() => {
              onClose();
              router.push('/auth/sign-up');
            }}
          />
        </View>

        <Button label={t('auth.keepBrowsing')} variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}
