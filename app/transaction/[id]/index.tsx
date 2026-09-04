import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { OwnerCard } from '@/components/domain/OwnerCard';
import { Button, Card, ErrorState, Screen, Skeleton, Text } from '@/components/primitives';
import { useConfirmPickup, useTransaction } from '@/features/transactions/hooks';
import { currentLocale } from '@/i18n';
import { formatDayTime, formatMoney } from '@/lib/format';
import { useTheme } from '@/theme';
import type { TransactionStatus } from '@/types/domain';

const STEPS: { key: string; reached: TransactionStatus[] }[] = [
  { key: 'requested', reached: ['agreed', 'picked_up', 'returned', 'completed'] },
  { key: 'accepted', reached: ['agreed', 'picked_up', 'returned', 'completed'] },
  { key: 'pickedUp', reached: ['picked_up', 'returned', 'completed'] },
  { key: 'returned', reached: ['returned', 'completed'] },
  { key: 'rated', reached: ['completed'] },
];

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();

  const { data: tx, isPending, error, refetch } = useTransaction(id);
  const confirmPickup = useConfirmPickup();

  if (isPending) {
    return (
      <Screen scroll>
        <View style={{ gap: spacing.lg, paddingTop: spacing.xl }}>
          <Skeleton height={28} width="60%" />
          <Skeleton height={120} radius={radius.lg} />
          <Skeleton height={80} radius={radius.lg} />
        </View>
      </Screen>
    );
  }

  if (error || !tx) {
    return (
      <Screen>
        <ErrorState title={t('errors.notFound')} retryLabel={t('common.retry')} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xl, gap: spacing.xl }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="title">{tx.toolTitle}</Text>
          <Text variant="body" tone="muted">
            {t('transaction.dueBack', { when: formatDayTime(tx.dueAt, currentLocale()) })}
          </Text>
          {tx.agreedTotalAgorot ? (
            <Text variant="bodyStrong">
              {formatMoney(tx.agreedTotalAgorot, tx.currency, currentLocale())} ·{' '}
              {t('tool.paidDirectly')}
            </Text>
          ) : null}
        </View>

        {/* Status timeline. Numbered because the order carries real
            information — you cannot return something you never picked up. */}
        <Card>
          <View style={{ gap: spacing.md }}>
            {STEPS.map((step, index) => {
              const done = step.reached.includes(tx.status);
              return (
                <View
                  key={step.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: done ? colors.accent : colors.surfaceSunken,
                    }}
                  >
                    <Text variant="caption" tone={done ? 'onAccent' : 'muted'}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text variant="body" tone={done ? 'default' : 'muted'}>
                    {t(`transaction.steps.${step.key}`)}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        <OwnerCard
          profile={{
            id: tx.counterparty.id,
            firstName: tx.counterparty.firstName,
            avatarUrl: tx.counterparty.avatarUrl,
            neighbourhood: null,
            rating: tx.counterparty.rating ?? null,
            ratingCount: 0,
            completedExchanges: 0,
            verificationLevel: 'none',
            memberSince: new Date().toISOString(),
          }}
          onPress={() => router.push(`/profile/${tx.counterparty.id}`)}
        />

        <View style={{ gap: spacing.md }}>
          {tx.conversationId ? (
            <Button
              label={t('inbox.message')}
              variant="secondary"
              onPress={() => router.push(`/chat/${tx.conversationId}`)}
            />
          ) : null}

          {tx.status === 'agreed' ? (
            <>
              <Button
                size="large"
                label={t('transaction.pickupTitle')}
                onPress={() => router.push(`/transaction/${tx.id}/pickup`)}
              />
              {tx.viewerRole === 'borrower' ? (
                <Button
                  label={t('transaction.iPickedItUp')}
                  variant="secondary"
                  loading={confirmPickup.isPending}
                  onPress={() => confirmPickup.mutate(tx.id)}
                />
              ) : null}
            </>
          ) : null}

          {tx.status === 'picked_up' || tx.status === 'returned' ? (
            <Button
              size="large"
              label={t('transaction.steps.returned')}
              onPress={() => router.push(`/transaction/${tx.id}/return`)}
            />
          ) : null}

          {tx.status === 'returned' && !tx.hasRated ? (
            <Button
              size="large"
              label={t('rating.title')}
              onPress={() => router.push(`/transaction/${tx.id}/rate`)}
            />
          ) : null}

          <Button
            label={t('transaction.reportIssue')}
            variant="ghost"
            onPress={() => router.push(`/transaction/${tx.id}/issue`)}
          />
        </View>
      </View>
    </Screen>
  );
}
