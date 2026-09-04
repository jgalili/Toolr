import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, View } from 'react-native';

import { Button, Card, EmptyState, Screen, Skeleton, Text } from '@/components/primitives';
import { usePickupLocation, useTransaction } from '@/features/transactions/hooks';
import { useTheme } from '@/theme';

/**
 * The only screen in the app that shows a real address.
 *
 * It is reachable only for an accepted transaction, and the address comes from
 * `get_pickup_location` — a SECURITY DEFINER function that re-checks both the
 * participant and the transaction state server-side. If that check fails we
 * show nothing rather than a partially-filled screen.
 */
export default function Pickup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, colors } = useTheme();

  const { data: tx } = useTransaction(id);
  const canSee = Boolean(tx && ['agreed', 'picked_up', 'returned'].includes(tx.status));
  const { data: location, isPending } = usePickupLocation(id, canSee);

  function openMaps() {
    if (!location) return;
    const query = `${location.latitude},${location.longitude}`;
    const url = Platform.select({
      ios: `maps://?q=${query}`,
      android: `geo:${query}?q=${query}`,
      default: `https://maps.google.com/?q=${query}`,
    });
    void Linking.openURL(url);
  }

  if (!canSee) {
    return (
      <Screen>
        <EmptyState
          title={t('errors.notFound')}
          primaryAction={{ label: t('common.back'), onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xl, gap: spacing.xl }}>
        <Text variant="title">{t('transaction.pickupTitle')}</Text>

        {isPending ? (
          <Skeleton height={120} radius={radius.lg} />
        ) : location ? (
          <>
            <Card>
              <View style={{ gap: spacing.sm }}>
                <Text variant="caption" tone="accent">
                  {t('transaction.pickupUnlocked', { name: tx?.counterparty.firstName ?? '' })}
                </Text>
                <Text variant="heading">{location.addressLine ?? ''}</Text>
                {location.pickupNotes ? (
                  <Text variant="body" tone="secondary">
                    {location.pickupNotes}
                  </Text>
                ) : null}
              </View>
            </Card>

            <Button label={t('transaction.openInMaps')} onPress={openMaps} />
          </>
        ) : (
          <View
            style={{
              padding: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <Text variant="body" tone="muted">
              {t('errors.notFound')}
            </Text>
          </View>
        )}

        {tx?.conversationId ? (
          <Button
            label={t('inbox.message')}
            variant="secondary"
            onPress={() => router.push(`/chat/${tx.conversationId}`)}
          />
        ) : null}
      </View>
    </Screen>
  );
}
