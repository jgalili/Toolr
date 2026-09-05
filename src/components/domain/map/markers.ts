import type { MapMarker, MarkerKind } from './types';

/**
 * Marker art, as inline SVG.
 *
 * Leaflet's default markers are PNGs referenced by relative URL, which a
 * bundler rewrites and then fails to serve — the classic "my markers are
 * invisible" bug. Drawing them ourselves avoids that entirely, costs no
 * network request, and lets a pin and a circle mean two different things:
 *
 *   a PIN     is a real address you can walk to        (pickup)
 *   a DOT     is an approximate point                  (a listing)
 *
 * That distinction is not cosmetic. Showing a listing with a sharp pin would
 * imply a precision the location model deliberately does not have.
 */

export const MARKER_COLOURS = {
  tool: '#0E9AA7',
  toolPaid: '#2F80ED',
  pickup: '#D64545',
  me: '#2F80ED',
} as const;

export function markerColour(marker: Pick<MapMarker, 'kind' | 'free'>): string {
  if (marker.kind === 'pickup') return MARKER_COLOURS.pickup;
  return marker.free === false ? MARKER_COLOURS.toolPaid : MARKER_COLOURS.tool;
}

/** A teardrop pin, anchored at its point. */
export function pinSvg(colour: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
  <path d="M15 39C15 39 28 23.6 28 14.6A13 13 0 1 0 2 14.6C2 23.6 15 39 15 39Z"
        fill="${colour}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="15" cy="14.2" r="4.6" fill="#ffffff"/>
</svg>`;
}

/** A soft dot, for a point that is only approximately right. */
export function dotSvg(colour: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="9" fill="${colour}" fill-opacity="0.25"/>
  <circle cx="11" cy="11" r="5.5" fill="${colour}" stroke="#ffffff" stroke-width="2"/>
</svg>`;
}

/** The "you are here" dot. Always blue, always the same, on every platform. */
export function meSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <circle cx="10" cy="10" r="8" fill="${MARKER_COLOURS.me}" fill-opacity="0.25"/>
  <circle cx="10" cy="10" r="5" fill="${MARKER_COLOURS.me}" stroke="#ffffff" stroke-width="2.5"/>
</svg>`;
}

export function markerSvg(kind: MarkerKind, colour: string): string {
  return kind === 'pickup' ? pinSvg(colour) : dotSvg(colour);
}

/** [width, height] and the pixel inside it that sits on the coordinate. */
export function markerGeometry(kind: MarkerKind): {
  size: [number, number];
  anchor: [number, number];
} {
  return kind === 'pickup'
    ? { size: [30, 40], anchor: [15, 39] }
    : { size: [22, 22], anchor: [11, 11] };
}
