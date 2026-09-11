import { supabase } from './supabaseClient';
import type { Coupon } from '../../types';

export class CouponsService {
  static async getCoupons(): Promise<Coupon[]> {

    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('code');
    
    if (error) throw error;
    // Map database decimal columns to JS number
    return (data || []).map((c: any) => ({
      ...c,
      discount_value: Number(c.discount_value),
      min_order_value: Number(c.min_order_value),
      max_discount: c.max_discount ? Number(c.max_discount) : undefined,
    }));
  }

  static async createCoupon(coupon: Omit<Coupon, 'id' | 'created_at'>): Promise<Coupon> {

    const { data, error } = await supabase
      .from('coupons')
      .insert([coupon])
      .select()
      .single();
    
    if (error) throw error;
    return {
      ...data,
      discount_value: Number(data.discount_value),
      min_order_value: Number(data.min_order_value),
      max_discount: data.max_discount ? Number(data.max_discount) : undefined,
    };
  }

  static async updateCoupon(id: string, updates: Partial<Coupon>): Promise<Coupon> {

    const { data, error } = await supabase
      .from('coupons')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return {
      ...data,
      discount_value: Number(data.discount_value),
      min_order_value: Number(data.min_order_value),
      max_discount: data.max_discount ? Number(data.max_discount) : undefined,
    };
  }

  static async deleteCoupon(id: string): Promise<void> {

    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
}
