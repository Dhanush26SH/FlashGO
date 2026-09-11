import { supabase } from './supabaseClient';
import type { ProcurementOrder } from '../../types';

export class ProcurementService {
  static async getProcurementOrders(): Promise<ProcurementOrder[]> {

    const { data, error } = await supabase
      .from('procurement_orders')
      .select(`
        *,
        vendor:vendors(name),
        items:procurement_order_items(
          id,
          product_id,
          quantity,
          cost_per_unit,
          received_quantity,
          product:products(name)
        )
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return [];
    }
    
    return data.map((o: any) => ({
      ...o,
      total_cost: Number(o.total_cost),
      vendor_name: o.vendor?.name || 'Unknown Vendor',
      items: o.items?.map((i: any) => ({
        ...i,
        quantity: Number(i.quantity),
        cost_per_unit: Number(i.cost_per_unit),
        received_quantity: Number(i.received_quantity || 0),
        product_name: i.product?.name
      })) || []
    }));
  }

  static async createProcurementOrder(vendorId: string, totalCost: number, warehouseId?: string, items?: { product_id: string; quantity: number; cost_per_unit: number }[]): Promise<ProcurementOrder> {
    if (!warehouseId) throw new Error('Warehouse ID is required to create a PO');
    
    const { data, error } = await supabase.rpc('admin_create_po', {
      p_vendor_id: vendorId,
      p_warehouse_id: warehouseId,
      p_items: items || []
    });
    
    if (error) throw error;
    
    return {
      ...data,
      total_cost: Number(data.total_cost)
    };
  }

  static async approveProcurementOrder(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_update_po_status', { p_po_id: id, p_new_status: 'approved' });
    if (error) throw error;
  }

  static async receiveProcurementOrder(
    id: string, 
    warehouseId: string, 
    userId: string, 
    receiptNumber: string,
    notes: string,
    items: { 
      procurement_order_item_id: string; 
      product_id: string; 
      accepted_quantity: number; 
      rejected_quantity: number; 
      batch_number: string; 
      expiry_date: string | null;
      unit_cost: number;
    }[]
  ): Promise<any> {
    if (!warehouseId || !userId) {
      throw new Error('warehouseId and userId are required to securely receive procurement into inventory');
    }

    const { error, data } = await supabase.rpc('receive_procurement_order', {
      p_procurement_id: id,
      p_warehouse_id: warehouseId,
      p_user_id: userId,
      p_receipt_number: receiptNumber,
      p_notes: notes || '',
      p_items: items || []
    });
    
    if (error) throw error;
    if (data && data.success === false) {
      throw new Error(data.message || 'Failed to receive procurement');
    }
    return data;
  }

  static async cancelProcurementOrder(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_update_po_status', { p_po_id: id, p_new_status: 'cancelled' });
    if (error) throw error;
  }

  static async getBatchTraceability(warehouseId?: string | null): Promise<any[]> {
    let query = supabase
      .from('product_batches')
      .select(`
        id,
        batch_number,
        expiry_date,
        received_quantity,
        available_quantity,
        status,
        created_at,
        product:products(name, sku),
        goods_receipt_item:goods_receipt_items(
          receipt_id,
          unit_cost,
          quantity_received,
          accepted_quantity,
          rejected_quantity,
          receipt:goods_receipts(
            receipt_number,
            created_at,
            procurement_order_id,
            vendor:vendors(name)
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async getVendorProducts(vendorId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('vendor_products')
      .select('product_id, purchase_price, minimum_order_quantity')
      .eq('vendor_id', vendorId)
      .eq('is_active', true);
    
    if (error) throw error;
    return data || [];
  }
}
