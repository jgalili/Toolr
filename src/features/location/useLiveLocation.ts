import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import type { Coords } from '@/types/domain';

/**
 * Where you are, updated as you walk.
 *
 * Deliberately separate from `useLocation`, which answers "which neighbourhood
 * am I browsing" and asks for COARSE accuracy on purpose. This one is for the
 * five minutes you spend walking to a doorway, so it asks for the best fix the
 * device will give and watches it continuously.
 *
 * It runs only while a screen that needs it is mounted. A permanent high-
 * accuracy watch is the single most effective way to flatten a phone battery,
 * and nothing about lending a drill justifies it.
 */

export type LiveLocation = {
  coords: Coords | null;
  accuracyM: number | null;
  /** 'idle' before we ask, 'denied' if the person said no — never a dead end. */
  status: 'idle' | 'asking' | 'watching' | 'denied' | 'unavailable';
};

export function useLiveLocation(enabled: boolean): LiveLocation {
  const [state, setState] = useState<LiveLocation>({
    coords: null,
    accuracyM: null,
    status: 'idle',
  });
  const subscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setState((s) => ({ ...s, status: 'asking' }));
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setState({ coords: null, accuracyM: null, status: 'denied' });
          return;
        }

        subscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            // Every 5 m or 4 s, whichever comes first. Frequent enough that the
            // distance visibly counts down as you walk; sparse enough not to
            // wake the GPS continuously.
            distanceInterval: 5,
            timeInterval: 4000,
          },
          (position) => {
            if (cancelled) return;
            setState({
              coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              },
              accuracyM: position.coords.accuracy ?? null,
              status: 'watching',
            });
          },
        );
      } catch {
        // No GPS, no browser geolocation, a desktop — all the same answer:
        // the map still works, it just cannot show a blue dot.
        if (!cancelled) setState({ coords: null, accuracyM: null, status: 'unavailable' });
      }
    })();

    return () => {
      cancelled = true;
      subscription.current?.remove();
      subscription.current = null;
    };
  }, [enabled]);

  return state;
}
