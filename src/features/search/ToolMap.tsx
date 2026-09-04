import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/primitives';
import { regionForRadius } from '@/lib/geo';
import { useTheme } from '@/theme';
import type { Coords, ToolSummary } from '@/types/domain';

import { MapCanvas } from './MapCanvas';

/**
 * The map.
 *
 * Every pin is the FUZZED point — a stable 100–200 m offset — never a home
 * address. The footnote saying so is not decoration: people are entitled to
 * know what the pin does and does not mean.
 *
 * `react-native-maps` is a native module, so it does not exist inside Expo Go.
 * Importing it there resolves fine and then throws when the view mounts, which
 * is a red screen rather than a degraded map — so we check the execution
 * environment first and draw the schematic map instead.
 */

const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Google Maps on Android refuses to draw without a billed API key. `app.json`
 * ships a placeholder so the file is honest about needing one, which means a
 * build made before anyone has set it renders a blank grey rectangle where the
 * map should be — worse than the schematic map, and mystifying.
 *
 * So the key is a condition, not an assumption: no real key, no native map.
 */
const MAPS_KEY = (
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey ?? ''
).trim();
const HAS_MAPS_KEY = MAPS_KEY.length > 0 && !MAPS_KEY.startsWith('SET_VIA_');

type Props = {
  tools: ToolSummary[];
  centre: Coords;
  radiusM: number;
  onSelect: (tool: ToolSummary) => void;
};

function NativeMap({ tools, centre, radiusM, onSelect }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const region = useRef(regionForRadius(centre, radiusM)).current;

  // Required lazily: the module must not be evaluated at all inside Expo Go.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Maps = require('react-native-maps');
  const MapView = Maps.default;
  const { Circle, Marker, PROVIDER_GOOGLE } = Maps;

  return (
    <View style={{ height: 320 }}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        <Circle
          center={centre}
          radius={radiusM}
          strokeColor={colors.accent}
          fillColor={`${colors.accent}14`}
          strokeWidth={1}
        />
        {tools.map((tool) => (
          <Marker
            key={tool.id}
            coordinate={tool.coords}
            title={tool.title}
            description={tool.neighbourhood ?? undefined}
            pinColor={tool.paymentMode === 'free' ? colors.accent : colors.offer}
            onCalloutPress={() => onSelect(tool)}
            onPress={() => onSelect(tool)}
          />
        ))}
      </MapView>

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

export function ToolMap(props: Props) {
  if (IS_EXPO_GO || !HAS_MAPS_KEY) return <MapCanvas {...props} />;
  try {
    return <NativeMap {...props} />;
  } catch {
    // A missing key or a bad build should degrade, not crash the tab.
    return <MapCanvas {...props} />;
  }
}
