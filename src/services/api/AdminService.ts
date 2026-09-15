import { supabase } from './supabaseClient';

export class AdminService {

  static async getWarehouses() {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase.from('warehouses').select('*');
    if (error) throw error;
    return data;
  }

  static async getLiveStaffStatus(warehouseId: string, role: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    // We map 'Warehouse Staff' to 'warehouse_staff' internally
    const dbRole = role === 'Warehouse Staff' ? 'warehouse_staff' : role.toLowerCase();
    
    // Single clean authoritative read architecture directly from profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, employee_id, is_online')
      .eq('warehouse_id', warehouseId)
      .eq('role', dbRole)
      .order('full_name', { ascending: true })
      .order('id', { ascending: true });
      
    if (error) {
      console.error('Failed to fetch live staff status:', error.message);
      throw error;
    }
    
    return data || [];
  }

  static async createWarehouse(warehouse: any) {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase.from('warehouses').insert([warehouse]).select().single();
    if (error) throw error;
    return data;
  }

  static async updateWarehouse(id: string, updates: any) {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { error } = await supabase.from('warehouses').update(updates).eq('id', id);
    if (error) throw error;
  }

  static async updateWarehouseServiceability(id: string, radiusKm: number, lat?: number, lng?: number) {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { error } = await supabase.rpc('admin_update_warehouse_serviceability', {
      p_warehouse_id: id,
      p_radius_km: radiusKm,
      p_lat: lat,
      p_lng: lng
    });
    if (error) throw error;
  }

  static async getWarehouseInventory(warehouseId: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase.rpc('admin_get_warehouse_inventory', { p_warehouse_id: warehouseId });
    if (error) throw error;
    return data;
  }

  static async getStockLedgers(warehouseId: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase.rpc('admin_get_stock_ledgers', { p_warehouse_id: warehouseId });
    if (error) throw error;
    return data;
  }

  static async getProductBatches(warehouseId: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase.rpc('admin_get_product_batches', { p_warehouse_id: warehouseId });
    if (error) throw error;
    return data;
  }
}
