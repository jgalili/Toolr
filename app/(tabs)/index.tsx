import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppHeader } from '@/components/domain/AppHeader';
import { LocationChip } from '@/components/domain/LocationChip';
import { Icon, type IconName } from '@/components/domain/Icon';
import { ToolCard } from '@/components/domain/ToolCard';
import { Chip, EmptyState, ErrorState, Screen, Skeleton, Text } from '@/components/primitives';
import { ActiveBorrows } from '@/features/transactions/ActiveBorrows';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { useLocation } from '@/features/location/useLocation';
import { useUnreadCount } from '@/features/notifications/hooks';
import { useSearchTools } from '@/features/tools/hooks';
import { useToolLoans } from '@/features/transactions/hooks';
import { chevronIcon } from '@/i18n/direction';
import { formatRadius } from '@/lib/format';
import { IS_DEMO } from '@/lib/config';
import { useTheme } from '@/theme';
import { DEFAULT_FILTERS } from '@/types/domain';

/**
 * Home: two decisions, nothing else.
 *
 * No feed, no promos, no stats. If a neighbour cannot tell what to do here
 * within two seconds, everything after it is wasted. The list below the two
 * buttons exists to prove the answer is "yes, there is stuff near you" before
 * anyone has typed a word.
 */

function BigAction({
  icon,
  label,
  color,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  color: 'accent' | 'offer';
  onPress: () => void;
  testID: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const bg = color === 'accent' ? colors.accent : colors.offer;
  const fg = color === 'accent' ? colors.onAccent : colors.onOffer;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.sm + 2,
        borderRadius: radius.lg,
        backgroundColor: bg,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: fg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} color={bg} size={19} strokeWidth={2.2} />
      </View>
      <Text
        variant="bodyStrong"
        uppercase
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ flex: 1, color: fg, fontSize: 14, letterSpacing: 0.2 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SearchField({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={t('home.searchPlaceholder')}
      testID="home-search"
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Icon name="search" color={colors.textMuted} size={21} />
      <Text variant="bodyLarge" tone="muted">
        {t('home.searchPlaceholder')}
      </Text>
    </Pressable>
  );
}

/** Home looks wider than the default search — it is a "what's around" list. */
const RADIUS_M = 3000;

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, colors } = useTheme();
  const { centre } = useLocation();
  const { requireMember } = useAuthGate();
  const unread = useUnreadCount();

  const nearby = useSearchTools(centre, { ...DEFAULT_FILTERS, radiusM: RADIUS_M });
  const loanFor = useToolLoans((nearby.data ?? []).map((tool) => tool.id));

  return (
    <Screen scroll testID="home-screen">
      <View style={{ gap: spacing.lg }}>
        <AppHeader
          right={{
            icon: 'bell',
            label: t('common.notifications'),
            badge: unread > 0,
            onPress: () => router.push('/me/activity'),
            testID: 'home-bell',
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <LocationChip onPress={() => router.push('/area')} />
          {IS_DEMO ? <Chip label={t('common.demoBadge')} tone="warning" /> : null}
        </View>

        <SearchField onPress={() => router.push('/search')} />

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <BigAction
            icon="person"
            label={t('home.needTool')}
            color="accent"
            onPress={() => router.push('/search')}
            testID="home-need-tool"
          />
          <BigAction
            icon="plus"
            label={t('home.haveTool')}
            color="offer"
            onPress={() => requireMember({ kind: 'list' }, () => router.push('/list/camera'))}
            testID="home-have-tool"
          />
        </View>

        {/* Anything you are holding, or anything of yours someone else is,
            sits above the browsing. A due date is more urgent than a shop. */}
        <ActiveBorrows />

        <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text variant="heading" style={{ fontSize: 21 }}>
              {t('home.nearYou')}
            </Text>
            <Pressable
              onPress={() => router.push('/search/results')}
              accessibilityRole="button"
              accessibilityLabel={t('common.seeAll')}
              hitSlop={10}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text variant="bodyStrong" tone="accent" style={{ fontSize: 15 }}>
                {t('common.seeAll')}
              </Text>
              <Icon name={chevronIcon()} color={colors.accent} size={17} strokeWidth={2.4} />
            </Pressable>
          </View>

          {nearby.isPending ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} height={112} radius={radius.lg} />
              ))}
            </View>
          ) : nearby.error ? (
            /* A failed request used to render as "nothing nearby", which sent
               everyone looking for a data problem that wasn't there. */
            <ErrorState
              title={t('errors.searchFailed')}
              body={t('errors.searchFailedBody')}
              retryLabel={t('common.retry')}
              onRetry={() => void nearby.refetch()}
            />
          ) : (nearby.data?.length ?? 0) === 0 ? (
            /* Almost always "you are not standing where the tools are", so the
               first thing offered is the area, not the radius. */
            <EmptyState
              title={t('empty.noToolsNearby')}
              body={t('empty.noToolsNearbyBody', { radius: formatRadius(RADIUS_M, t) })}
              primaryAction={{
                label: t('empty.changeArea'),
                onPress: () => router.push('/area'),
              }}
              secondaryAction={{
                label: t('request.postNeed'),
                onPress: () =>
                  requireMember({ kind: 'request' }, () => router.push('/request/new')),
              }}
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {nearby.data!.slice(0, 6).map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  loan={loanFor(tool.id)}
                  onPress={() => router.push(`/tool/${tool.id}`)}
                  onBorrow={() =>
                    requireMember(
                      { kind: 'borrow', name: tool.owner.firstName, tool: tool.title },
                      () => router.push(`/tool/${tool.id}/request`),
                    )
                  }
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
