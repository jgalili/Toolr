import {
  MARKER_COLOURS,
  markerColour,
  markerGeometry,
  markerSvg,
} from '../src/components/domain/map/markers';
import { zoomForRadius } from '../src/components/domain/map/types';

describe('zoomForRadius', () => {
  it('zooms in as the area of interest shrinks', () => {
    const wide = zoomForRadius(3000, 32.05);
    const near = zoomForRadius(200, 32.05);
    expect(near).toBeGreaterThan(wide);
  });

  it('stays inside the range where OSM actually has street detail', () => {
    for (const radius of [1, 50, 500, 5000, 500_000]) {
      const zoom = zoomForRadius(radius, 32.05);
      expect(zoom).toBeGreaterThanOrEqual(11);
      expect(zoom).toBeLessThanOrEqual(18);
      expect(Number.isInteger(zoom)).toBe(true);
    }
  });

  it('frames a pickup close enough to see the doorway', () => {
    // 220 m is what the pickup screen asks for; anything below ~16 puts the
    // building in a block of undifferentiated grey.
    expect(zoomForRadius(220, 32.05)).toBeGreaterThanOrEqual(16);
  });

  it('accounts for latitude the way Web Mercator actually behaves', () => {
    // Ground resolution is 156543 * cos(lat) / 2^z metres per pixel, so the
    // SAME distance in metres needs a LOWER zoom the further you are from the
    // equator. Getting this backwards is the reason maps look over-zoomed in
    // Scandinavia -- and Tel Aviv at 32 degrees is far enough north to notice.
    expect(zoomForRadius(500, 60)).toBeLessThan(zoomForRadius(500, 0));
  });
});

describe('markers', () => {
  it('anchors a pickup pin at its POINT and a listing dot at its CENTRE', () => {
    // The classic off-by-a-marker bug: a teardrop anchored at its middle sits
    // half a building north of where it means, and on a pickup screen that is
    // the difference between the right door and the neighbour's.
    const pin = markerGeometry('pickup');
    expect(pin.anchor[1]).toBeGreaterThan(pin.size[1] * 0.9);
    expect(pin.anchor[0]).toBe(pin.size[0] / 2);

    const dot = markerGeometry('tool');
    expect(dot.anchor).toEqual([dot.size[0] / 2, dot.size[1] / 2]);
  });

  it('keeps a pickup visually distinct from a listing', () => {
    expect(markerColour({ kind: 'pickup' })).toBe(MARKER_COLOURS.pickup);
    expect(markerColour({ kind: 'tool', free: true })).not.toBe(MARKER_COLOURS.pickup);
  });

  it('tells free listings from paid ones', () => {
    expect(markerColour({ kind: 'tool', free: true })).not.toBe(
      markerColour({ kind: 'tool', free: false }),
    );
  });

  it('draws a sharp pin only for an exact address', () => {
    // A listing is a fuzzed point. Drawing it as a pin would claim a precision
    // the location model deliberately does not have.
    expect(markerSvg('pickup', '#000')).toMatch(/<path/);
    expect(markerSvg('tool', '#000')).not.toMatch(/<path/);
  });

  it('fetches nothing, so a bundler cannot break the icons', () => {
    // Leaflet's stock markers are PNGs loaded by relative URL, which a bundler
    // rewrites and then fails to serve -- the classic invisible-markers bug.
    // The xmlns is a namespace, not a request, so it is not what this looks for.
    for (const svg of [markerSvg('pickup', '#000'), markerSvg('tool', '#000')]) {
      expect(svg).not.toMatch(/url\(|<image|xlink:href|\bsrc=/);
    }
  });
});
