import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type Segment<T extends string> = {
  value: T;
  label: string;
  /** Rendered before the label. Receives the resolved tint so it matches. */
  icon?: (color: string) => React.ReactNode;
};

type Props<T extends string> = {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * `subtle` is the default: a raised white pill on a sunken track, for
   * switching between equal views. `brand` fills the selected segment with the
   * accent — use it only where the choice is the screen's main control.
   */
  variant?: 'subtle' | 'brand';
  /** Which brand role fills the selected segment. Only used by `brand`. */
  tone?: 'accent' | 'offer';
  testID?: string;
};

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  variant = 'subtle',
  tone = 'accent',
  testID,
}: Props<T>) {
  const { colors, radius, spacing, hitSize } = useTheme();
  const brand = variant === 'brand';
  const fill = tone === 'offer' ? colors.offer : colors.accent;
  const onFill = tone === 'offer' ? colors.onOffer : colors.onAccent;

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: brand ? colors.surface : colors.surfaceSunken,
        borderRadius: brand ? radius.md : radius.md,
        borderWidth: brand ? 1 : 0,
        borderColor: colors.border,
        padding: brand ? 0 : 3,
        overflow: 'hidden',
        gap: brand ? 0 : 3,
      }}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        const tint = brand
          ? active
            ? onFill
            : colors.textSecondary
          : active
            ? colors.text
            : colors.textMuted;

        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={segment.label}
            testID={`${testID ?? 'segment'}-${segment.value}`}
            onPress={() => onChange(segment.value)}
            style={{
              flex: 1,
              minHeight: brand ? hitSize.min : hitSize.min - 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: brand ? 0 : radius.sm,
              backgroundColor: active ? (brand ? fill : colors.surface) : 'transparent',
            }}
          >
            {segment.icon?.(tint)}
            <Text variant="bodyStrong" numberOfLines={1} style={{ color: tint }}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
