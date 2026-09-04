import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Chip, Input, Screen, StarPicker, Text } from '@/components/primitives';
import { useSubmitRating, useTransaction } from '@/features/transactions/hooks';
import { useTheme } from '@/theme';

const OWNER_TAGS = ['as_described', 'easy_to_reach', 'flexible'] as const;
const BORROWER_TAGS = ['on_time', 'good_condition', 'good_communication'] as const;

export default function Rate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data: tx } = useTransaction(id);
  const submit = useSubmitRating();

  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const rateOwner = tx?.viewerRole === 'borrower';
  const tagKeys = rateOwner ? OWNER_TAGS : BORROWER_TAGS;
  const namespace = rateOwner ? 'rating.tagsOwner' : 'rating.tagsBorrower';

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.xl }}>
        <Text variant="title">
          {rateOwner
            ? t('rating.rateOwner', { name: tx?.counterparty.firstName ?? '' })
            : t('rating.rateBorrower', { name: tx?.counterparty.firstName ?? '' })}
        </Text>

        <View style={{ alignItems: 'center' }}>
          <StarPicker value={stars} onChange={setStars} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {tagKeys.map((tag) => (
            <Chip
              key={tag}
              label={t(`${namespace}.${tag}`)}
              selected={tags.includes(tag)}
              onPress={() =>
                setTags((current) =>
                  current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag],
                )
              }
            />
          ))}
        </View>

        <Input
          value={comment}
          onChangeText={setComment}
          placeholder={t('rating.commentPlaceholder')}
          multiline
          maxLength={140}
        />

        {/* Double-blind: saying so up front is what stops it feeling broken
            when the rating doesn't appear immediately. */}
        <Text variant="caption" tone="muted">
          {t('rating.pendingPublish')}
        </Text>

        <View style={{ gap: spacing.md }}>
          <Button
            size="large"
            label={t('rating.submit')}
            disabled={stars === 0}
            loading={submit.isPending}
            onPress={async () => {
              await submit.mutateAsync({
                transactionId: id,
                stars,
                tags,
                comment: comment.trim() || null,
              });
              router.replace('/(tabs)/inbox');
            }}
          />
          <Button
            label={t('rating.skip')}
            variant="ghost"
            onPress={() => router.replace('/(tabs)/inbox')}
          />
        </View>
      </View>
    </Screen>
  );
}
