import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme';

const STAR_PATH =
  'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z';

function Star({ filled, size, color, dim }: { filled: boolean; size: number; color: string; dim: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={STAR_PATH} fill={filled ? color : dim} />
    </Svg>
  );
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const { colors } = useTheme();
  const rounded = Math.round(value);
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= rounded} size={size} color={colors.warning} dim={colors.border} />
      ))}
    </View>
  );
}

export function StarPicker({
  value,
  onChange,
  size = 40,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === n }}
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          hitSlop={8}
          style={{ padding: spacing.xs }}
        >
          <Star filled={n <= value} size={size} color={colors.warning} dim={colors.border} />
        </Pressable>
      ))}
    </View>
  );
}
