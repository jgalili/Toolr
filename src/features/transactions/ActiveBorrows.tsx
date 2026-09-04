import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Icon } from '@/components/domain/Icon';
import { Button, Card, Text } from '@/components/primitives';
import { currentLocale } from '@/i18n';
import { formatDayTime } from '@/lib/format';
import { useTheme } from '@/theme';
import type { Transaction } from '@/types/domain';

import { useConfirmPickup, useTransactions } from './hooks';

/**
 * What is out right now.
 *
 * The borrow loop was reachable — Me → Borrowing → Activity → tap → "I picked
 * it up" — and nobody found it, which for a screen that answers "when do I
 * have to give this back?" is the same as it not existing. A tool you are
 * holding is the most time-sensitive thing in the app; it belongs at the top
 * of the first screen, not four taps into a list called "Activity".
 *
 * So this is the state *and* the control: the due time is on the card, and the
 * one action that moves it forward is a button on the card rather than
 * somewhere you have to navigate to find.
 */

function isLive(tx: Transaction): boolean {
  return tx.status === 'agreed' || tx.status === 'picked_up' || tx.status === 'returned';
}

/** Soonest deadline first — the thing due tonight is the thing you care about. */
function byDue(a: Transaction, b: Transaction): number {
  return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
}

function Row({ tx }: { tx: Transaction }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const confirmPickup = useConfirmPickup();

  const borrowing = tx.viewerRole === 'borrower';
  const overdue = new Date(tx.dueAt).getTime() < Date.now();

  // One next step per state, named as the thing you are about to do.
  const action = (() => {
    if (tx.status === 'agreed' && borrowing) {
      return {
        label: t('transaction.iPickedItUp'),
        loading: confirmPickup.isPending,
        onPress: () => confirmPickup.mutate(tx.id),
      };
    }
    if (tx.status === 'picked_up') {
      return {
        label: t('transaction.markReturned'),
        loading: false,
        onPress: () => router.push(`/transaction/${tx.id}/return`),
      };
    }
    if (tx.status === 'returned' && !tx.hasRated) {
      return {
        label: t('rating.title'),
        loading: false,
        onPress: () => router.push(`/transaction/${tx.id}/rate`),
      };
    }
    return null;
  })();

  return (
    <Card onPress={() => router.push(`/transaction/${tx.id}`)} accessibilityLabel={tx.toolTitle}>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon
            name={borrowing ? 'clock' : 'tag'}
            color={borrowing ? colors.accent : colors.offer}
            size={18}
          />
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {borrowing
              ? t('home.youHave', { tool: tx.toolTitle, name: tx.counterparty.firstName })
              : t('home.theyHave', { tool: tx.toolTitle, name: tx.counterparty.firstName })}
          </Text>
        </View>

        <Text variant="caption" tone={overdue ? 'danger' : 'muted'}>
          {overdue
            ? t('home.wasDue', { when: formatDayTime(tx.dueAt, currentLocale()) })
            : t('transaction.dueBack', { when: formatDayTime(tx.dueAt, currentLocale()) })}
        </Text>

        {action ? (
          <Button
            label={action.label}
            variant="secondary"
            size="small"
            loading={action.loading}
            onPress={action.onPress}
          />
        ) : null}
      </View>
    </Card>
  );
}

export function ActiveBorrows() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { data } = useTransactions();

  const live = (data ?? []).filter(isLive).sort(byDue);
  if (live.length === 0) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="heading" style={{ fontSize: 21 }}>
        {t('home.outRightNow')}
      </Text>
      <View style={{ gap: spacing.sm }}>
        {live.slice(0, 4).map((tx) => (
          <Row key={tx.id} tx={tx} />
        ))}
      </View>
    </View>
  );
}
