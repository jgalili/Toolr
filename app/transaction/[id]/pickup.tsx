import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, View } from 'react-native';

import { StreetMap } from '@/components/domain/map/StreetMap';
import { Button, Card, EmptyState, Screen, Skeleton, Text } from '@/components/primitives';
import { useLiveLocation } from '@/features/location/useLiveLocation';
import { usePickupLocation, useTransaction } from '@/features/transactions/hooks';
import { distanceMetres } from '@/lib/geo';
import { formatDistance } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * The only screen in the app that shows a real address.
 *
 * It is reachable only for an accepted transaction, and the address comes from
 * `get_pickup_location` — a SECURITY DEFINER function that re-checks both the
 * participant and the transaction state server-side. If that check fails we
 * show nothing rather than a partially-filled screen.
 *
 * Everywhere else in the app a location is deliberately vague. Here it is not,
 * because here it has been earned: two people agreed a loan, and the whole
 * point of the next ten minutes is to find a doorway. So this screen gets a
 * real street map, the exact pin, your own position, and a distance that
 * counts down as you walk.
 */
export default function Pickup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, colors } = useTheme();

  const { data: tx } = useTransaction(id);
  const canSee = Boolean(tx && ['agreed', 'picked_up', 'returned'].includes(tx.status));
  const { data: location, isPending } = usePickupLocation(id, canSee);

  // Only watched while this screen is open, and only once there is somewhere
  // to walk to.
  const me = useLiveLocation(canSee && Boolean(location));

  const away =
    location && me.coords
      ? distanceMetres(me.coords, {
          latitude: location.latitude,
          longitude: location.longitude,
        })
      : null;

  function openMaps() {
    if (!location) return;
    const query = `${location.latitude},${location.longitude}`;
    const url = Platform.select({
      ios: `maps://?q=${query}`,
      android: `geo:${query}?q=${query}`,
      default: `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=18/${location.latitude}/${location.longitude}`,
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
      <View style={{ paddingTop: spacing.xl, gap: spacing.lg }}>
        <Text variant="title">{t('transaction.pickupTitle')}</Text>

        {isPending ? (
          <Skeleton height={260} radius={radius.lg} />
        ) : location ? (
          <>
            <StreetMap
              testID="pickup-map"
              centre={{ latitude: location.latitude, longitude: location.longitude }}
              radiusM={220}
              height={280}
              markers={[
                {
                  id: 'pickup',
                  coords: { latitude: location.latitude, longitude: location.longitude },
                  kind: 'pickup',
                  label: location.addressLine ?? undefined,
                },
              ]}
              me={me.coords ? { coords: me.coords, accuracyM: me.accuracyM } : null}
            />

            {/* How far, in words, updating as you move. The map shows where;
                this line is the one you can read at a glance while walking. */}
            <Text
              variant="bodyStrong"
              style={{ color: away != null && away < 40 ? colors.accent : colors.textMuted }}
            >
              {away == null
                ? me.status === 'denied' || me.status === 'unavailable'
                  ? t('map.locationOff')
                  : t('map.locating')
                : away < 25
                  ? t('map.arrived')
                  : t('map.metresAway', { distance: formatDistance(away, t) })}
            </Text>

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
