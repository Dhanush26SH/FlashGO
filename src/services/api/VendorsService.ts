import { supabase } from './supabaseClient';
import type { Vendor } from '../../types';

export class VendorsService {
  static async getVendors(): Promise<Vendor[]> {

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('name');
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return [];
    }
    
    return data;
  }

  static async createVendor(vendor: Omit<Vendor, 'id' | 'created_at'>): Promise<Vendor> {
    const { data, error } = await supabase.rpc('admin_create_vendor', {
      p_name: vendor.name,
      p_email: vendor.email,
      p_contact_person: vendor.contact_person,
      p_phone: vendor.phone,
      p_address: vendor.address
    });
    
    if (error) throw error;
    return data;
  }

  static async updateVendor(id: string, updates: Partial<Vendor>): Promise<Vendor> {

    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async deleteVendor(id: string): Promise<void> {

    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
}
