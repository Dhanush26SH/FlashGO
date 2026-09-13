import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Alert } from 'react-native';

export type GigSlot = {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  estimated_hourly_rate_min: number | null;
  estimated_hourly_rate_max: number | null;
  is_booked?: boolean;
};

export function useGigs() {
  const [gigs, setGigs] = useState<GigSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGigs = async () => {
    try {
      const [availableRes, bookedRes] = await Promise.all([
        supabase.rpc('get_available_driver_gigs'),
        supabase.rpc('get_driver_booked_gigs')
      ]);
      
      if (availableRes.error) throw availableRes.error;
      if (bookedRes.error) throw bookedRes.error;
      
      const available = (availableRes.data as any[] || []).map(g => ({ ...g, is_booked: false }));
      const booked = (bookedRes.data as any[] || []).map(g => ({ ...g, is_booked: true }));
      
      setGigs([...available, ...booked]);
    } catch (err: any) {
      console.error('Error fetching gigs:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchGigs();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchGigs();
  };

  const bookGigs = async (slotIds: string[]) => {
    try {
      const { data, error } = await supabase.rpc('driver_book_gigs', { p_slot_ids: slotIds });
      if (error) {
        throw error;
      }
      return { success: true, data: data as any[] };
    } catch (err: any) {
      Alert.alert('Booking Failed', err.message);
      return { success: false, error: err };
    }
  };

  return { gigs, loading, refreshing, onRefresh, bookGigs };
}
