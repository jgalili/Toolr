import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { LoanBadge } from '@/components/domain/ToolCard';
import { Card, EmptyState, Screen, SegmentedControl, Text } from '@/components/primitives';
import { useTransactions } from '@/features/transactions/hooks';
import { isLiveLoan, loanLine } from '@/features/transactions/loanState';
import { currentLocale } from '@/i18n';
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

export default function Activity() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { data } = useTransactions();
  const params = useLocalSearchParams<{ role?: string }>();

  const [role, setRole] = useState<'borrower' | 'owner'>(
    params.role === 'owner' ? 'owner' : 'borrower',
  );

  const rows = (data ?? [])
    .filter((tx) => tx.viewerRole === role)
    // Live borrows first, soonest deadline at the top; finished ones below.
    .sort((a, b) => {
      const aLive = isLiveLoan(a);
      const bLive = isLiveLoan(b);
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
        renderItem={({ item }) => (
          <Card
            onPress={() => router.push(`/transaction/${item.id}`)}
            accessibilityLabel={item.toolTitle}
          >
            <View style={{ gap: 4 }}>
              <Text variant="bodyStrong">{item.toolTitle}</Text>
              {isLiveLoan(item) ? (
                <LoanBadge line={loanLine(item, currentLocale())} />
              ) : (
                <Text variant="caption" tone="muted">
                  {t(`transaction.steps.${item.status === 'completed' ? 'rated' : 'returned'}`)}
                </Text>
              )}
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
