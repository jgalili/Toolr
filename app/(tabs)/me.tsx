import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { UserAvatar } from '@/components/domain/UserAvatar';
import { Button, Card, Screen, Text } from '@/components/primitives';
import { chevron } from '@/i18n/direction';
import { useSession } from '@/features/auth/session';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { useFavorites, useMyTools } from '@/features/tools/hooks';
import { useTransactions } from '@/features/transactions/hooks';
import { IS_DEMO } from '@/lib/config';
import { useTheme } from '@/theme';

function Row({ label, count, onPress }: { label: string; count?: number; onPress: () => void }) {
  const { spacing } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <Text variant="bodyLarge">{label}</Text>
        <Text variant="body" tone="muted">
          {count != null ? count : chevron()}
        </Text>
      </View>
    </Card>
  );
}

export default function Me() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const session = useSession();
  const { requireMember } = useAuthGate();

  const myTools = useMyTools();
  const favorites = useFavorites();
  const transactions = useTransactions();

  const borrowing = (transactions.data ?? []).filter((tx) => tx.viewerRole === 'borrower').length;
  const lending = (transactions.data ?? []).filter((tx) => tx.viewerRole === 'owner').length;

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.xl }}>
        {/* A person is a name and a face, not an email address. The address
            is an account detail; it lives in Settings, where account details
            belong. */}
        <Pressable
          onPress={() =>
            session.isGuest
              ? requireMember({ kind: 'default' }, () => undefined)
              : router.push('/me/settings/profile')
          }
          accessibilityRole="button"
          accessibilityLabel={session.displayName ?? t('profile.title')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.lg,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <UserAvatar
            uri={session.avatarUrl}
            name={session.isGuest ? '?' : (session.displayName ?? '?')}
            size={64}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">
              {session.isGuest
                ? t('auth.browsingAsGuest')
                : (session.displayName ?? t('profile.title'))}
            </Text>
            <Text variant="caption" tone="muted">
              {session.isGuest ? t('auth.guestExplainer') : t('profile.editProfile')}
            </Text>
          </View>
        </Pressable>

        {session.isGuest ? (
          <Button
            size="large"
            label={t('auth.signIn')}
            onPress={() => requireMember({ kind: 'default' }, () => undefined)}
          />
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Row
            label={t('profile.myTools')}
            count={myTools.data?.length}
            onPress={() => requireMember({ kind: 'list' }, () => router.push('/me/tools'))}
          />
          {/* Same screen, but it opens on the side you asked for. */}
          <Row
            label={t('profile.borrowing')}
            count={borrowing}
            onPress={() => router.push('/me/activity?role=borrower')}
          />
          <Row
            label={t('profile.lending')}
            count={lending}
            onPress={() => router.push('/me/activity?role=owner')}
          />
          <Row
            label={t('profile.favorites')}
            count={favorites.data?.length}
            onPress={() => router.push('/me/favorites')}
          />
          <Row label={t('profile.settings')} onPress={() => router.push('/me/settings')} />
        </View>

        {IS_DEMO ? (
          <Text variant="caption" tone="muted">
            {t('common.demoBadge')} — data resets when the app restarts.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
