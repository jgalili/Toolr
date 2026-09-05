import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { StreetMap } from '@/components/domain/map/StreetMap';
import type { MapMarker } from '@/components/domain/map/types';
import { Text } from '@/components/primitives';
import { useLiveLocation } from '@/features/location/useLiveLocation';
import { useTheme } from '@/theme';
import type { Coords, ToolSummary } from '@/types/domain';

/**
 * The map.
 *
 * Real streets, from OpenStreetMap. It used to draw a schematic — invented
 * roads in roughly the right arrangement — because `react-native-maps` is
 * Google Maps on Android and will not render a tile without a billed API key.
 * That was honest about being approximate and no use at all for finding
 * anything, which is the only reason a map is here.
 *
 * Every marker is still the FUZZED point: a stable 100–200 m offset, never a
 * home address. A real basemap makes that distinction MORE important, not less
 * — on a schematic nobody could have mistaken a dot for a doorway, and on a
 * street map they might. So listings are soft dots rather than sharp pins, and
 * the caption underneath says what they mean.
 */

type Props = {
  tools: ToolSummary[];
  centre: Coords;
  radiusM: number;
  onSelect: (tool: ToolSummary) => void;
};

export function ToolMap({ tools, centre, radiusM, onSelect }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const me = useLiveLocation(true);

  const markers = useMemo<MapMarker[]>(
    () =>
      tools.map((tool) => ({
        id: tool.id,
        coords: tool.coords,
        kind: 'tool',
        label: tool.title,
        free: tool.paymentMode === 'free',
      })),
    [tools],
  );

  const circles = useMemo(
    () => [{ id: 'search', coords: centre, radiusM, kind: 'search' as const }],
    [centre, radiusM],
  );

  return (
    <View style={{ height: 320 }}>
      <StreetMap
        testID="tool-map"
        centre={centre}
        radiusM={radiusM}
        height={320}
        markers={markers}
        circles={circles}
        me={me.coords ? { coords: me.coords, accuracyM: me.accuracyM } : null}
        onMarkerPress={(id) => {
          const tool = tools.find((candidate) => candidate.id === id);
          if (tool) onSelect(tool);
        }}
      />

      <View
        style={{
          position: 'absolute',
          bottom: spacing.sm,
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
    </View>
  );
}
