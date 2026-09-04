import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text as RNText, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

/**
 * The NailedIt wordmark.
 *
 * The capital I is a nail, and the dot on the i is the nail's head in
 * miniature — so the joke lands twice at two different sizes. Both are drawn,
 * not typeset, because a font substitution on someone's phone must never be
 * able to turn the logo into an ordinary word.
 *
 * Everything is proportional to `size` (the cap font size), so the mark is one
 * component at every scale rather than five hand-tuned copies.
 */

function Nail({ height, color }: { height: number; color: string }) {
  // 30 × 72: a broad head, a straight shaft, and a tip that comes to a point.
  const width = (30 / 72) * height;
  return (
    <Svg width={width} height={height} viewBox="0 0 30 72">
      <Path
        d="M0 3.5A3.5 3.5 0 0 1 3.5 0h23A3.5 3.5 0 0 1 30 3.5v3A3.5 3.5 0 0 1 26.5 10H20v46l-5 16-5-16V10H3.5A3.5 3.5 0 0 1 0 6.5z"
        fill={color}
      />
    </Svg>
  );
}

/** A dotless i plus a drawn dot, so the dot can carry the brand colour. */
function DottedI({ size, ink, accent }: { size: number; ink: string; accent: string }) {
  const dot = size * 0.145;
  return (
    <View style={{ position: 'relative' }}>
      <RNText
        style={{ fontSize: size, fontWeight: '700', color: ink, letterSpacing: -size * 0.02 }}
      >
        {'ı'}
      </RNText>
      <View
        style={{
          position: 'absolute',
          top: size * 0.16,
          alignSelf: 'center',
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: accent,
        }}
      />
    </View>
  );
}

export function Wordmark({ size = 30, tagline = false }: { size?: number; tagline?: boolean }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  const letter = {
    fontSize: size,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -size * 0.02,
  };

  return (
    <View accessibilityRole="header" accessibilityLabel={t('app.name')}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <RNText style={letter}>Na</RNText>
        <DottedI size={size} ink={colors.text} accent={colors.accent} />
        <RNText style={letter}>led</RNText>
        {/* The row is baseline-aligned, so the SVG's bottom edge sits on the
            baseline. 0.8em tall with a 0.08em drop puts the head at cap height
            and the point just below the baseline — where a nail through a word
            belongs. */}
        <View style={{ paddingHorizontal: size * 0.035, transform: [{ translateY: size * 0.08 }] }}>
          <Nail height={size * 0.8} color={colors.accent} />
        </View>
        <RNText style={letter}>t</RNText>
      </View>

      {tagline ? <Tagline size={size * 0.5} /> : null}
    </View>
  );
}

/**
 * "Someone nearby has it." — with the one word that is the whole promise in
 * brand colour. The accented word is a separate translation key rather than
 * markup, so a translator can move it anywhere in the sentence.
 */
export function Tagline({ size = 15 }: { size?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const full = t('app.tagline');
  const accent = t('app.taglineAccent');
  const at = accent ? full.indexOf(accent) : -1;

  const base = { fontSize: size, lineHeight: size * 1.4, color: colors.textMuted };

  if (at < 0) return <RNText style={base}>{full}</RNText>;

  return (
    <RNText style={base} numberOfLines={1}>
      {full.slice(0, at)}
      <RNText style={{ color: colors.accent, fontWeight: '600' }}>{accent}</RNText>
      {full.slice(at + accent.length)}
    </RNText>
  );
}
