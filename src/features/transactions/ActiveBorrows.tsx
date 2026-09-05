import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Icon } from '@/components/domain/Icon';
import { LoanBadge } from '@/components/domain/ToolCard';
import { Button, Card, Text } from '@/components/primitives';
import { currentLocale } from '@/i18n';
import { useTheme } from '@/theme';
import type { Transaction } from '@/types/domain';

import { useConfirmPickup, useConfirmReturn, useTransactions } from './hooks';
import { isLiveLoan, loanLine, nextAction } from './loanState';

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

/** Soonest deadline first — the thing due tonight is the thing you care about. */
function byDue(a: Transaction, b: Transaction): number {
  return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
}

function Row({ tx }: { tx: Transaction }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const confirmPickup = useConfirmPickup();
  const confirmReturn = useConfirmReturn();

  const borrowing = tx.viewerRole === 'borrower';
  const line = loanLine(tx, currentLocale());
  const step = nextAction(tx);

  // One next step, and it is the same decision everywhere in the app — the
  // screen only has to say where the tap goes.
  const onPress = () => {
    if (!step) return;
    if (step.action === 'pickup') return void confirmPickup.mutate(tx.id);
    if (step.action === 'confirmReturn') return void confirmReturn.mutate(tx.id);
    if (step.action === 'return') return router.push(`/transaction/${tx.id}/return`);
    return router.push(`/transaction/${tx.id}/rate`);
  };

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
            {tx.toolTitle}
          </Text>
        </View>

        <LoanBadge line={line} />

        {step ? (
          <Button
            label={t(step.key)}
            variant="secondary"
            size="small"
            loading={confirmPickup.isPending || confirmReturn.isPending}
            onPress={onPress}
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

  const live = (data ?? []).filter(isLiveLoan).sort(byDue);
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
