import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/domain/AppHeader';
import { Icon, type IconName } from '@/components/domain/Icon';
import { OwnerCard } from '@/components/domain/OwnerCard';
import { StreetMap } from '@/components/domain/map/StreetMap';
import { ExchangeCount, LoanBadge, PriceLabel, RatingPill } from '@/components/domain/ToolCard';
import { SafetyNote } from '@/components/domain/SafetyNote';
import { ToolIllustration } from '@/components/domain/ToolIllustration';
import { Button, Chip, ErrorState, Screen, Skeleton, Text } from '@/components/primitives';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { useSession } from '@/features/auth/session';
import { useTool, useToggleFavorite } from '@/features/tools/hooks';
import { useToolLoans } from '@/features/transactions/hooks';
import { backIcon } from '@/i18n/direction';
import { formatDistance } from '@/lib/format';
import { useTheme } from '@/theme';
import type { IncludedItem, PickupWindow } from '@/types/domain';

const ITEM_ICON: Record<IncludedItem['icon'], IconName> = {
  battery: 'battery',
  charger: 'charger',
  case: 'case',
  item: 'tag',
};

/** A bordered block with a heading — "Available today", "Includes". */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Text variant="bodyStrong" style={{ fontSize: 17 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function PhotoCarousel({
  photos,
  toolType,
  category,
}: {
  photos: string[];
  toolType: string;
  category: React.ComponentProps<typeof ToolIllustration>['category'];
}) {
  const { t } = useTranslation();
  const { colors, radius, spacing } = useTheme();
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);

  // Four dots even for one photo would be a lie; one photo gets no dots.
  const slides = photos.length > 0 ? photos : [null];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: spacing.md }}>
      <View
        style={{
          height: 240,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceSunken,
        }}
      >
        {width > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))
            }
          >
            {slides.map((uri, i) => (
              <View key={uri ?? i} style={{ width, height: 240 }}>
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={200}
                    accessibilityLabel={t('tool.photoOf', { index: i + 1, total: slides.length })}
                  />
                ) : (
                  <ToolIllustration toolType={toolType} category={category} size={170} />
                )}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {slides.length > 1 ? (
        <View
          style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}
          accessibilityElementsHidden
        >
          {slides.map((uri, i) => (
            <View
              key={uri ?? i}
              style={{
                width: i === index ? 8 : 7,
                height: i === index ? 8 : 7,
                borderRadius: 4,
                backgroundColor: i === index ? colors.accent : colors.borderStrong,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Today's windows only — a full week grid is a settings screen, not a decision. */
function todaysWindows(windows: PickupWindow[]): PickupWindow[] {
  const today = new Date().getDay();
  return windows.filter((w) => w.weekday === today);
}

export default function ToolDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { requireMember } = useAuthGate();
  const { userId } = useSession();
  const toggleFavorite = useToggleFavorite();

  const { data: tool, isPending, error, refetch } = useTool(id);
  const loanFor = useToolLoans(id ? [id] : []);

  if (isPending) {
    return (
      <Screen scroll>
        <View style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
          <Skeleton height={240} radius={radius.lg} />
          <Skeleton width="70%" height={26} />
          <Skeleton width="40%" height={18} />
          <Skeleton height={80} radius={radius.md} />
        </View>
      </Screen>
    );
  }

  if (error || !tool) {
    return (
      <Screen>
        <ErrorState
          title={t('tool.notFound')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </Screen>
    );
  }

  const canBorrow = tool.status === 'active';
  const today = todaysWindows(tool.pickupWindows);
  const loan = loanFor(tool.id);
  // Your own listing is a different screen with the same content. Offering
  // "Borrow" here was not merely odd -- the server refuses it with "you
  // cannot borrow your own tool", and until now that refusal went nowhere,
  // so the button simply did nothing.
  const isMine = Boolean(userId) && tool.ownerProfile.id === userId;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll footerSpace={104} testID="tool-detail">
        <AppHeader
          align="center"
          size={26}
          left={{
            icon: backIcon(),
            label: t('common.back'),
            onPress: () => router.back(),
            testID: 'tool-back',
          }}
          right={{
            icon: 'heart',
            label: tool.title,
            filled: Boolean(tool.isFavorite),
            onPress: () =>
              requireMember({ kind: 'favourite' }, () =>
                toggleFavorite.mutate({ toolId: tool.id, favorite: !tool.isFavorite }),
              ),
            testID: 'tool-favourite',
          }}
        />

        <View style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
          <PhotoCarousel
            photos={tool.photos}
            toolType={tool.toolType}
            category={tool.categorySlug}
          />

          <View style={{ gap: spacing.sm }}>
            <Text variant="title">{tool.title}</Text>

            {/* Distance · price · rating, in that order: the three facts that
                decide it, on one line. */}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Icon name="pin" color={colors.textMuted} size={16} strokeWidth={2} />
                <Text variant="body" tone="secondary">
                  {t('common.away', { distance: formatDistance(tool.distanceM, t) })}
                </Text>
              </View>
              <Text tone="muted">·</Text>
              <PriceLabel tool={tool} />
              <Text tone="muted">·</Text>
              {/* Tappable, and it says how many. A rating you cannot read the
                  reviews behind is a number you are asked to take on trust,
                  from strangers, about strangers. */}
              <RatingPill
                value={tool.owner.rating}
                count={tool.owner.ratingCount}
                size={16}
                onPress={() => router.push(`/profile/${tool.ownerProfile.id}#reviews`)}
              />
            </View>

            {/* How many times this exact tool has gone out and come back. */}
            <ExchangeCount count={tool.completedExchanges} />

            {tool.condition || (tool.brand && !tool.isModelConfirmed) ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {tool.condition ? <Chip label={t(`tool.condition.${tool.condition}`)} /> : null}
                {/* The borrower sees the same uncertainty the owner saw. That
                    symmetry is the whole point of the confidence policy. */}
                {tool.brand && !tool.isModelConfirmed ? (
                  <Chip label={t('tool.modelUncertain')} tone="warning" />
                ) : null}
              </View>
            ) : null}
          </View>

          <OwnerCard
            profile={tool.ownerProfile}
            onPress={() => router.push(`/profile/${tool.ownerProfile.id}`)}
          />

          {tool.description ? <Text variant="bodyLarge">{tool.description}</Text> : null}

          <Panel title={t('tool.availableTodayTitle')}>
            {today.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
                {today.map((w) => (
                  <View
                    key={`${w.startTime}-${w.endTime}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.lg,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.accent,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Icon name="calendar" color={colors.accent} size={18} />
                    <Text variant="bodyStrong" tone="accent">
                      {w.startTime}–{w.endTime}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text variant="body" tone="muted">
                {t('tool.noSlotsToday')}
              </Text>
            )}
          </Panel>

          {tool.includedItems.length > 0 ? (
            <Panel title={t('tool.includes')}>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                {tool.includedItems.slice(0, 3).map((item) => (
                  <View
                    key={item.label}
                    style={{
                      flex: 1,
                      gap: spacing.sm,
                      alignItems: 'center',
                      paddingVertical: spacing.lg,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Icon name={ITEM_ICON[item.icon]} color={colors.textSecondary} size={26} />
                    <Text variant="caption" tone="secondary" center numberOfLines={2}>
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Panel>
          ) : tool.accessories ? (
            <Panel title={t('tool.includes')}>
              <Text variant="body">{tool.accessories}</Text>
            </Panel>
          ) : null}

          {tool.instructions ? (
            <Panel title={t('tool.instructions')}>
              <Text variant="body">{tool.instructions}</Text>
            </Panel>
          ) : null}

          {/* Which days are already taken. Shown next to the borrow window so
              nobody picks Tuesday and waits two days to be told it was gone. */}
          {loan ? <LoanBadge line={loan} /> : null}

          {tool.maxBorrowDays ? (
            <Text variant="caption" tone="muted">
              {t('tool.maxDays', { count: tool.maxBorrowDays })}
            </Text>
          ) : null}

          <SafetyNote risk={tool.risk} />

          {/* A circle, not a pin, on a real street map.
              The basemap is genuine so the neighbourhood is recognisable; the
              circle is the honest part -- it says "somewhere in here", which is
              all this screen is entitled to say before a borrow is agreed. The
              exact doorway appears on the pickup screen, after accept. */}
          <View style={{ gap: spacing.xs }}>
            <StreetMap
              testID="tool-area-map"
              centre={tool.coords}
              radiusM={260}
              height={180}
              circles={[{ id: 'approx', coords: tool.coords, radiusM: 180, kind: 'approx' }]}
            />
            <Text variant="caption" tone="muted">
              {t('tool.approximateArea')}
            </Text>
          </View>
        </View>
      </Screen>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          start: 0,
          end: 0,
          flexDirection: 'row',
          gap: spacing.md,
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.md,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {isMine ? (
          <>
            <Button
              testID="edit-button"
              style={{ flex: 1 }}
              label={t('listing.edit')}
              onPress={() => router.push(`/tool/${tool.id}/edit`)}
            />
            <Button
              testID="requests-button"
              style={{ flex: 1 }}
              variant="offer-outline"
              label={t('inbox.requests')}
              icon={<Icon name="message" color={colors.offer} size={19} />}
              onPress={() => router.push('/inbox')}
            />
          </>
        ) : (
          <>
            <Button
              testID="borrow-button"
              style={{ flex: 1 }}
              label={canBorrow ? t('tool.borrow') : t('tool.askAvailability')}
              onPress={() =>
                requireMember(
                  { kind: 'borrow', name: tool.ownerProfile.firstName, tool: tool.title },
                  () => router.push(`/tool/${tool.id}/request`),
                )
              }
            />
            <Button
              testID="message-button"
              style={{ flex: 1 }}
              variant="offer-outline"
              label={t('tool.messageOwner')}
              icon={<Icon name="message" color={colors.offer} size={19} />}
              onPress={() =>
                requireMember(
                  { kind: 'borrow', name: tool.ownerProfile.firstName, tool: tool.title },
                  () => router.push(`/tool/${tool.id}/request`),
                )
              }
            />
          </>
        )}
      </View>
    </View>
  );
}
