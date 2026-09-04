import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Icon } from '@/components/domain/Icon';
import { Text } from '@/components/primitives';
import { useTheme } from '@/theme';
import type { Coords, ToolSummary } from '@/types/domain';

/**
 * A schematic map.
 *
 * `react-native-maps` needs a native module and a billed Google Maps key, so it
 * exists in a development build and nowhere else — not in Expo Go, not on web.
 * Rather than show a grey rectangle in the two places the product is actually
 * demonstrated, this draws the neighbourhood: streets, a park, water, and the
 * pins in their true relative positions.
 *
 * The pins are projected from real coordinates, so "the drill is north-east of
 * you, closer than the ladder" is accurate. What it is not is a street map you
 * could navigate by — and the caption says exactly that, because implying
 * otherwise about someone's home location is the one thing this must not do.
 */

const STREETS_H = [0.18, 0.42, 0.63, 0.86];
const STREETS_V = [0.22, 0.46, 0.72];

function project(
  point: Coords,
  centre: Coords,
  metresPerPx: number,
  width: number,
  height: number,
) {
  const latMetres = (point.latitude - centre.latitude) * 111_320;
  const lngMetres =
    (point.longitude - centre.longitude) * 111_320 * Math.cos((centre.latitude * Math.PI) / 180);
  return {
    x: width / 2 + lngMetres / metresPerPx,
    y: height / 2 - latMetres / metresPerPx,
  };
}

export function MapCanvas({
  tools,
  centre,
  radiusM,
  onSelect,
  height = 320,
}: {
  tools: ToolSummary[];
  centre: Coords;
  radiusM: number;
  onSelect: (tool: ToolSummary) => void;
  height?: number;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const [size, setSize] = React.useState({ width: 0, height });

  const { width } = size;
  // A little more than the radius, so pins at the edge are not clipped.
  const metresPerPx = width > 0 ? (radiusM * 2.4) / Math.min(width, height) : 1;

  const land = colors.surfaceSunken;
  const road = colors.surface;

  return (
    <View
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height })}
      style={{ height, backgroundColor: land, overflow: 'hidden' }}
      accessibilityLabel={t('search.approximateNote')}
    >
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            <Rect x={0} y={0} width={width} height={height} fill={land} />

            {/* A park and a watercourse, so the eye has something to orient by. */}
            <Rect
              x={width * 0.58}
              y={height * 0.08}
              width={width * 0.2}
              height={height * 0.14}
              rx={6}
              fill={colors.accent}
              opacity={0.14}
            />
            <Rect
              x={width * 0.7}
              y={height * 0.48}
              width={width * 0.16}
              height={height * 0.13}
              rx={6}
              fill={colors.accent}
              opacity={0.14}
            />
            <Path
              d={`M${-width * 0.05} ${height * 0.72} Q ${width * 0.16} ${height * 0.62} ${width * 0.24} ${height * 0.82} T ${width * 0.42} ${height * 1.05}`}
              stroke={colors.offer}
              strokeOpacity={0.25}
              strokeWidth={width * 0.035}
              fill="none"
            />

            {STREETS_H.map((f, i) => (
              <Path
                key={`h${f}`}
                d={`M0 ${height * f} H${width}`}
                stroke={road}
                strokeWidth={i % 2 === 0 ? 9 : 5}
                strokeLinecap="round"
              />
            ))}
            {STREETS_V.map((f, i) => (
              <Path
                key={`v${f}`}
                d={`M${width * f} 0 V${height}`}
                stroke={road}
                strokeWidth={i === 1 ? 9 : 5}
                strokeLinecap="round"
              />
            ))}
            <Path
              d={`M0 ${height * 1.02} L${width} ${height * 0.1}`}
              stroke={road}
              strokeWidth={6}
              strokeLinecap="round"
            />

            {/* You. The halo is the search radius, not GPS accuracy. */}
            <Circle
              cx={width / 2}
              cy={height / 2}
              r={Math.min(width, height) * 0.16}
              fill={colors.accent}
              opacity={0.12}
            />
            <Circle cx={width / 2} cy={height / 2} r={11} fill={colors.surface} />
            <Circle cx={width / 2} cy={height / 2} r={7} fill={colors.accent} />
          </Svg>

          {tools.slice(0, 24).map((tool) => {
            const { x, y } = project(tool.coords, centre, metresPerPx, width, height);
            if (x < 14 || y < 14 || x > width - 14 || y > height - 6) return null;
            const free = tool.paymentMode === 'free';
            return (
              <Pressable
                key={tool.id}
                onPress={() => onSelect(tool)}
                accessibilityRole="button"
                accessibilityLabel={tool.title}
                testID={`map-pin-${tool.id}`}
                hitSlop={8}
                style={{ position: 'absolute', left: x - 13, top: y - 30 }}
              >
                <Icon
                  name="pin"
                  filled
                  strokeWidth={0}
                  size={30}
                  color={free ? colors.accent : colors.offer}
                />
                <View
                  style={{
                    position: 'absolute',
                    left: 9.5,
                    top: 9,
                    width: 11,
                    height: 11,
                    borderRadius: 6,
                    backgroundColor: colors.surface,
                  }}
                />
              </Pressable>
            );
          })}

          <View
            style={{
              position: 'absolute',
              // Clear of the results sheet, which overlaps the map's foot.
              bottom: spacing.xxl,
              alignSelf: 'center',
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text variant="caption" tone="muted">
              {t('search.approximateNote')}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
