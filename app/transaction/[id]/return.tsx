import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/components/primitives';
import { useConfirmReturn, useTransaction } from '@/features/transactions/hooks';
import { useTheme } from '@/theme';

export default function ReturnConfirmation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data: tx } = useTransaction(id);
  const confirm = useConfirmReturn();

  const question =
    tx?.viewerRole === 'owner'
      ? t('transaction.returnQuestionOwner', { tool: tx?.toolTitle ?? '' })
      : t('transaction.returnQuestionBorrower', { tool: tx?.toolTitle ?? '' });

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xxl }}>
        <Text variant="display" center>
          {question}
        </Text>

        <View style={{ gap: spacing.md }}>
          <Button
            size="large"
            label={tx?.viewerRole === 'owner' ? t('transaction.returnedAllGood') : t('transaction.returnedYes')}
            loading={confirm.isPending}
            onPress={async () => {
              await confirm.mutateAsync(id);
              router.replace(`/transaction/${id}/rate`);
            }}
          />
          <Button label={t('transaction.notYet')} variant="secondary" onPress={() => router.back()} />
          <Button
            label={t('transaction.reportIssue')}
            variant="ghost"
            onPress={() => router.replace(`/transaction/${id}/issue`)}
          />
        </View>
      </View>
    </Screen>
  );
}
