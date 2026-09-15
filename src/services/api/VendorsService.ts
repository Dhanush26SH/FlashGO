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

  static async getVendorCatalog(vendorId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('vendor_products')
      .select(`
        id,
        vendor_id,
        product_id,
        vendor_sku,
        purchase_price,
        minimum_order_quantity,
        is_active,
        product:products(name, sku, image_url)
      `)
      .eq('vendor_id', vendorId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async upsertVendorProduct(
    vendorId: string,
    productId: string,
    vendorSku: string | null,
    purchasePrice: number | null,
    minimumOrderQuantity: number | null,
    isActive: boolean
  ): Promise<any> {
    const { data, error } = await supabase.rpc('admin_upsert_vendor_product', {
      p_vendor_id: vendorId,
      p_product_id: productId,
      p_vendor_sku: vendorSku,
      p_purchase_price: purchasePrice,
      p_minimum_order_quantity: minimumOrderQuantity,
      p_is_active: isActive
    });

    if (error) throw error;
    return data;
  }
}
