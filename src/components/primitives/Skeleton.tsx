import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { AccessibilityInfo, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

/**
 * A placeholder that matches the shape of the thing it stands in for.
 * Anything slower than ~400 ms gets one of these; anything faster gets
 * nothing, so there is no flash of loading state.
 */
export function Skeleton({ width = '100%', height = 16, radius: r, style }: Props) {
  const theme = useTheme();
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      opacity.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
    });
    return () => {
      cancelled = true;
    };
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: r ?? theme.radius.sm,
          backgroundColor: theme.colors.skeleton,
        },
        style as AnimatedStyle<ViewStyle>,
        animated,
      ]}
    />
  );
}
