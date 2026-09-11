import { useEffect, useRef } from 'react';
import { supabase } from '../services/api/supabaseClient';

interface LocationHookProps {
  driverId?: string;
  isDelivering: boolean;
}

export function useDriverLocation({ driverId, isDelivering }: LocationHookProps) {
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    // Stop tracking if not delivering or no driver ID
    if (!driverId || !isDelivering) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const now = Date.now();

        // Throttle updates to every 10 seconds to prevent DB hammering
        if (now - lastUpdateRef.current < 10000) {
          return;
        }

        lastUpdateRef.current = now;

        try {
          if (supabase) {
            const { error } = await supabase
              .from('driver_sessions')
              .update({
                latest_lat: latitude,
                latest_lng: longitude,
                status: 'delivering',
                updated_at: new Date().toISOString()
              })
              .eq('driver_id', driverId);
              
            if (error) console.error('Failed to update driver session:', error);
          }
        } catch (e) {
          console.error('Error writing location to Supabase:', e);
        }
      },
      (error) => {
        console.warn('Geolocation watch error:', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [driverId, isDelivering]);
}
