import { supabase } from './supabaseClient';
import { FlashGoDB } from '../db';
import type { Product } from '../../types';

export class InventoryService {
  /**
   * Fetches the products list and joins it with `warehouse_stock` for the given warehouse.
   * Merges the inventory stock into the product's `stock_quantity`.
   */
  static async getWarehouseStock(warehouseId: string): Promise<Product[]> {
    if (!supabase) return FlashGoDB.getProducts();

    // Fetch all products
    const { data: productsData, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .order('name');
      
    if (prodErr) throw prodErr;

    // Fetch stock for this specific warehouse
    const { data: stockData, error: stockErr } = await supabase
      .from('warehouse_stock')
      .select('product_id, quantity')
      .eq('warehouse_id', warehouseId);

    if (stockErr) throw stockErr;

    const stockMap = new Map<string, number>();
    (stockData || []).forEach((row: any) => stockMap.set(row.product_id, row.quantity));

    // Also fetch inventory locations (aisle/rack/bin info)
    const { data: locData, error: locErr } = await supabase
      .from('inventory_locations')
      .select('product_id, aisle, rack, shelf')
      .eq('warehouse_id', warehouseId);
      
    if (locErr) throw locErr;

    const locMap = new Map<string, string>();
    (locData || []).forEach((row: any) => {
      const locStr = `${row.aisle || ''}-${row.rack || ''}-${row.shelf || ''}`.replace(/^-|-$/g, '');
      if (locStr) locMap.set(row.product_id, locStr);
    });

    return (productsData || []).map((p: any) => ({
      ...p,
      price: Number(p.price),
      discount_price: p.discount_price ? Number(p.discount_price) : undefined,
      stock_quantity: stockMap.get(p.id) || 0,
      warehouse_location: locMap.get(p.id) || p.warehouse_location || 'Unassigned'
    }));
  }

  /**
   * Manually adjusts stock up or down using the atomic RPC.
   */
  static async adjustStock(
    warehouseId: string,
    productId: string,
    quantityChange: number,
    userId: string
  ): Promise<void> {
    if (!supabase) {
      const products = FlashGoDB.getProducts();
      const prod = products.find(p => p.id === productId);
      if (prod) {
        prod.stock_quantity = Math.max(0, prod.stock_quantity + quantityChange);
        FlashGoDB.saveProducts(products);
      }
      return;
    }

    const { error, data } = await supabase.rpc('adjust_warehouse_stock', {
      p_warehouse_id: warehouseId,
      p_product_id: productId,
      p_quantity_change: quantityChange,
      p_reason: quantityChange > 0 ? 'manual_addition' : 'manual_deduction',
      p_user_id: userId
    });

    if (error) throw error;
    if (data === false) {
      throw new Error('Could not adjust stock (cannot drop below zero).');
    }
  }

  /**
   * Fetches the product batches from the live database.
   */
  static async getBatches(): Promise<any[]> {
    if (!supabase) return FlashGoDB.getBatches();

    const { data, error } = await supabase
      .from('product_batches')
      .select(`
        *,
        product:products(name, sku)
      `)
      .order('expiry_date', { ascending: true });

    if (error) throw error;
    return data;
  }

  // --- PUTAWAY API ---
  static async getPutawayTasks(warehouseId: string): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('putaway_tasks')
      .select('*, product:products(name, sku, category_id, barcode), batch:product_batches(batch_number, expiry_date), worker:profiles!worker_id(full_name)')
      .eq('warehouse_id', warehouseId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async completePutaway(taskId: string, location: string, userId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('complete_putaway_task', {
      p_task_id: taskId,
      p_destination_location: location,
      p_user_id: userId
    });
    if (error) throw error;
  }

  // --- CYCLE COUNTS API ---
  static async getCycleCounts(warehouseId: string): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('cycle_counts')
      .select('*, product:products(name, sku), batch:product_batches(batch_number), counter:profiles!counter_id(full_name), reviewer:profiles!reviewer_id(full_name)')
      .eq('warehouse_id', warehouseId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async createCycleCount(warehouseId: string, productId: string, batchId: string | null, systemQty: number): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from('cycle_counts')
      .insert({
        warehouse_id: warehouseId,
        product_id: productId,
        batch_id: batchId,
        system_quantity: systemQty,
        status: 'draft'
      });
    if (error) throw error;
  }

  static async updateCycleCountStatus(countId: string, status: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('cycle_counts').update({ status }).eq('id', countId);
    if (error) throw error;
  }

  static async submitCycleCount(countId: string, countedQty: number, notes: string, userId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('submit_cycle_count', {
      p_count_id: countId,
      p_counted_qty: countedQty,
      p_notes: notes,
      p_user_id: userId
    });
    if (error) throw error;
  }

  static async resolveCycleCount(countId: string, status: 'approved' | 'rejected', userId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('resolve_cycle_count', {
      p_count_id: countId,
      p_status: status,
      p_user_id: userId
    });
    if (error) throw error;
  }

  // --- WAREHOUSE CONTROLS API ---
  static async getWarehouses(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('warehouses').select('*').order('name');
    if (error) throw error;
    return data || [];
  }

  static async updateWarehouseServiceability(warehouseId: string, isActive: boolean, serviceRadiusKm: number): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('warehouses').update({ 
      is_active: isActive, 
      service_radius_km: serviceRadiusKm 
    }).eq('id', warehouseId);
    if (error) throw error;
  }

  // --- RETURNS & UNPACK QUEUE API ---
  static async getUnpackQueue(warehouseId: string): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('order_unpack_queue')
      .select('*, order:orders(*), processed_by:profiles!processed_by(full_name)')
      .eq('warehouse_id', warehouseId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async processOrderUnpack(unpackId: string, disposition: 'restocked' | 'damaged' | 'quarantine', userId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('process_order_unpack', {
      p_unpack_id: unpackId,
      p_disposition: disposition,
      p_user_id: userId
    });
    if (error) throw error;
  }
}
