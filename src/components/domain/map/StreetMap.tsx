import React, { useCallback, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useTheme } from '@/theme';

import { markerColour, markerGeometry, markerSvg, meSvg, MARKER_COLOURS } from './markers';
import {
  MAX_FIT_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILES,
  boundsForRadius,
  zoomForRadius,
  type StreetMapProps,
} from './types';

/**
 * The same real street map, on a phone.
 *
 * `react-native-maps` is Google Maps on Android, and Google Maps will not draw
 * a single tile without a billed API key. That is why the app used to fall back
 * to a hand-drawn schematic: no key, no map. Leaflet inside a WebView needs no
 * key at all, so the map works in a plain APK, in Expo Go, and on the web from
 * one description of what should be on it.
 *
 * The document is built ONCE and then talked to. Rebuilding the HTML whenever
 * a position updates would tear down the map and re-fetch every tile, several
 * times a minute, while someone walks.
 */

const CDN = 'https://unpkg.com/leaflet@1.9.4/dist';

function buildHtml(centre: { latitude: number; longitude: number }, zoom: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="${CDN}/leaflet.css" />
<script src="${CDN}/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #e9edf0; }
  .leaflet-container { background: #e9edf0; font: 12px -apple-system, Roboto, sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: true })
             .setView([${centre.latitude}, ${centre.longitude}], ${zoom});
  L.tileLayer('${OSM_TILES}', { maxZoom: 19, attribution: '${OSM_ATTRIBUTION}' }).addTo(map);

  var overlays = [], meLayers = [];
  function clear(list) { list.forEach(function (l) { map.removeLayer(l); }); return []; }
  function post(payload) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  window.__setOverlays = function (data) {
    overlays = clear(overlays);
    data.circles.forEach(function (c) {
      overlays.push(L.circle([c.lat, c.lng], {
        radius: c.radiusM, color: c.colour, weight: 1,
        fillColor: c.colour, fillOpacity: c.fill, interactive: false
      }).addTo(map));
    });
    data.markers.forEach(function (m) {
      var pin = L.marker([m.lat, m.lng], {
        icon: L.divIcon({ html: m.svg, className: '', iconSize: m.size, iconAnchor: m.anchor }),
        title: m.label || ''
      }).addTo(map);
      pin.on('click', function () { post({ type: 'marker', id: m.id }); });
      overlays.push(pin);
    });
  };

  window.__setMe = function (me) {
    meLayers = clear(meLayers);
    if (!me) return;
    if (me.accuracyM && me.accuracyM > 15) {
      meLayers.push(L.circle([me.lat, me.lng], {
        radius: me.accuracyM, color: '${MARKER_COLOURS.me}', weight: 1,
        fillColor: '${MARKER_COLOURS.me}', fillOpacity: 0.1, interactive: false
      }).addTo(map));
    }
    meLayers.push(L.marker([me.lat, me.lng], {
      icon: L.divIcon({ html: me.svg, className: '', iconSize: [20, 20], iconAnchor: [10, 10] }),
      interactive: false, zIndexOffset: 500
    }).addTo(map));
  };

  // Fitting a box beats setting a zoom, because only the WebView knows how
  // wide it actually is. zoomForRadius has to assume a 256px-wide pane, and
  // every doubling past that costs a whole zoom level -- on a phone in
  // landscape, or a tablet, that framed a pickup a couple of streets too wide.
  window.__fit = function (south, west, north, east) {
    map.fitBounds([[south, west], [north, east]], { maxZoom: ${MAX_FIT_ZOOM}, animate: true });
  };
  window.__setView = function (lat, lng, z) { map.setView([lat, lng], z, { animate: true }); };
  post({ type: 'ready' });
</script>
</body>
</html>`;
}

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
  const web = useRef<WebView>(null);

  // The document must not change identity when a marker moves, or the WebView
  // reloads and every tile is fetched again.
  const html = useRef(buildHtml(centre, zoomForRadius(radiusM, centre.latitude))).current;

  const overlayPayload = useMemo(
    () =>
      JSON.stringify({
        circles: circles.map((c) => ({
          lat: c.coords.latitude,
          lng: c.coords.longitude,
          radiusM: c.radiusM,
          colour: c.kind === 'search' ? colors.accent : MARKER_COLOURS.tool,
          fill: c.kind === 'search' ? 0.06 : 0.14,
        })),
        markers: markers.map((m) => {
          const { size, anchor } = markerGeometry(m.kind);
          return {
            id: m.id,
            lat: m.coords.latitude,
            lng: m.coords.longitude,
            label: m.label ?? '',
            svg: markerSvg(m.kind, markerColour(m)),
            size,
            anchor,
          };
        }),
      }),
    [markers, circles, colors.accent],
  );

  const mePayload = useMemo(
    () =>
      me
        ? JSON.stringify({
            lat: me.coords.latitude,
            lng: me.coords.longitude,
            accuracyM: me.accuracyM,
            svg: meSvg(),
          })
        : 'null',
    [me],
  );

  const push = useCallback(() => {
    web.current?.injectJavaScript(
      `window.__setOverlays && window.__setOverlays(${overlayPayload});
       window.__setMe && window.__setMe(${mePayload}); true;`,
    );
  }, [overlayPayload, mePayload]);

  // Every render that changes either payload pushes it. Cheap: it is a string
  // through a bridge, not a reload.
  React.useEffect(push, [push]);

  React.useEffect(() => {
    const [[south, west], [north, east]] = boundsForRadius(centre, radiusM);
    web.current?.injectJavaScript(
      `window.__fit && window.__fit(${south}, ${west}, ${north}, ${east}); true;`,
    );
    // See the web implementation: `centre` is a new object every render, so the
    // primitives are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centre.latitude, centre.longitude, radiusM]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as { type: string; id?: string };
        if (data.type === 'ready') {
          push();
          const [[south, west], [north, east]] = boundsForRadius(centre, radiusM);
          web.current?.injectJavaScript(
            `window.__fit && window.__fit(${south}, ${west}, ${north}, ${east}); true;`,
          );
        }
        if (data.type === 'marker' && data.id) onMarkerPress?.(data.id);
      } catch {
        // A message we do not understand is not worth crashing a map over.
      }
    },
    [onMarkerPress, push, centre, radiusM],
  );

  return (
    <View
      testID={testID}
      style={{
        height,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: colors.surfaceSunken,
      }}
    >
      <WebView
        ref={web}
        source={{ html }}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
