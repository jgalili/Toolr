import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { Card, EmptyState, Screen, SegmentedControl, Text } from '@/components/primitives';
import { useTransactions } from '@/features/transactions/hooks';
import { currentLocale } from '@/i18n';
import { formatDayTime } from '@/lib/format';
import { useTheme } from '@/theme';
import type { Transaction } from '@/types/domain';

/**
 * Everything you have borrowed or lent.
 *
 * Previously one mixed list with the side written in small grey text, which
 * made "am I holding this, or is someone holding mine?" a reading exercise —
 * and Me → Borrowing and Me → Lending both landed here, on the same
 * undifferentiated pile. They are different questions with different anxieties,
 * so they are now different tabs, and the tab you asked for is the tab you get.
 */

const LIVE: Transaction['status'][] = ['agreed', 'picked_up', 'returned'];

function statusKey(status: Transaction['status']): string {
  if (status === 'picked_up') return 'pickedUp';
  if (status === 'agreed') return 'accepted';
  return status;
}

export default function Activity() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const { data } = useTransactions();
  const params = useLocalSearchParams<{ role?: string }>();

  const [role, setRole] = useState<'borrower' | 'owner'>(
    params.role === 'owner' ? 'owner' : 'borrower',
  );

  const rows = (data ?? [])
    .filter((tx) => tx.viewerRole === role)
    // Live borrows first, soonest deadline at the top; finished ones below.
    .sort((a, b) => {
      const aLive = LIVE.includes(a.status);
      const bLive = LIVE.includes(b.status);
      if (aLive !== bLive) return aLive ? -1 : 1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

  return (
    <Screen padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Text variant="title">{t('transaction.title')}</Text>
            <SegmentedControl
              segments={[
                { value: 'borrower', label: t('profile.borrowing') },
                { value: 'owner', label: t('profile.lending') },
              ]}
              value={role}
              onChange={setRole}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={role === 'borrower' ? t('empty.noBorrowing') : t('empty.noLending')}
          />
        }
        renderItem={({ item }) => {
          const overdue = LIVE.includes(item.status) && new Date(item.dueAt).getTime() < Date.now();
          return (
            <Card
              onPress={() => router.push(`/transaction/${item.id}`)}
              accessibilityLabel={item.toolTitle}
            >
              <View style={{ gap: 2 }}>
                <Text variant="bodyStrong">{item.toolTitle}</Text>
                <Text variant="caption" tone="muted">
                  {role === 'borrower'
                    ? t('home.youHave', {
                        tool: item.toolTitle,
                        name: item.counterparty.firstName,
                      })
                    : t('home.theyHave', {
                        tool: item.toolTitle,
                        name: item.counterparty.firstName,
                      })}
                  {' · '}
                  {t(`transaction.steps.${statusKey(item.status)}`, {
                    defaultValue: item.status,
                  })}
                </Text>
                <Text
                  variant="caption"
                  style={{ color: overdue ? colors.danger : colors.textMuted }}
                >
                  {overdue
                    ? t('home.wasDue', { when: formatDayTime(item.dueAt, currentLocale()) })
                    : t('transaction.dueBack', {
                        when: formatDayTime(item.dueAt, currentLocale()),
                      })}
                </Text>
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
