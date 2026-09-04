import * as Location from 'expo-location';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { capture } from '@/lib/analytics';
import { DEFAULTS } from '@/lib/config';
import type { Coords } from '@/types/domain';

export type LocationStatus = 'unknown' | 'granted' | 'denied' | 'manual';

type LocationState = {
  centre: Coords;
  neighbourhood: string;
  status: LocationStatus;
  loading: boolean;
  request(): Promise<LocationStatus>;
  setManualArea(coords: Coords, label: string): void;
};

const LocationContext = createContext<LocationState | null>(null);

/**
 * Location.
 *
 * We ask for COARSE accuracy: the product needs "which neighbourhood are you
 * in", not "which room". Denial is never a dead end — the manual area picker
 * keeps every screen working, which is why `centre` always has a value.
 */
export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [centre, setCentre] = useState<Coords>(DEFAULTS.fallbackCoords);
  const [neighbourhood, setNeighbourhood] = useState<string>(DEFAULTS.fallbackNeighbourhood);
  const [status, setStatus] = useState<LocationStatus>('unknown');
  const [loading, setLoading] = useState(false);

  const resolve = useCallback(async () => {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    const coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    setCentre(coords);

    // Reverse geocoding on-device: free, and it means we never send a
    // coordinate to a geocoding API just to render a neighbourhood name.
    try {
      const [place] = await Location.reverseGeocodeAsync(coords);
      const label = place?.district ?? place?.subregion ?? place?.city ?? null;
      if (label) setNeighbourhood(label);
    } catch {
      // keep whatever label we had
    }
  }, []);

  const request = useCallback(async (): Promise<LocationStatus> => {
    setLoading(true);
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      capture('location_permission_result', { granted: permission === 'granted' });

      if (permission !== 'granted') {
        setStatus('denied');
        return 'denied';
      }
      await resolve();
      setStatus('granted');
      return 'granted';
    } catch {
      setStatus('denied');
      return 'denied';
    } finally {
      setLoading(false);
    }
  }, [resolve]);

  // Only re-read an already-granted permission on boot. We never trigger the
  // system prompt here — permissions are requested in context, after a screen
  // has explained why.
  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then(async ({ status: permission }) => {
        if (cancelled || permission !== 'granted') return;
        setStatus('granted');
        await resolve();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  const setManualArea = useCallback((coords: Coords, label: string) => {
    setCentre(coords);
    setNeighbourhood(label);
    setStatus('manual');
  }, []);

  const value = useMemo<LocationState>(
    () => ({ centre, neighbourhood, status, loading, request, setManualArea }),
    [centre, neighbourhood, status, loading, request, setManualArea],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used inside <LocationProvider>');
  return ctx;
}

/** Neighbourhood centroids for the manual picker when location is refused. */
export const MANUAL_AREAS: { label: string; coords: Coords }[] = [
  { label: 'Florentin', coords: { latitude: 32.0553, longitude: 34.7688 } },
  { label: 'Neve Tzedek', coords: { latitude: 32.0625, longitude: 34.7635 } },
  { label: 'Shapira', coords: { latitude: 32.0489, longitude: 34.7797 } },
  { label: 'Rothschild', coords: { latitude: 32.0648, longitude: 34.7738 } },
  { label: 'Jaffa', coords: { latitude: 32.0533, longitude: 34.7519 } },
  { label: 'Ramat Aviv', coords: { latitude: 32.1133, longitude: 34.8044 } },
];
