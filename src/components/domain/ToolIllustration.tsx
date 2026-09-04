import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { CategorySlug } from '@/types/domain';
import { useTheme } from '@/theme';

/**
 * The photo fallback.
 *
 * Every listing should have a real photograph — the product is built around
 * "take a photo and it lists itself". But a listing can be photo-less while an
 * upload is in flight, and a demo has no photographs at all, so this has to
 * look deliberate rather than broken.
 *
 * Drawings are two-tone: a body colour for the mass of the tool and the brand
 * teal for the part you hold or the part that does the work. That is enough to
 * tell a drill from a jigsaw at 96px, which is the whole job.
 *
 * Keyed by `tool_type` first (a cordless drill and a rotary hammer are not the
 * same silhouette) and by category only as a fallback.
 */

type Draw = (body: string, accent: string) => React.ReactNode;

const BY_TOOL_TYPE: Record<string, Draw> = {
  'cordless-drill': (b, a) => (
    <>
      <Path d="M14 20h26a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H14z" fill={b} />
      <Rect x="44" y="24.5" width="7" height="8" rx="1.5" fill={a} />
      <Rect x="51" y="26.5" width="6" height="4" rx="2" fill={b} />
      <Path d="M16 37h11l-2 11a4 4 0 0 1-4 3.5h-1a4 4 0 0 1-4-3.5z" fill={b} />
      <Rect x="11" y="47" width="16" height="8" rx="2.5" fill={a} />
      <Rect x="18" y="23.5" width="14" height="4" rx="2" fill={a} opacity={0.55} />
    </>
  ),
  'rotary-hammer': (b, a) => (
    <>
      <Path d="M12 19h24a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H12z" fill={b} />
      <Rect x="41" y="27" width="6" height="6" rx="1.5" fill={a} />
      <Rect x="47" y="28.5" width="12" height="3" rx="1.5" fill={b} />
      <Path d="M14 41h11l-2 9a4 4 0 0 1-4 3.5h-1a4 4 0 0 1-4-3.5z" fill={b} />
      <Rect x="9" y="49" width="17" height="7" rx="2.5" fill={a} />
      <Rect x="26" y="41" width="4" height="13" rx="2" fill={a} opacity={0.7} />
    </>
  ),
  'drill-set': (b, a) => (
    <>
      <Rect x="8" y="22" width="48" height="30" rx="4" fill={b} />
      <Rect x="8" y="34" width="48" height="3" fill={a} opacity={0.5} />
      <Rect x="25" y="16" width="14" height="7" rx="3.5" fill={a} />
      <Rect x="14" y="40" width="7" height="6" rx="1.5" fill={a} />
      <Rect x="43" y="40" width="7" height="6" rx="1.5" fill={a} />
    </>
  ),
  jigsaw: (b, a) => (
    <>
      <Path d="M18 16h16a6 6 0 0 1 6 6v10H18z" fill={b} />
      <Rect x="14" y="30" width="34" height="9" rx="3" fill={b} />
      <Rect x="10" y="39" width="42" height="5" rx="2" fill={a} />
      <Path d="M29 44h4v11l-2 3-2-3z" fill={a} />
      <Rect x="40" y="20" width="10" height="4" rx="2" fill={a} opacity={0.6} />
    </>
  ),
  'circular-saw': (b, a) => (
    <>
      <Circle cx="34" cy="30" r="15" fill={a} opacity={0.35} />
      <Circle cx="34" cy="30" r="6" fill={b} />
      <Path d="M12 22h20v14H12z" fill={b} />
      <Rect x="10" y="42" width="42" height="5" rx="2" fill={a} />
      <Rect x="12" y="14" width="14" height="5" rx="2.5" fill={a} />
    </>
  ),
  'pressure-washer': (b, a) => (
    <>
      <Rect x="10" y="24" width="26" height="26" rx="4" fill={b} />
      <Rect x="14" y="18" width="12" height="6" rx="3" fill={a} />
      <Circle cx="16" cy="50" r="4" fill={a} />
      <Circle cx="30" cy="50" r="4" fill={a} />
      <Path d="M36 32c8 0 8 8 14 8" stroke={a} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Rect x="48" y="34" width="10" height="4" rx="2" fill={b} />
    </>
  ),
  ladder: (b, a) => (
    <>
      <Path d="M22 10h5l-6 44h-5z" fill={b} />
      <Path d="M37 10h5l6 44h-5z" fill={b} />
      <Rect x="21" y="20" width="22" height="4" rx="1.5" fill={a} />
      <Rect x="19.5" y="32" width="25" height="4" rx="1.5" fill={a} />
      <Rect x="18" y="44" width="28" height="4" rx="1.5" fill={a} />
    </>
  ),
  'step-ladder': (b, a) => (
    <>
      <Path d="M22 10h5l-6 44h-5z" fill={b} />
      <Path d="M37 10h5l6 44h-5z" fill={b} />
      <Rect x="21" y="20" width="22" height="4" rx="1.5" fill={a} />
      <Rect x="19.5" y="32" width="25" height="4" rx="1.5" fill={a} />
      <Rect x="18" y="44" width="28" height="4" rx="1.5" fill={a} />
    </>
  ),
  'angle-grinder': (b, a) => (
    <>
      <Rect x="10" y="26" width="28" height="12" rx="6" fill={b} />
      <Circle cx="46" cy="32" r="12" fill={a} opacity={0.4} />
      <Circle cx="46" cy="32" r="4" fill={b} />
      <Rect x="34" y="18" width="5" height="12" rx="2.5" fill={a} />
    </>
  ),
  sander: (b, a) => (
    <>
      <Path d="M14 22h30a6 6 0 0 1 6 6v8H14z" fill={b} />
      <Rect x="12" y="36" width="40" height="8" rx="3" fill={a} />
      <Rect x="20" y="15" width="20" height="7" rx="3.5" fill={a} opacity={0.7} />
      <Rect x="18" y="44" width="4" height="4" rx="1" fill={b} opacity={0.5} />
      <Rect x="42" y="44" width="4" height="4" rx="1" fill={b} opacity={0.5} />
    </>
  ),
  'hedge-trimmer': (b, a) => (
    <>
      <Rect x="8" y="24" width="22" height="12" rx="5" fill={b} />
      <Rect x="30" y="27" width="28" height="5" rx="2" fill={a} />
      <Path d="M32 32h24v4h-2v-2h-3v2h-3v-2h-3v2h-3v-2h-3v2h-3v-2h-3v2h-1z" fill={b} />
      <Rect x="12" y="36" width="6" height="10" rx="3" fill={a} />
    </>
  ),
  'lawn-mower': (b, a) => (
    <>
      <Path d="M12 32h30v14H12z" fill={b} />
      <Path d="M42 32 54 16" stroke={b} strokeWidth={4} strokeLinecap="round" />
      <Rect x="48" y="12" width="12" height="4" rx="2" fill={a} />
      <Circle cx="18" cy="48" r="6" fill={a} />
      <Circle cx="38" cy="48" r="6" fill={a} />
    </>
  ),
  'wet-vacuum': (b, a) => (
    <>
      <Rect x="16" y="26" width="26" height="26" rx="5" fill={b} />
      <Rect x="18" y="18" width="22" height="9" rx="4" fill={a} />
      <Path d="M42 34c9 0 6-14 14-14" stroke={a} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Circle cx="22" cy="52" r="3" fill={a} />
      <Circle cx="36" cy="52" r="3" fill={a} />
    </>
  ),
  'tile-cutter': (b, a) => (
    <>
      <Rect x="8" y="38" width="48" height="8" rx="3" fill={b} />
      <Rect x="14" y="32" width="36" height="6" rx="2" fill={a} opacity={0.5} />
      <Circle cx="34" cy="26" r="8" fill={a} />
      <Rect x="10" y="20" width="22" height="4" rx="2" fill={b} />
    </>
  ),
  'socket-set': (b, a) => (
    <>
      <Rect x="8" y="20" width="48" height="30" rx="4" fill={b} />
      <Circle cx="19" cy="31" r="5" fill={a} />
      <Circle cx="32" cy="31" r="4" fill={a} />
      <Circle cx="43" cy="31" r="3.2" fill={a} />
      <Rect x="14" y="40" width="36" height="4" rx="2" fill={a} opacity={0.55} />
    </>
  ),
  'paint-sprayer': (b, a) => (
    <>
      <Path d="M26 20h16a4 4 0 0 1 4 4v8H26z" fill={b} />
      <Rect x="46" y="24" width="10" height="4" rx="2" fill={a} />
      <Path d="M28 32h10l-2 10h-6z" fill={b} />
      <Rect x="22" y="42" width="20" height="12" rx="4" fill={a} />
    </>
  ),
  'extension-cord': (b, a) => (
    <>
      <Circle cx="26" cy="32" r="16" fill="none" stroke={b} strokeWidth={5} />
      <Circle cx="26" cy="32" r="7" fill="none" stroke={a} strokeWidth={4} />
      <Rect x="42" y="28" width="14" height="9" rx="3" fill={a} />
    </>
  ),
  'tool-trolley': (b, a) => (
    <>
      <Rect x="14" y="14" width="6" height="34" rx="3" fill={b} />
      <Rect x="14" y="44" width="30" height="6" rx="3" fill={a} />
      <Rect x="22" y="22" width="24" height="20" rx="3" fill={b} opacity={0.85} />
      <Circle cx="20" cy="54" r="4" fill={a} />
      <Circle cx="42" cy="54" r="4" fill={a} />
    </>
  ),
};

/** Non-null: every key below is defined in BY_TOOL_TYPE above. */
const drawType = (key: string): Draw => BY_TOOL_TYPE[key] as Draw;

const BY_CATEGORY: Record<CategorySlug, Draw> = {
  'power-tools': (b, a) => drawType('cordless-drill')(b, a),
  'hand-tools': (b, a) => (
    <>
      <Rect x="10" y="28" width="28" height="7" rx="3.5" fill={a} />
      <Path d="M38 20h12v22H38z" fill={b} />
      <Rect x="14" y="40" width="32" height="6" rx="3" fill={b} opacity={0.5} />
    </>
  ),
  gardening: (b, a) => (
    <>
      <Path d="M32 12c8 6 12 13 12 20a12 12 0 0 1-24 0c0-7 4-14 12-20z" fill={a} />
      <Rect x="30" y="42" width="4" height="12" rx="2" fill={b} />
    </>
  ),
  cleaning: (b, a) => drawType('wet-vacuum')(b, a),
  ladders: (b, a) => drawType('ladder')(b, a),
  painting: (b, a) => (
    <>
      <Rect x="20" y="12" width="24" height="14" rx="3" fill={b} />
      <Rect x="30" y="26" width="4" height="10" fill={b} />
      <Rect x="24" y="36" width="16" height="18" rx="3" fill={a} />
    </>
  ),
  automotive: (b, a) => (
    <>
      <Path d="M12 36l6-12h28l6 12v10H12z" fill={b} />
      <Circle cx="22" cy="46" r="5" fill={a} />
      <Circle cx="42" cy="46" r="5" fill={a} />
    </>
  ),
  woodworking: (b, a) => (
    <>
      <Path d="M10 38l30-22 6 8-30 22z" fill={a} />
      <Path d="M44 12h10v12H44z" fill={b} />
      <Path d="M12 42h16v6H12z" fill={b} />
    </>
  ),
  'home-repair': (b, a) => (
    <>
      <Path d="M20 14a10 10 0 0 1 10 14l14 14a4 4 0 0 1-6 6L24 34a10 10 0 0 1-14-10 10 10 0 0 1 10-10z" fill={b} />
      <Circle cx="46" cy="18" r="6" fill={a} />
    </>
  ),
  moving: (b, a) => (
    <>
      <Rect x="14" y="20" width="36" height="26" rx="3" fill={b} />
      <Rect x="28" y="20" width="8" height="26" fill={a} />
    </>
  ),
  camping: (b, a) => (
    <>
      <Path d="M32 14l22 34H10z" fill={b} />
      <Path d="M32 30l10 18H22z" fill={a} />
    </>
  ),
  other: (b, a) => (
    <>
      <Circle cx="20" cy="32" r="5" fill={b} />
      <Circle cx="32" cy="32" r="5" fill={a} />
      <Circle cx="44" cy="32" r="5" fill={b} />
    </>
  ),
};

export function ToolIllustration({
  toolType,
  category,
  size = 96,
  rounded = 0,
}: {
  toolType?: string | null;
  category: CategorySlug;
  size?: number;
  rounded?: number;
}) {
  const { colors } = useTheme();

  const draw: Draw =
    (toolType ? BY_TOOL_TYPE[toolType] : undefined) ?? BY_CATEGORY[category] ?? BY_CATEGORY.other;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: '100%',
        height: '100%',
        minHeight: size,
        borderRadius: rounded,
        backgroundColor: colors.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size * 0.78} height={size * 0.78} viewBox="0 0 64 64">
        {draw(colors.textSecondary, colors.accent)}
      </Svg>
    </View>
  );
}
