import { supabase } from './supabaseClient';
import type { LogisticsTrip } from '../../types';

export class LogisticsService {
  static async getLogisticsTrips(): Promise<LogisticsTrip[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('logistics_trips')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching logistics trips:', error);
      throw error;
    }
    
    return data as LogisticsTrip[];
  }

  static async createLogisticsTrip(warehouseId: string, orderIds: string[]): Promise<string> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('create_logistics_trip', {
      p_warehouse_id: warehouseId,
      p_order_ids: orderIds
    });
    
    if (error) {
      console.error('Error creating logistics trip:', error);
      throw error;
    }
    
    return data as string;
  }

  static async reassignTrip(tripId: string, driverId: string | null): Promise<boolean> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('reassign_trip', {
      p_trip_id: tripId,
      p_driver_id: driverId
    });
    
    if (error) {
      console.error('Error reassigning trip:', error);
      throw error;
    }
    
    return data as boolean;
  }

  static async claimTrip(tripId: string, driverId: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('claim_trip', {
      p_trip_id: tripId,
      p_driver_id: driverId
    });
    
    if (error) {
      console.error('Error claiming trip:', error);
      throw error;
    }
    
    return data as boolean;
  }

  static async startTrip(tripId: string, driverId: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('start_trip', {
      p_trip_id: tripId,
      p_driver_id: driverId
    });
    
    if (error) {
      console.error('Error starting trip:', error);
      throw error;
    }
    
    return data as boolean;
  }

  static async markOrderDelivered(orderId: string, otp: string, driverId: string, podUrl: string | null = null): Promise<boolean> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('mark_order_delivered', {
      p_order_id: orderId,
      p_otp: otp,
      p_driver_id: driverId,
      p_pod_url: podUrl
    });
    
    if (error) {
      console.error('Error marking order delivered:', error);
      throw error;
    }
    
    return data as boolean;
  }
}
