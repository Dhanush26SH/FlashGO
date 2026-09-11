import { supabase } from './supabaseClient';

export interface WorkSlot {
  id: string;
  warehouse_id: string;
  warehouse_name?: string;
  target_role: 'picker' | 'driver' | 'warehouse_staff';
  start_time: string;
  end_time: string;
  capacity: number;
  status: 'published' | 'unpublished' | 'cancelled';
  booked_count: number;
  estimated_hourly_rate_min?: number | null;
  estimated_hourly_rate_max?: number | null;
}

export class WorkSlotService {
  static async adminGetWorkSlots(): Promise<WorkSlot[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('admin_get_work_slots');
    if (error) {
      console.error('Error fetching work slots', error);
      return [];
    }
    return data || [];
  }

  static async adminCreateWorkSlot(
    warehouseId: string,
    targetRole: string,
    startTime: string,
    endTime: string,
    capacity: number,
    status: string,
    rateMin: number | null = null,
    rateMax: number | null = null
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('admin_create_work_slot', {
      p_warehouse_id: warehouseId,
      p_target_role: targetRole,
      p_start_time: startTime,
      p_end_time: endTime,
      p_capacity: capacity,
      p_status: status,
      p_rate_min: rateMin,
      p_rate_max: rateMax
    });
    if (error) throw error;
  }

  static async adminEditWorkSlot(
    slotId: string,
    warehouseId: string,
    targetRole: string,
    startTime: string,
    endTime: string,
    capacity: number,
    status: string,
    rateMin: number | null = null,
    rateMax: number | null = null
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('admin_edit_work_slot', {
      p_slot_id: slotId,
      p_warehouse_id: warehouseId,
      p_target_role: targetRole,
      p_start_time: startTime,
      p_end_time: endTime,
      p_capacity: capacity,
      p_status: status,
      p_rate_min: rateMin,
      p_rate_max: rateMax
    });
    if (error) throw error;
  }

  static async adminCancelWorkSlot(slotId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('admin_cancel_work_slot', {
      p_slot_id: slotId
    });
    if (error) throw error;
  }

  static async getAvailableWorkSlots(): Promise<WorkSlot[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('get_available_work_slots');
    if (error) {
      console.error('Error fetching available work slots', error);
      return [];
    }
    return data || [];
  }

  static async getMyWorkSlots(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('get_my_work_slots');
    if (error) {
      console.error('Error fetching my work slots', error);
      return [];
    }
    return data || [];
  }

  static async workerBookSlot(slotId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('worker_book_slot', {
      p_slot_id: slotId
    });
    if (error) throw error;
  }

  static async workerCancelBooking(shiftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('worker_cancel_booking', {
      p_shift_id: shiftId
    });
    if (error) throw error;
  }
}
