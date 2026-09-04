import React from 'react';

import type { Coords, ToolSummary } from '@/types/domain';

import { MapCanvas } from './MapCanvas';

/**
 * Web build. `react-native-maps` is Android/iOS only, so the web preview gets
 * the same schematic map the Expo Go build gets — pins in their true relative
 * positions on a drawn neighbourhood, with the "approximate" caption intact.
 */
export function ToolMap(props: {
  tools: ToolSummary[];
  centre: Coords;
  radiusM: number;
  onSelect: (tool: ToolSummary) => void;
}) {
  return <MapCanvas {...props} />;
}
