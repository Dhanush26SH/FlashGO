import { useState, useEffect } from 'react';
import { supabase } from '../services/api/supabaseClient';

export function useLiveDriverSession(driverId?: string) {
  const [realDriverCoords, setRealDriverCoords] = useState<{lat: number, lng: number} | null>(null);
  const [isDriverActive, setIsDriverActive] = useState(false);

  useEffect(() => {
    if (!driverId) {
      setRealDriverCoords(null);
      setIsDriverActive(false);
      return;
    }

    let channel: any = null;
    let isMounted = true;

    const fetchSessionAndSubscribe = async () => {
      if (!supabase) return;

      // Initial fetch
      const { data } = await supabase
        .from('driver_sessions')
        .select('latest_lat, latest_lng, status, updated_at')
        .eq('driver_id', driverId)
        .single();

      if (isMounted && data) {
        // Check staleness (> 10 minutes)
        const isStale = (new Date().getTime() - new Date(data.updated_at).getTime()) > 600000;
        if (!isStale && data.latest_lat && data.latest_lng && data.status === 'delivering') {
          setRealDriverCoords({ lat: data.latest_lat, lng: data.latest_lng });
          setIsDriverActive(true);
        } else {
          setRealDriverCoords(null);
          setIsDriverActive(false);
        }
      }

      // Subscribe to updates
      channel = supabase.channel(`public:driver_sessions:driver_id=eq.${driverId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'driver_sessions', filter: `driver_id=eq.${driverId}` },
          (payload: any) => {
            const row = payload.new;
            if (row.status === 'delivering' && row.latest_lat && row.latest_lng) {
              setRealDriverCoords({ lat: row.latest_lat, lng: row.latest_lng });
              setIsDriverActive(true);
            } else {
              setIsDriverActive(false);
            }
          }
        )
        .subscribe();
    };

    fetchSessionAndSubscribe();

    return () => {
      isMounted = false;
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [driverId]);

  return { realDriverCoords, isDriverActive };
}
