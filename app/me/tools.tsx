import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { ToolCard } from '@/components/domain/ToolCard';
import { Button, Chip, EmptyState, Screen, Skeleton, Text } from '@/components/primitives';
import { useMyTools, useSetToolStatus } from '@/features/tools/hooks';
import { useToolLoans } from '@/features/transactions/hooks';
import { useTheme } from '@/theme';

export default function MyTools() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { data, isPending } = useMyTools();
  const setStatus = useSetToolStatus();
  const loanFor = useToolLoans((data ?? []).map((tool) => tool.id));

  if (isPending) {
    return (
      <Screen>
        <View style={{ gap: spacing.lg, paddingTop: spacing.xl }}>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height={84} radius={12} />
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <Text variant="title" style={{ marginBottom: spacing.md }}>
            {t('profile.myTools')}
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            title={t('empty.noListings')}
            body={t('empty.noListingsBody')}
            primaryAction={{ label: t('home.haveTool'), onPress: () => router.push('/list/camera') }}
          />
        }
        renderItem={({ item }) => {
          // While a tool is physically out, "Available now" is a button that
          // would lie: the listing comes back when the borrower does, and
          // offering the switch here only invites someone to double-lend.
          const out = item.status === 'borrowed';
          return (
            <View style={{ gap: spacing.xs }}>
              <ToolCard
                tool={item}
                loan={loanFor(item.id)}
                onPress={() => router.push(`/tool/${item.id}`)}
              />
              {out ? (
                <Text variant="caption" tone="muted">
                  {t('loan.notInSearch')}
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Chip
                    label={t('listing.availableNow')}
                    selected={item.status === 'active'}
                    onPress={() => setStatus.mutate({ id: item.id, status: 'active' })}
                  />
                  <Chip
                    label={t('inbox.pending')}
                    selected={item.status === 'paused'}
                    onPress={() => setStatus.mutate({ id: item.id, status: 'paused' })}
                  />
                </View>
              )}
            </View>
          );
        }}
      />
      <View style={{ padding: spacing.lg }}>
        <Button label={t('home.haveTool')} onPress={() => router.push('/list/camera')} />
      </View>
    </Screen>
  );
}
