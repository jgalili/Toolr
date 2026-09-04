import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Input, Screen, Text } from '@/components/primitives';
import { useReportIssue, useTransaction } from '@/features/transactions/hooks';
import { useTheme } from '@/theme';

const REASONS = ['damaged', 'not_returned', 'not_as_described', 'other'] as const;
type Reason = (typeof REASONS)[number];

/**
 * Damage / dispute reporting.
 *
 * The MVP records and notifies; it does not adjudicate. The confirmation says
 * exactly that, because promising a resolution process we don't have is worse
 * than saying plainly what will happen.
 */
export default function ReportIssue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data: tx } = useTransaction(id);
  const report = useReportIssue();

  const [reason, setReason] = useState<Reason | null>(null);
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xl }}>
          <Text variant="heading" center>
            {t('transaction.issueSubmitted', { name: tx?.counterparty.firstName ?? '' })}
          </Text>
          <Button label={t('common.done')} onPress={() => router.replace('/(tabs)/inbox')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.xl }}>
        <Text variant="title">{t('transaction.issueTitle')}</Text>

        <View style={{ gap: spacing.sm }}>
          {REASONS.map((item) => (
            <Card
              key={item}
              onPress={() => setReason(item)}
              accessibilityLabel={t(`transaction.issueReasons.${item}`)}
            >
              <Text variant="bodyLarge" tone={reason === item ? 'accent' : 'default'}>
                {reason === item ? '● ' : '○ '}
                {t(`transaction.issueReasons.${item}`)}
              </Text>
            </Card>
          ))}
        </View>

        <Input
          label={t('transaction.issueDescribe')}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
        />

        <Button
          size="large"
          label={t('transaction.issueSubmit')}
          disabled={!reason || description.trim().length < 10}
          loading={report.isPending}
          onPress={async () => {
            if (!reason) return;
            await report.mutateAsync({
              transactionId: id,
              reason,
              description: description.trim(),
              photoPaths: [],
            });
            setSubmitted(true);
          }}
        />
      </View>
    </Screen>
  );
}
