import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { markerGeometry, markerColour, markerSvg, meSvg, MARKER_COLOURS } from './markers';
import { OSM_ATTRIBUTION, OSM_TILES, zoomForRadius, type StreetMapProps } from './types';

/**
 * A real street map, on the web.
 *
 * Leaflet against OpenStreetMap tiles: actual named streets and building
 * outlines, no API key, no billing, and nothing to set up. It replaces a
 * hand-drawn schematic whose streets were invented — honest about being
 * approximate, and useless for the one job a map has here, which is getting
 * someone to a doorway.
 *
 * The map object is created ONCE and then mutated. Re-creating it on every
 * render would re-request every tile, which is both slow and rude to a tile
 * server we are using for free.
 */
export function StreetMap({
  centre,
  radiusM = 500,
  markers = [],
  circles = [],
  me,
  height = 260,
  onMarkerPress,
  testID,
}: StreetMapProps) {
  const { colors, radius } = useTheme();
  const host = useRef<View & HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlays = useRef<L.Layer[]>([]);
  const meLayers = useRef<L.Layer[]>([]);

  // ── create once ──────────────────────────────────────────────────────────
  useEffect(() => {
    const node = host.current as unknown as HTMLDivElement | null;
    if (!node || map.current) return;

    const instance = L.map(node, {
      center: [centre.latitude, centre.longitude],
      zoom: zoomForRadius(radiusM, centre.latitude),
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(instance);
    map.current = instance;

    // Leaflet measures its container on creation. Inside a freshly laid-out
    // React tree that measurement is often zero, and the result is a map that
    // paints one tile in the corner until something else forces a resize.
    const settle = setTimeout(() => instance.invalidateSize(), 120);
    return () => {
      clearTimeout(settle);
      instance.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── markers and circles ──────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const layer of overlays.current) layer.remove();
    overlays.current = [];

    for (const circle of circles) {
      const colour = circle.kind === 'search' ? colors.accent : MARKER_COLOURS.tool;
      overlays.current.push(
        L.circle([circle.coords.latitude, circle.coords.longitude], {
          radius: circle.radiusM,
          color: colour,
          weight: 1,
          fillColor: colour,
          fillOpacity: circle.kind === 'search' ? 0.06 : 0.14,
          interactive: false,
        }).addTo(instance),
      );
    }

    for (const marker of markers) {
      const { size, anchor } = markerGeometry(marker.kind);
      const pin = L.marker([marker.coords.latitude, marker.coords.longitude], {
        icon: L.divIcon({
          html: markerSvg(marker.kind, markerColour(marker)),
          className: '',
          iconSize: size,
          iconAnchor: anchor,
        }),
        title: marker.label,
        keyboard: Boolean(onMarkerPress),
      }).addTo(instance);

      if (onMarkerPress) pin.on('click', () => onMarkerPress(marker.id));
      overlays.current.push(pin);
    }
  }, [markers, circles, colors.accent, onMarkerPress]);

  // ── where you are ────────────────────────────────────────────────────────
  // Separate from the markers effect: your position updates every few seconds
  // while you walk, and redrawing every pin each time it moves would make the
  // whole map flicker.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const layer of meLayers.current) layer.remove();
    meLayers.current = [];
    if (!me) return;

    const at: L.LatLngExpression = [me.coords.latitude, me.coords.longitude];
    if (me.accuracyM && me.accuracyM > 15) {
      meLayers.current.push(
        L.circle(at, {
          radius: me.accuracyM,
          color: MARKER_COLOURS.me,
          weight: 1,
          fillColor: MARKER_COLOURS.me,
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(instance),
      );
    }
    meLayers.current.push(
      L.marker(at, {
        icon: L.divIcon({ html: meSvg(), className: '', iconSize: [20, 20], iconAnchor: [10, 10] }),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(instance),
    );
  }, [me]);

  // ── recentre when the subject changes ────────────────────────────────────
  useEffect(() => {
    map.current?.setView(
      [centre.latitude, centre.longitude],
      zoomForRadius(radiusM, centre.latitude),
      { animate: true },
    );
  }, [centre.latitude, centre.longitude, radiusM]);

  return (
    <View
      testID={testID}
      // react-native-web hands a View ref the underlying DOM node, which is
      // exactly what Leaflet needs to mount into.
      ref={host as never}
      style={{
        height,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: colors.surfaceSunken,
      }}
    />
  );
}
