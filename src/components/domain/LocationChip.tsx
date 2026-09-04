import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '@/components/primitives';
import { useLocation } from '@/features/location/useLocation';
import { useTheme } from '@/theme';

function Pin({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" />
      <Circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

export function LocationChip({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { neighbourhood, status } = useLocation();

  const hasArea = status === 'granted' || status === 'manual';
  const label = hasArea ? neighbourhood : t('home.setArea');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Pin color={colors.textMuted} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      {hasArea ? (
        <Text variant="caption" tone="accent">
          · {t('home.changeArea')}
        </Text>
      ) : null}
    </Pressable>
  );
}
