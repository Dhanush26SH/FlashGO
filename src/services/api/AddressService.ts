import { supabase } from './supabaseClient';

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address_line: string;
  lat?: number;
  lng?: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const AddressService = {
  async getAddresses(customerId: string): Promise<CustomerAddress[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching addresses:', error);
      return [];
    }
    return data || [];
  },

  async addAddress(address: Omit<CustomerAddress, 'id' | 'created_at' | 'updated_at'>): Promise<CustomerAddress | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('customer_addresses')
      .insert([address])
      .select()
      .single();

    if (error) {
      console.error('Error adding address:', error);
      return null;
    }
    return data;
  },

  async deleteAddress(id: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting address:', error);
      return false;
    }
    return true;
  }
};
