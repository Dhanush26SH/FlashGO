import { supabase } from './supabaseClient';

export interface StaffShift {
  id: string;
  staff_id: string;
  staff_name?: string; // from join
  warehouse_id?: string;
  shift_start: string;
  shift_end: string;
  status: 'scheduled' | 'present' | 'absent' | 'cancelled';
  work_slot_id?: string;
}

export class StaffService {
  static async getShifts(): Promise<StaffShift[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('staff_shifts')
      .select(`
        *,
        profiles!staff_shifts_staff_id_fkey(full_name)
      `)
      .order('shift_start', { ascending: false });
      
    if (error) {
      console.error('Error fetching shifts', error);
      return [];
    }
    return data.map((s: any) => ({
      ...s,
      staff_name: s.profiles?.full_name || 'Unknown'
    }));
  }

  static async createShift(shift: Omit<StaffShift, 'id' | 'staff_name' | 'status'>): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('admin_create_staff_shift', {
      p_staff_id: shift.staff_id,
      p_warehouse_id: shift.warehouse_id || null,
      p_shift_start: shift.shift_start,
      p_shift_end: shift.shift_end
    });
    if (error) throw error;
  }

  static async updateShiftStatus(shiftId: string, status: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('admin_update_shift_status', {
      p_shift_id: shiftId,
      p_status: status
    });
    if (error) throw error;
  }

  static async updateShiftDetails(shiftId: string, staffId: string, shiftStart: string, shiftEnd: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('admin_update_shift_details', {
      p_shift_id: shiftId,
      p_staff_id: staffId,
      p_shift_start: shiftStart,
      p_shift_end: shiftEnd
    });
    if (error) throw error;
  }
}
