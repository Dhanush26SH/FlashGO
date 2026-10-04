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
  static async getPutawayTasksPaginated(
    warehouseId: string, 
    page: number, 
    limit: number, 
    filters: {
      search?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ data: any[], count: number, kpis: any }> {
    if (!supabase) return { data: [], count: 0, kpis: { pending: 0, in_progress: 0, completed_today: 0 } };

    // 1. Fetch KPIs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.toISOString();
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endOfToday = tomorrow.toISOString();

    const pPending = supabase.from('putaway_tasks').select('*', { count: 'exact', head: true })
      .eq('warehouse_id', warehouseId).eq('status', 'pending');
    
    const pInProgress = supabase.from('putaway_tasks').select('*', { count: 'exact', head: true })
      .eq('warehouse_id', warehouseId).eq('status', 'in_progress');
      
    const pCompletedToday = supabase.from('putaway_tasks').select('*', { count: 'exact', head: true })
      .eq('warehouse_id', warehouseId).eq('status', 'completed')
      .gte('completed_at', startOfToday).lt('completed_at', endOfToday);

    const [resP, resI, resC] = await Promise.all([pPending, pInProgress, pCompletedToday]);
    const kpis = {
      pending: resP.count || 0,
      in_progress: resI.count || 0,
      completed_today: resC.count || 0
    };

    // 2. Fetch related IDs for search if needed
    let productIds: string[] = [];
    let workerIds: string[] = [];
    let batchIds: string[] = [];

    if (filters.search) {
      const q = filters.search.trim();
      const pProd = supabase.from('products').select('id').or(`name.ilike.%${q}%,sku.ilike.%${q}%,internal_barcode.ilike.%${q}%`);
      const pProf = supabase.from('profiles').select('id').or(`full_name.ilike.%${q}%,employee_id.ilike.%${q}%`);
      const pBatch = supabase.from('product_batches').select('batch_id').ilike('batch_number', `%${q}%`);
      
      const [rProd, rProf, rBatch] = await Promise.all([pProd, pProf, pBatch]);
      productIds = (rProd.data || []).map((x: any) => x.id);
      workerIds = (rProf.data || []).map((x: any) => x.id);
      batchIds = (rBatch.data || []).map((x: any) => x.batch_id);
    }

    // 3. Build Main Query
    let query = supabase
      .from('putaway_tasks')
      .select('*, product:products(name, sku, internal_barcode), batch:product_batches(batch_number), worker:profiles!worker_id(full_name, employee_id)', { count: 'exact' })
      .eq('warehouse_id', warehouseId);

    // Filter logic
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
      if (filters.status === 'completed' && filters.startDate && filters.endDate) {
        query = query.gte('completed_at', filters.startDate).lte('completed_at', filters.endDate);
      }
    } else {
      if (filters.startDate && filters.endDate) {
        // Must never hide pending/in_progress
        query = query.or(`status.in.(pending,in_progress),and(status.eq.completed,completed_at.gte.${filters.startDate},completed_at.lte.${filters.endDate})`);
      }
    }

    if (filters.search) {
      const q = filters.search.trim();
      let searchOrs = [];
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
         searchOrs.push(`id.eq.${q}`);
      } else {
         searchOrs.push(`id.ilike.%${q}%`);
      }
      searchOrs.push(`destination_location.ilike.%${q}%`);
      if (productIds.length > 0) searchOrs.push(`product_id.in.(${productIds.join(',')})`);
      if (workerIds.length > 0) searchOrs.push(`worker_id.in.(${workerIds.join(',')})`);
      if (batchIds.length > 0) searchOrs.push(`batch_id.in.(${batchIds.join(',')})`);
      
      query = query.or(searchOrs.join(','));
    }

    query = query.order('created_at', { ascending: false });

    // Pagination
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;
    
    return {
      data: data || [],
      count: count || 0,
      kpis
    };
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

  // --- INWARD RECEIPTS API ---
  static async getInwardReceiptsPaginated(warehouseId: string, page: number = 1, limit: number = 25, filters?: any): Promise<any> {
    if (!supabase) return { data: [], count: 0 };
    
    let query = supabase
      .from('goods_receipts')
      .select(`
        *,
        procurement_order:procurement_orders(id),
        vendor:vendors(name),
        receiver:profiles(full_name),
        items:goods_receipt_items(id, quantity_received)
      `, { count: 'exact' })
      .eq('warehouse_id', warehouseId);

    if (filters?.startDate && filters?.endDate) {
      query = query.gte('created_at', filters.startDate).lte('created_at', filters.endDate);
    }
    
    // Sort descending by default to prioritize today's completed
    query = query.order('created_at', { ascending: false });

    // Pagination
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      data: data || [],
      count: count || 0
    };
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
  static async getUnpackQueue(warehouseId: string, filterDate?: Date, filterStatus?: string): Promise<any[]> {
    if (!supabase) return [];
    let startIso = null;
    let endIso = null;
    if (filterDate) {
      const year = filterDate.getFullYear();
      const month = filterDate.getMonth();
      const date = filterDate.getDate();
      const startOfDayIST = new Date(Date.UTC(year, month, date) - (5.5 * 60 * 60 * 1000));
      const nextDayIST = new Date(startOfDayIST.getTime() + 24 * 60 * 60 * 1000);
      startIso = startOfDayIST.toISOString();
      endIso = nextDayIST.toISOString();
    }

    const { data, error } = await supabase.rpc('admin_get_order_unpack_queue_enriched', {
      p_warehouse_id: warehouseId,
      p_filter_start: startIso,
      p_filter_end: endIso,
      p_filter_status: filterStatus || 'all'
    });

    if (error) throw error;
    return data || [];
  }

  static async getActiveLocations(warehouseId: string): Promise<any[]> {
    if (!supabase) return [];
    
    let allLocations: any[] = [];
    let page = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const start = page * limit;
      const end = start + limit - 1;

      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id, location_code, zone')
        .eq('warehouse_id', warehouseId)
        .eq('is_active', true)
        .order('location_code', { ascending: true })
        .range(start, end);

      if (error) throw error;

      if (data && data.length > 0) {
        allLocations = allLocations.concat(data);
        if (data.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    return allLocations;
  }

  static async processOrderUnpack(unpackId: string, disposition: 'restocked' | 'damaged' | 'quarantine', userId: string, locationId?: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('process_order_unpack', {
      p_unpack_id: unpackId,
      p_disposition: disposition,
      p_user_id: userId,
      p_location_id: locationId || null
    });
    if (error) throw error;
  }
}
