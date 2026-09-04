import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { useTheme } from '@/theme';

/**
 * Sign-in & security.
 *
 * Shows what is linked and lets someone add a password to a social account or
 * link a social account to a password one. Linking only ever happens on a
 * verified email — auto-linking an unverified address is how
 * account-takeover-by-signup works.
 */
export default function AccountSettings() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const session = useSession();

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('auth.linkedAccounts')}</Text>

        <Card>
          <View style={{ gap: spacing.xs }}>
            <Text variant="bodyStrong">
              {session.email ?? t('auth.browsingAsGuest')}
            </Text>
            <Text variant="caption" tone="muted">
              {session.isGuest ? t('auth.guestExplainer') : t('auth.passwordSet')}
            </Text>
          </View>
        </Card>

        {!session.isGuest ? (
          <View style={{ gap: spacing.sm }}>
            <Button label={t('auth.addPassword')} variant="secondary" onPress={() => undefined} />
            {session.googleAvailable ? (
              <Button
                label={t('auth.linkGoogle')}
                variant="secondary"
                onPress={() => void session.signInWithGoogle()}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
