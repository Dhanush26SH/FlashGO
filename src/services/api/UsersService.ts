import { supabase } from './supabaseClient';
import type { Profile } from '../../types';

export class UsersService {
  static async getProfiles(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*');
    
    if (error) throw error;
    return data || [];
  }

  static async getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }
  static async suspendProfile(userId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('suspend_profile', {
      p_user_id: userId,
      p_reason: reason
    });
    if (error) throw error;
  }

  static async unsuspendProfile(userId: string): Promise<void> {
    const { error } = await supabase.rpc('unsuspend_profile', {
      p_user_id: userId
    });
    if (error) throw error;
  }

  static async approveStaffRole(userId: string, role: string, cleanName: string, warehouseId?: string | null): Promise<void> {
    const { error } = await supabase.rpc('approve_staff_role', {
      p_user_id: userId,
      p_role: role,
      p_clean_name: cleanName,
      p_warehouse_id: warehouseId || null
    });
    if (error) throw error;
  }

  static async rejectStaffAccess(userId: string): Promise<void> {
    const { error } = await supabase.rpc('reject_staff_access', {
      p_user_id: userId
    });
    if (error) throw error;
  }

  static async updateStaffWarehouse(userId: string, warehouseId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_update_staff_warehouse', {
      p_target_id: userId,
      p_warehouse_id: warehouseId
    });
    if (error) throw error;
  }

  static async updateStaffRole(userId: string, role: string): Promise<void> {
    const { error } = await supabase.rpc('admin_update_staff_role', {
      p_target_id: userId,
      p_role: role
    });
    if (error) throw error;
  }

  static async updateMyBasicProfile(fullName: string, phone: string): Promise<void> {
    const { error } = await supabase.rpc('update_my_basic_profile', {
      p_full_name: fullName,
      p_phone: phone
    });
    if (error) throw error;
  }
}
