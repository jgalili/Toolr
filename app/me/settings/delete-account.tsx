import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Input, Screen, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/**
 * Account deletion.
 *
 * Play requires an in-app path AND a public web path. The copy is explicit
 * about what survives and why: the counterparty's transaction history stays,
 * anonymised, because one person deleting their account must not silently
 * rewrite someone else's record.
 */
export default function DeleteAccount() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const session = useSession();

  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const word = t('settings.deleteConfirmWord');
  const canDelete = confirmation.trim().toUpperCase() === word;

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.xl }}>
        <Text variant="title">{t('settings.deleteTitle')}</Text>
        <Text variant="bodyLarge" tone="secondary">
          {t('settings.deleteBody')}
        </Text>
        <Text variant="body" tone="muted">
          {t('settings.deleteGrace')}
        </Text>

        <Input
          label={t('settings.deleteConfirmPrompt')}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
        />

        <Button
          label={t('settings.deleteAccount')}
          variant="destructive"
          disabled={!canDelete}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api.deleteAccount();
              await session.signOut();
              router.replace('/(tabs)');
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
