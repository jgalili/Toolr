import type { Coords } from '@/types/domain';

/**
 * The map contract, shared by the web and native implementations.
 *
 * Kept deliberately small and declarative — you hand it what should be on the
 * map, not instructions for drawing it. The two implementations then have no
 * room to disagree about what a "pickup" pin looks like or which circle means
 * "approximate", which is exactly the sort of drift that makes a location
 * feature untrustworthy.
 */

export type MarkerKind =
  /** A listing, at its FUZZED point. Never a home address. */
  | 'tool'
  /** An exact pickup address. Only ever after the owner has accepted. */
  | 'pickup';

export type MapMarker = {
  id: string;
  coords: Coords;
  kind: MarkerKind;
  label?: string;
  /** Free listings are the point of the product, so they read differently. */
  free?: boolean;
};

export type MapCircle = {
  id: string;
  coords: Coords;
  radiusM: number;
  /** 'search' is the area you are browsing; 'approx' is "somewhere in here". */
  kind: 'search' | 'approx';
};

/** Where the phone thinks you are, and how sure it is. */
export type MePosition = {
  coords: Coords;
  /** Radius of the accuracy circle, in metres. */
  accuracyM: number | null;
};

export type StreetMapProps = {
  centre: Coords;
  /** Frames the initial view. Ignored once the user pans or zooms. */
  radiusM?: number;
  markers?: MapMarker[];
  circles?: MapCircle[];
  me?: MePosition | null;
  height?: number;
  onMarkerPress?: (id: string) => void;
  testID?: string;
};

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap';

/**
 * A zoom level that fits `radiusM` either side of the centre.
 *
 * Derived rather than guessed: at zoom z, one tile spans 360/2^z degrees of
 * longitude, so this inverts that for the span we want and clamps to the
 * levels where OSM actually has street detail.
 */
export function zoomForRadius(radiusM: number, latitude: number): number {
  const metresPerDegree = 111_320 * Math.cos((latitude * Math.PI) / 180);
  const spanDegrees = (radiusM * 2.4) / Math.max(1, metresPerDegree);
  const zoom = Math.log2(360 / Math.max(0.0005, spanDegrees));
  return Math.min(18, Math.max(11, Math.round(zoom)));
}
