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
 *
 * NOTE its blind spot, which is why `boundsForRadius` exists below: the maths
 * assumes a 256px-wide viewport, because that is a tile. A real map pane is
 * 350px on a phone and can be 1200px on a laptop, and every doubling of width
 * costs a whole zoom level — so on a wide screen this alone frames a pickup
 * two levels too far out, which is the difference between seeing the doorway
 * and seeing the district. Use it only where the container is unknown (the
 * first paint of the native WebView); prefer fitting real bounds everywhere
 * else, and let the map measure itself.
 */
export function zoomForRadius(radiusM: number, latitude: number): number {
  const metresPerDegree = 111_320 * Math.cos((latitude * Math.PI) / 180);
  const spanDegrees = (radiusM * 2.4) / Math.max(1, metresPerDegree);
  const zoom = Math.log2(360 / Math.max(0.0005, spanDegrees));
  return Math.min(18, Math.max(11, Math.round(zoom)));
}

/** [[south, west], [north, east]] — the box a map should frame. */
export type LatLngBounds = [[number, number], [number, number]];

/**
 * The box `radiusM` either side of a point.
 *
 * Handed to Leaflet's fitBounds, which knows how wide the pane actually is and
 * picks the zoom accordingly. That is the whole fix: the container measures
 * itself instead of us assuming a tile-sized one.
 *
 * A degree of latitude is ~111.32 km anywhere; a degree of longitude shrinks
 * with the cosine of the latitude, so the two are computed separately — at Tel
 * Aviv's 32 degrees the longitude degree is already 15% shorter, and squaring
 * that away would stretch the box east-west.
 */
export function boundsForRadius(centre: Coords, radiusM: number): LatLngBounds {
  const metres = Math.max(25, radiusM);
  const dLat = metres / 111_320;
  const dLng = metres / Math.max(1, 111_320 * Math.cos((centre.latitude * Math.PI) / 180));
  return [
    [centre.latitude - dLat, centre.longitude - dLng],
    [centre.latitude + dLat, centre.longitude + dLng],
  ];
}

/**
 * How close a map may zoom when fitting bounds.
 *
 * Without a ceiling, fitting a 25m box lands on zoom 19-20, where OSM has no
 * tiles for most of the world and the pane goes grey — a blank map being
 * exactly the complaint this whole change is answering.
 */
export const MAX_FIT_ZOOM = 18;
