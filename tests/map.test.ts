import {
  MARKER_COLOURS,
  markerColour,
  markerGeometry,
  markerSvg,
} from '../src/components/domain/map/markers';
import { MAX_FIT_ZOOM, boundsForRadius, zoomForRadius } from '../src/components/domain/map/types';

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

describe('boundsForRadius', () => {
  const TEL_AVIV = { latitude: 32.0553, longitude: 34.7688 };

  it('puts the centre in the middle of the box', () => {
    const [[south, west], [north, east]] = boundsForRadius(TEL_AVIV, 300);
    expect((south + north) / 2).toBeCloseTo(TEL_AVIV.latitude, 9);
    expect((west + east) / 2).toBeCloseTo(TEL_AVIV.longitude, 9);
  });

  it('reaches the radius asked for, north and east', () => {
    const metres = 250;
    const [[south, west], [north, east]] = boundsForRadius(TEL_AVIV, metres);
    // A degree of latitude is ~111.32 km everywhere.
    expect(((north - south) / 2) * 111_320).toBeCloseTo(metres, 0);
    // A degree of longitude is that, times cos(lat).
    const lngMetres = ((east - west) / 2) * 111_320 * Math.cos((TEL_AVIV.latitude * Math.PI) / 180);
    expect(lngMetres).toBeCloseTo(metres, 0);
  });

  it('makes the box WIDER in degrees than it is TALL, away from the equator', () => {
    // The mistake this guards against is using one metres-per-degree figure
    // for both axes: at 32 degrees a longitude degree is ~15% shorter, so an
    // equal-degree box is squashed east-west and the pin drifts off-centre.
    const [[south, west], [north, east]] = boundsForRadius(TEL_AVIV, 500);
    expect(east - west).toBeGreaterThan(north - south);
  });

  it('is square in degrees at the equator, where the two agree', () => {
    const [[south, west], [north, east]] = boundsForRadius({ latitude: 0, longitude: 0 }, 500);
    expect(east - west).toBeCloseTo(north - south, 9);
  });

  it('never asks for a box so small the map zooms past where tiles exist', () => {
    // fitBounds on a 1m box would land at zoom 20+, which OSM does not serve
    // for most of the world -- a grey pane, which is the reported bug.
    const [[south], [north]] = boundsForRadius(TEL_AVIV, 1);
    expect((north - south) * 111_320).toBeGreaterThanOrEqual(40);
    expect(MAX_FIT_ZOOM).toBeLessThanOrEqual(18);
  });

  it('frames a pickup tighter than the old tile-sized guess did', () => {
    // The regression in one line: zoomForRadius assumes a 256px pane. On a
    // 768px one it is two whole levels too far out. Fitting these bounds lets
    // the pane pick for itself, so this only asserts the input is honest --
    // exactly 2 x radius across, no padding baked in.
    const metres = 220;
    const [[south], [north]] = boundsForRadius(TEL_AVIV, metres);
    expect((north - south) * 111_320).toBeCloseTo(metres * 2, 0);
  });
});
