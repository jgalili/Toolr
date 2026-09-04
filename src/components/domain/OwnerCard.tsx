import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Avatar, Text } from '@/components/primitives';
import { chevronIcon } from '@/i18n/direction';
import { useTheme } from '@/theme';
import type { PublicProfile } from '@/types/domain';

import { Icon } from './Icon';

/**
 * Who you would be borrowing from.
 *
 * Three facts, in the order a borrower weighs them: who, roughly where, and
 * how many times this has gone well before. The exchange count is the one that
 * does the work — a number of completed handovers is harder to fake than a
 * star average, and it is the closest thing the product has to a reference.
 */
export function OwnerCard({ profile, onPress }: { profile: PublicProfile; onPress?: () => void }) {
  const { t } = useTranslation();
  const { spacing, colors, radius } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={profile.firstName}
      testID="owner-card"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Avatar uri={profile.avatarUrl} name={profile.firstName} size={52} />

      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="bodyStrong" style={{ fontSize: 17 }}>
          {profile.firstName}
        </Text>

        {profile.neighbourhood ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="pin" color={colors.textMuted} size={15} strokeWidth={2} />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {t('tool.nearLandmark', { place: profile.neighbourhood })}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Icon name="shield-check" color={colors.textMuted} size={15} strokeWidth={2} />
          <Text variant="caption" tone="muted">
            {t('tool.successfulExchanges', { count: profile.completedExchanges })}
          </Text>
        </View>
      </View>

      {onPress ? <Icon name={chevronIcon()} color={colors.textMuted} size={20} /> : null}
    </Pressable>
  );
}
