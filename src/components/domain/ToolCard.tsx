import { Image } from 'expo-image';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/primitives';
import { currentLocale } from '@/i18n';
import { formatDistance, formatMoney, formatRating } from '@/lib/format';
import { useTheme } from '@/theme';
import type { ToolSummary } from '@/types/domain';

import { Icon } from './Icon';
import { ToolIllustration } from './ToolIllustration';

/**
 * The price line. FREE is a word, not a zero — the free listings are the point
 * of the product and should read as generosity, not as a discount. Both states
 * are teal, because both are "you can have this".
 */
export function PriceLabel({ tool, large }: { tool: ToolSummary; large?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const text =
    tool.paymentMode === 'free'
      ? t('common.free')
      : t('common.perDay', {
          price: formatMoney(tool.pricePerDayAgorot ?? 0, tool.currency, currentLocale()),
        });

  return (
    <Text variant={large ? 'heading' : 'bodyStrong'} style={{ color: colors.free }}>
      {text}
    </Text>
  );
}

/** A single filled star and the number. Never a five-star row in a list — it is
 *  five times the ink for the same fact. */
export function RatingPill({ value, size = 15 }: { value: number | null; size?: number }) {
  const { colors, spacing } = useTheme();
  if (value == null) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Icon name="star" color={colors.star} size={size} filled strokeWidth={0} />
      <Text variant="bodyStrong">{formatRating(value)}</Text>
    </View>
  );
}

/** Pin + "280 m away", the line that answers the only question that matters. */
export function DistanceLine({ tool }: { tool: ToolSummary }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Icon name="pin" color={colors.textMuted} size={14} strokeWidth={2} />
      <Text variant="caption" tone="muted">
        {t('common.away', { distance: formatDistance(tool.distanceM, t) })}
      </Text>
    </View>
  );
}

type Props = {
  tool: ToolSummary;
  onPress: () => void;
  onBorrow?: () => void;
  onToggleFavorite?: () => void;
  variant?: 'listing' | 'tile';
};

function Thumbnail({ tool, size }: { tool: ToolSummary; size: number }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: colors.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {tool.photoUrl ? (
        <Image
          source={{ uri: tool.photoUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <ToolIllustration toolType={tool.toolType} category={tool.categorySlug} size={size} />
      )}
    </View>
  );
}

/**
 * The card the whole product is browsed through.
 *
 * Reading order is deliberate: what it is, how far, what it costs, and how to
 * get it — the Borrow button sits last because it is the answer, not the
 * question. The card itself is tappable for the full detail; the button is the
 * shortcut for someone who has already decided.
 */
export function ToolCard({ tool, onPress, onBorrow, onToggleFavorite, variant = 'listing' }: Props) {
  const { t } = useTranslation();
  const { colors, radius, spacing, shadow } = useTheme();

  const label = `${tool.title}, ${formatDistance(tool.distanceM, t)}, ${
    tool.paymentMode === 'free'
      ? t('common.free')
      : t('common.perDay', {
          price: formatMoney(tool.pricePerDayAgorot ?? 0, tool.currency, currentLocale()),
        })
  }`;

  if (variant === 'tile') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          {
            width: 172,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            opacity: pressed ? 0.9 : 1,
          },
          shadow.card,
        ]}
      >
        <View
          style={{
            height: 112,
            backgroundColor: colors.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {tool.photoUrl ? (
            <Image
              source={{ uri: tool.photoUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <ToolIllustration toolType={tool.toolType} category={tool.categorySlug} size={92} />
          )}
        </View>
        <View style={{ padding: spacing.md, gap: spacing.xs }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {tool.title}
          </Text>
          <DistanceLine tool={tool} />
          <PriceLabel tool={tool} />
        </View>
      </Pressable>
    );
  }

  // A card that is itself tappable AND carries a Borrow button is two nested
  // interactive controls. React Native is happy with that; HTML is not — the
  // web build renders <button> inside <button>, which React flags and which
  // browsers are entitled to fix up however they like. So on web the card body
  // is an inert View with a full-bleed press target *behind* the actions, and
  // the actions are lifted above it. Native keeps the simpler nesting.
  const cardStyle = [
    {
      flexDirection: 'row' as const,
      gap: spacing.md,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    shadow.card,
  ];

  const body = (
    <>
      <Thumbnail tool={tool} size={96} />

      <View style={{ flex: 1, paddingVertical: spacing.xs, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <Text variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }}>
            {tool.title}
          </Text>
          <RatingPill value={tool.owner.rating} />
        </View>

        <DistanceLine tool={tool} />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
            marginTop: 'auto',
            // On web this row sits above the full-bleed press target below,
            // so Borrow and the heart stay clickable.
            ...(Platform.OS === 'web' ? { zIndex: 1 } : null),
          }}
        >
          <PriceLabel tool={tool} />

          {onBorrow ? (
            <Button
              label={t('tool.borrow')}
              variant="outline"
              size="small"
              shape="pill"
              fullWidth={false}
              onPress={onBorrow}
              testID={`borrow-${tool.id}`}
            />
          ) : onToggleFavorite ? (
            <Pressable
              onPress={onToggleFavorite}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ selected: Boolean(tool.isFavorite) }}
              accessibilityLabel={tool.title}
              style={{ padding: spacing.xs }}
            >
              <Icon
                name="heart"
                filled={Boolean(tool.isFavorite)}
                color={tool.isFavorite ? colors.danger : colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={cardStyle}>
        {body}
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          testID={`tool-card-${tool.id}`}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`tool-card-${tool.id}`}
      style={({ pressed }) => [...cardStyle, { opacity: pressed ? 0.92 : 1 }]}
    >
      {body}
    </Pressable>
  );
}
