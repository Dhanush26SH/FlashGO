import { supabase } from './supabaseClient';
import type { Order } from '../../types';

export class OrdersService {
  static async getOrders(): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        items:order_items(*, product:products(*, warehouse_stock(warehouse_id, warehouse_location)), inventory_location:inventory_locations(*)),
        customer:profiles!customer_id(full_name, phone),
        picker:profiles!picker_id(full_name),
        driver:profiles!driver_id(full_name),
        substitutions:order_substitutions(*),
        events:order_events(*)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Map data to match the UI expectations
    return (data || []).map((o: any) => ({
      ...o,
      customer_name: o.customer?.full_name,
      customer_phone: o.customer?.phone,
      picker_name: o.picker?.full_name,
      driver_name: o.driver?.full_name,
      substitutions: (o.substitutions || []).map((sub: any) => ({
        ...sub,
        customer_action: sub.status
      })),
      items: (o.items || []).map((item: any) => {
        if (item.product) {
          const ws = item.product.warehouse_stock?.find((w: any) => w.warehouse_id === o.warehouse_id);
          item.product.warehouse_location = ws?.warehouse_location || null;
          delete item.product.warehouse_stock;
        }
        return item;
      })
    }));
  }

  static async updateOrderStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) throw error;
  }

  static async adminCancelOrder(orderId: string, reason: string = 'Admin cancelled'): Promise<void> {
    const { error } = await supabase.rpc('admin_cancel_order', {
      p_order_id: orderId,
      p_reason: reason
    });
    
    if (error) throw error;
  }

  static async adminAssignPicker(orderId: string, pickerId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_assign_picker', {
      p_order_id: orderId,
      p_picker_id: pickerId
    });
    
    if (error) throw error;
  }

  static async assignPicker(orderId: string, pickerId: string): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .update({ picker_id: pickerId, status: 'picking', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    
    if (error) throw error;
  }

  static async assignDriver(orderId: string, driverId: string): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .update({ driver_id: driverId, status: 'out_for_delivery', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    
    if (error) throw error;
  }

  static async createOrder(
    userId: string,
    address: string,
    deliverySpeed: string,
    paymentMethod: string,
    items: { productId: string; quantity: number }[],
    couponCode: string | null,
    lat: number,
    lng: number
  ): Promise<string> {
    const { data, error } = await supabase.rpc('process_checkout', {
      p_user_id: userId,
      p_address: address,
      p_delivery_speed: deliverySpeed,
      p_payment_method: paymentMethod,
      p_items: items,
      p_coupon_code: couponCode,
      p_lat: lat,
      p_lng: lng,
      p_idempotency_key: crypto.randomUUID()
    });

    if (error) throw error;
    return data;
  }

  static async pickItem(orderId: string, itemId: string, qty: number, oos: boolean): Promise<void> {
    const status = oos ? 'out_of_stock' : 'picked';
    const { error } = await supabase
      .from('order_items')
      .update({ 
        picked_quantity: qty,
        status: status 
      })
      .eq('order_id', orderId)
      .eq('product_id', itemId);
      
    if (error) throw error;
    
    // Also ensure order status is 'picking'
    await this.updateOrderStatus(orderId, 'picking');
  }

  static async pickFefoItem(warehouseId: string, productId: string, qty: number, orderId: string, userId: string): Promise<any[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase.rpc('pick_fefo_item', {
      p_warehouse_id: warehouseId,
      p_product_id: productId,
      p_quantity: qty,
      p_order_id: orderId,
      p_user_id: userId
    });
    
    if (error) throw error;
    return data;
  }

  static async proposeSubstitution(orderId: string, originalItemId: string, suggestedProductId: string, quantity: number, orderItemId: string): Promise<void> {
    const { error } = await supabase
      .from('order_substitutions')
      .insert({
        order_id: orderId,
        order_item_id: orderItemId,
        original_item_id: originalItemId,
        suggested_product_id: suggestedProductId,
        quantity: quantity,
        status: 'pending'
      });
      
    if (error) throw error;
  }

  static async getPendingSubstitutions(): Promise<any[]> {
    const { data, error } = await supabase
      .from('order_substitutions')
      .select('*, order:orders(customer_id)')
      .eq('status', 'pending');
    
    if (error) throw error;
    
    return (data || []).map((sub: any) => ({
      ...sub,
      customer_action: sub.status,
      customer_id: sub.order?.customer_id
    }));
  }

  static async respondToSubstitution(subId: string, action: 'approved' | 'rejected' | 'auto_refund'): Promise<void> {
    const { error } = await supabase
      .from('order_substitutions')
      .update({ status: action })
      .eq('id', subId);
      
    if (error) throw error;
  }

  static async completePicking(orderId: string, pickerId: string): Promise<void> {
    const { error } = await supabase.rpc('complete_picking', {
      p_order_id: orderId,
      p_picker_id: pickerId
    });
    
    if (error) throw error;
  }

  static async packOrder(orderId: string, bagNumber: string, warehouseId: string, userId: string): Promise<void> {
    // 1. Pack the order
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'packed',
        bag_number: bagNumber,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);
      
    if (error) throw error;
    
    // Inventory deduction now happens atomically per-item during the Picker phase 
    // via pick_fefo_item, so we no longer call deduct_inventory_for_order here.
  }

  static async verifyDeliveryOTP(orderId: string, otp: string, driverId: string): Promise<boolean> {
    // 1. Call secure atomic backend RPC to verify OTP, create earnings, and assign COD liability
    const { error: rpcErr, data: success } = await supabase.rpc('mark_order_delivered', {
      p_order_id: orderId,
      p_otp: otp,
      p_driver_id: driverId
    });

    if (rpcErr) throw rpcErr;
    return success;
  }
}
