import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ToolCard } from '@/components/domain/ToolCard';
import { Avatar, Button, Card, Screen, Skeleton, Stars, Text } from '@/components/primitives';
import { useProfile, useProfileTools, useRatings } from '@/features/tools/hooks';
import { currentLocale } from '@/i18n';
import { formatMonthYear, formatRating } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Public profile. Deliberately thin: first name, photo, rating, exchange
 * count, coarse area. No surname, no contact details, no follower counts —
 * this is a trust signal, not a social network.
 */
export default function PublicProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data: profile, isPending } = useProfile(userId);
  const { data: tools } = useProfileTools(userId);
  const { data: ratings } = useRatings(userId);

  if (isPending || !profile) {
    return (
      <Screen>
        <View style={{ gap: spacing.lg, paddingTop: spacing.xl }}>
          <Skeleton height={80} radius={40} width={80} />
          <Skeleton height={24} width="50%" />
          <Skeleton height={120} radius={12} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xl, gap: spacing.xl }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Avatar uri={profile.avatarUrl} name={profile.firstName} size={88} />
          <Text variant="title">{profile.firstName}</Text>
          {profile.rating != null ? (
            <View style={{ alignItems: 'center', gap: spacing.xs }}>
              <Stars value={profile.rating} size={18} />
              <Text variant="caption" tone="muted">
                {formatRating(profile.rating)} · {t('tool.exchanges', { count: profile.completedExchanges })}
              </Text>
            </View>
          ) : (
            <Text variant="caption" tone="muted">
              {t('tool.exchanges', { count: profile.completedExchanges })}
            </Text>
          )}
          <Text variant="caption" tone="muted">
            {profile.neighbourhood ? `${profile.neighbourhood} · ` : ''}
            {t('tool.memberSince', { date: formatMonthYear(profile.memberSince, currentLocale()) })}
          </Text>
        </View>

        {(tools?.length ?? 0) > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" tone="muted" uppercase>
              {t('profile.activeListings')}
            </Text>
            {tools!.map((tool) => (
              <ToolCard key={tool.id} tool={tool} onPress={() => router.push(`/tool/${tool.id}`)} />
            ))}
          </View>
        ) : null}

        {(ratings?.length ?? 0) > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" tone="muted" uppercase>
              {t('profile.reviews')}
            </Text>
            {ratings!.map((rating) => (
              <Card key={rating.id}>
                <View style={{ gap: spacing.xs }}>
                  <Stars value={rating.stars} size={13} />
                  {rating.comment ? <Text variant="body">{rating.comment}</Text> : null}
                  <Text variant="caption" tone="muted">
                    {rating.raterName ?? ''}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Button label={t('profile.reportUser')} variant="ghost" onPress={() => undefined} />
          <Button label={t('profile.blockUser')} variant="ghost" onPress={() => undefined} />
        </View>
      </View>
    </Screen>
  );
}
