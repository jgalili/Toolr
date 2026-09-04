import type { Coords } from '@/types/domain';

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * Used only for demo data and for map-region maths. Real search distances come
 * from PostGIS, because computing them on the device would mean shipping every
 * owner's location to every phone — which is the thing the whole location
 * privacy model exists to prevent.
 */
export function distanceMetres(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Latitude/longitude deltas that cover `radiusM` — for framing the map. */
export function regionForRadius(centre: Coords, radiusM: number) {
  const latitudeDelta = (radiusM * 2.6) / 111_320;
  const longitudeDelta =
    (radiusM * 2.6) / (111_320 * Math.cos(toRad(centre.latitude)) || 1);
  return {
    latitude: centre.latitude,
    longitude: centre.longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

/** Rough radius in metres implied by a visible map region. */
export function radiusForRegion(region: { latitudeDelta: number }): number {
  return Math.round((region.latitudeDelta * 111_320) / 2.6);
}
