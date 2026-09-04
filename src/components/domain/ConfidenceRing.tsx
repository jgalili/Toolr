import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/primitives';
import { useTheme } from '@/theme';

/**
 * The confidence dial.
 *
 * A number on its own ("87%") implies a precision a vision model does not
 * have, so the ring never travels alone: it always sits next to a phrase like
 * "Likely cordless combi drill", and the *server* has already blanked any model
 * number below the 0.70 threshold before this screen ever sees it. The dial
 * says how sure; the sentence says what that means.
 *
 * Below 50% the ring turns amber — not as decoration, but because that is the
 * band where the honest answer is usually "call it a generic drill".
 */
export function ConfidenceRing({ value, size = 68 }: { value: number; size?: number }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  const pct = Math.max(0, Math.min(1, value));
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const tint = pct >= 0.5 ? colors.accent : colors.warning;

  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg
          width={size}
          height={size}
          style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        >
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.surfaceSunken}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={tint}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * pct} ${circumference}`}
            fill="none"
          />
        </Svg>
        <Text variant="bodyStrong" style={{ fontSize: size * 0.25 }}>
          {Math.round(pct * 100)}%
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {t('listing.confidence')}
      </Text>
    </View>
  );
}
