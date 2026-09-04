import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ChipTone = 'neutral' | 'accent' | 'offer' | 'warning' | 'danger';

type Props = {
  label: string;
  tone?: ChipTone;
  /**
   * `outline` is the filter-bar treatment: a teal hairline pill that fills in
   * when it is on, so an active filter is visible without reading it.
   */
  variant?: 'soft' | 'outline';
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  testID?: string;
};

export function Chip({
  label,
  tone = 'neutral',
  variant = 'soft',
  selected,
  onPress,
  icon,
  testID,
}: Props) {
  const { colors, radius, spacing, hitSize } = useTheme();

  const backgrounds: Record<ChipTone, string> = {
    neutral: colors.surfaceSunken,
    accent: colors.accentSoft,
    offer: colors.offerSoft,
    warning: colors.warningSoft,
    danger: colors.dangerSoft,
  };
  const textTones = {
    neutral: 'secondary',
    accent: 'accent',
    offer: 'offer',
    warning: 'warning',
    danger: 'danger',
  } as const;

  const outline = variant === 'outline';

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: onPress ? hitSize.min - 8 : undefined,
        paddingVertical: spacing.sm,
        paddingHorizontal: outline ? spacing.lg : spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: outline || selected ? colors.accent : 'transparent',
        backgroundColor: selected
          ? colors.accentSoft
          : outline
            ? colors.surface
            : backgrounds[tone],
      }}
    >
      {icon}
      <Text
        variant={outline ? 'bodyStrong' : 'caption'}
        tone={selected || outline ? 'accent' : textTones[tone]}
        style={outline ? { fontSize: 14 } : undefined}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {content}
    </Pressable>
  );
}
