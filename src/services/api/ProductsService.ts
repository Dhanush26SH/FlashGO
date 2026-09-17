import { supabase } from './supabaseClient';
import type { Product } from '../../types';
import { FlashGoDB } from '../db';
import { VendorsService } from './VendorsService';

const imageMap: Record<string, string> = {
  'bananas.png': 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=300&q=80',
  'apples.png': 'https://images.unsplash.com/photo-1560806887-1e4cd0b6fac6?w=300&q=80',
  'tomatoes.png': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300&q=80',
  'milk.png': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&q=80',
  'butter.png': 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=300&q=80',
  'sourdough.png': 'https://images.unsplash.com/photo-1589367920969-ab8e050eb0e9?w=300&q=80',
  'chips.png': 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=300&q=80',
  'cookies.png': 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=300&q=80',
  'limewater.png': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300&q=80',
  'orangejuice.png': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=300&q=80',
  'dishwash.png': 'https://images.unsplash.com/photo-1585553616435-2dc0a54e271d?w=300&q=80',
  'tissue.png': 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=300&q=80'
};

// ─── Admin Catalog Create Payload ────────────────────────────────────────────
// Only catalog metadata fields — stock_quantity and warehouse_location are
// intentionally excluded (managed by warehouse ops, not catalog admin).
export interface AdminCreateProductPayload {
  category_id: string;
  name: string;
  description?: string;
  price: number;
  discount_price?: number | null;
  sku?: string;
  barcode?: string;
  image_url?: string;
  is_active?: boolean;
  pack_quantity?: number | null;
  pack_unit?: string | null;
  supplier_id?: string | null;
  purchase_price?: number | null;
  minimum_order_quantity?: number | null;
  vendor_sku?: string | null;
}

// ─── Admin Catalog Update Payload ────────────────────────────────────────────
// Partial — only pass fields you want to update.
// Pass discount_price = -1 to clear the discount.
export interface AdminUpdateProductPayload {
  name?: string;
  category_id?: string;
  price?: number;
  discount_price?: number | null;  // -1 to clear
  description?: string;
  sku?: string;
  barcode?: string;
  image_url?: string;
  is_active?: boolean;
  manufacturer_barcode?: string | null;
  manufacturer_barcode_verified?: boolean;
  pack_quantity?: number | null;
  pack_unit?: string | null;
  supplier_id?: string | null;
  purchase_price?: number | null;
  minimum_order_quantity?: number | null;
  vendor_sku?: string | null;
}

export class ProductsService {

  // ── READ: All products (Admin view — includes inactive) ─────────────────
  // IMPORTANT: This method MUST only return authoritative Supabase data.
  // The FlashGoDB local-mock fallback has been intentionally removed to prevent
  // stale localStorage products from silently inflating the authoritative catalog count.
  // If supabase is null (not configured), an error will propagate to the caller.
  static async getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (error) throw error;

    return (data || []).map((p: any) => ({
      ...p,
      image_url: imageMap[p.image_url] || p.image_url,
      manufacturer_barcode: p.manufacturer_barcode === '8901234567890' ? null : p.manufacturer_barcode
    }));
  }


  // ── READ: Single product ─────────────────────────────────────────────────
  static async getProduct(id: string): Promise<Product | null> {
    if (!supabase) return FlashGoDB.getProducts().find(p => p.id === id) || null;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // ── ADMIN CREATE: Routes through admin_create_product RPC ────────────────
  // This RPC enforces: admin auth, valid category, valid price, unique SKU/barcode.
  // stock_quantity and warehouse_location are NOT accepted (set to 0/NULL by DB).
  static async createProduct(payload: AdminCreateProductPayload): Promise<{ id: string }> {
    if (!supabase) {
      // Local fallback (dev only)
      const products = FlashGoDB.getProducts();
      const newProduct: any = {
        ...payload,
        id: 'p-' + Math.random().toString(36).substr(2, 9),
        stock_quantity: 0,
        warehouse_location: null,
        rating_avg: 0,
        rating_count: 0,
        is_active: payload.is_active ?? true,
        created_at: new Date().toISOString()
      };
      products.push(newProduct);
      FlashGoDB.saveProducts(products);
      return { id: newProduct.id };
    }

    const { data, error } = await supabase.rpc('admin_create_product', {
      p_name: payload.name,
      p_category_id: payload.category_id,
      p_price: payload.price,
      p_discount_price: payload.discount_price ?? null,
      p_description: payload.description ?? null,
      p_sku: payload.sku ?? null,
      p_barcode: payload.barcode ?? null,
      p_image_url: payload.image_url ?? null,
      p_is_active: payload.is_active ?? true,
    });

    if (error) throw new Error(error.message);
    const productId = data as string;

    try {
      if (payload.pack_quantity != null || payload.pack_unit != null) {
        await supabase.from('products').update({
          pack_quantity: payload.pack_quantity,
          pack_unit: payload.pack_unit
        }).eq('id', productId);
      }

      if (payload.supplier_id) {
        await VendorsService.upsertVendorProduct(
          payload.supplier_id,
          productId,
          payload.vendor_sku || null,
          payload.purchase_price || null,
          payload.minimum_order_quantity || 1,
          true
        );
      }
    } catch (e: any) {
      console.error('Partial failure in product creation:', e);
      throw new Error(`Product created but failed to link pack/supplier metadata: ${e.message}`);
    }

    return { id: productId };
  }

  // ── ADMIN UPDATE: Routes through admin_update_product RPC ────────────────
  // Only updates catalog metadata. stock_quantity and warehouse_location
  // cannot be changed here — they are managed by warehouse inventory RPCs.
  static async updateProduct(id: string, updates: AdminUpdateProductPayload): Promise<void> {
    if (!supabase) {
      const products = FlashGoDB.getProducts();
      const idx = products.findIndex(p => p.id === id);
      if (idx === -1) throw new Error('Product not found in local DB');
      products[idx] = { ...products[idx], ...updates } as any;
      FlashGoDB.saveProducts(products);
      return;
    }

    const { error } = await supabase.rpc('admin_update_product', {
      p_id: id,
      p_name: updates.name ?? null,
      p_category_id: updates.category_id ?? null,
      p_price: updates.price ?? null,
      p_discount_price: updates.discount_price ?? null,
      p_description: updates.description ?? null,
      p_sku: updates.sku ?? null,
      p_barcode: updates.barcode ?? null,
      p_image_url: updates.image_url ?? null,
      p_is_active: updates.is_active ?? null,
      p_manufacturer_barcode: updates.manufacturer_barcode ?? null,
      p_manufacturer_barcode_verified: updates.manufacturer_barcode_verified ?? null,
    });

    if (error) throw new Error(error.message);

    try {
      if (updates.pack_quantity !== undefined || updates.pack_unit !== undefined) {
        const packUpdates: any = {};
        if (updates.pack_quantity !== undefined) packUpdates.pack_quantity = updates.pack_quantity;
        if (updates.pack_unit !== undefined) packUpdates.pack_unit = updates.pack_unit;
        await supabase.from('products').update(packUpdates).eq('id', id);
      }

      if (updates.supplier_id) {
        await VendorsService.upsertVendorProduct(
          updates.supplier_id,
          id,
          updates.vendor_sku || null,
          updates.purchase_price || null,
          updates.minimum_order_quantity || 1,
          true
        );
      }
    } catch (e: any) {
      console.error('Partial failure in product update:', e);
      throw new Error(`Product core updated but failed to link pack/supplier metadata: ${e.message}`);
    }
  }

  // ── ADMIN SOFT DELETE: Sets is_active = false (no hard delete) ───────────
  // The product remains in the DB for order history integrity.
  // It will no longer appear in the customer catalog or be purchasable.
  static async deactivateProduct(id: string): Promise<void> {
    if (!supabase) {
      const products = FlashGoDB.getProducts();
      const idx = products.findIndex(p => p.id === id);
      if (idx !== -1) {
        (products[idx] as any).is_active = false;
        FlashGoDB.saveProducts(products);
      }
      return;
    }

    const { error } = await supabase.rpc('admin_set_product_active', {
      p_id: id,
      p_is_active: false,
    });

    if (error) throw new Error(error.message);
  }

  // ── ADMIN REACTIVATE: Sets is_active = true ──────────────────────────────
  static async reactivateProduct(id: string): Promise<void> {
    if (!supabase) {
      const products = FlashGoDB.getProducts();
      const idx = products.findIndex(p => p.id === id);
      if (idx !== -1) {
        (products[idx] as any).is_active = true;
        FlashGoDB.saveProducts(products);
      }
      return;
    }

    const { error } = await supabase.rpc('admin_set_product_active', {
      p_id: id,
      p_is_active: true,
    });

    if (error) throw new Error(error.message);
  }

  // ── ADMIN SET CATEGORY ACTIVE ────────────────────────────────────────────
  static async setCategoryActive(categoryId: string, isActive: boolean): Promise<void> {
    if (!supabase) return;

    const { error } = await supabase.rpc('admin_set_category_active', {
      p_id: categoryId,
      p_is_active: isActive,
    });

    if (error) throw new Error(error.message);
  }

  // ── ADMIN BULK DISCOUNT ──────────────────────────────────────────────────
  // Routes through admin_apply_bulk_discount RPC.
  // Returns the count of products updated.
  static async applyBulkDiscount(categoryId: string, percentage: number): Promise<number> {
    if (!supabase) return 0;

    const { data, error } = await supabase.rpc('admin_apply_bulk_discount', {
      p_category_id: categoryId,
      p_percentage: percentage,
    });

    if (error) throw new Error(error.message);
    return (data as number) || 0;
  }

  // ── KEPT FOR BACKWARDS COMPAT (Picker/Customer reads) ───────────────────
  // deleteProduct is removed — use deactivateProduct instead.
  // Any legacy calls to deleteProduct will fail at compile time,
  // forcing correct usage of deactivateProduct.
}
