import { supabase } from './supabaseClient';
import type { DriverEarning } from '../../types';
import { FlashGoDB } from '../db';

export class FinanceService {
  static async processRefund(orderId: string, amount: number, reason: string): Promise<string> {
    if (!supabase) throw new Error('Supabase not configured');
    
    // First, check the order payment method
    const { data: order } = await supabase.from('orders').select('payment_method').eq('id', orderId).single();
    
    if (order && (order.payment_method === 'upi' || order.payment_method === 'card')) {
      // It's an external payment, invoke Edge Function
      const { data, error } = await supabase.functions.invoke('refund-razorpay-payment', {
        body: { orderId, amount, reason }
      });
      if (error) {
        console.error('Razorpay Refund failed:', error);
        throw error;
      }
      return data.refundId;
    } else {
      // Closed loop (wallet/cod), invoke RPC directly
      const { data, error } = await supabase.rpc('process_refund', {
        p_order_id: orderId,
        p_amount: amount,
        p_reason: reason,
        p_idempotency_key: crypto.randomUUID()
      });

      if (error) {
        console.error('Refund failed:', error);
        throw error;
      }
      
      return data;
    }
  }

  static async getDriverEarnings(driverId: string): Promise<DriverEarning[]> {
    if (!supabase) return FlashGoDB.getDriverEarnings(driverId);

    const { data, error } = await supabase
      .from('driver_earnings')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return (data || []).map((e: any) => ({
      ...e,
      earning_amount: Number(e.earning_amount),
      commission_amount: Number(e.commission_amount)
    }));
  }

  static async reconcileDriverCOD(driverId: string): Promise<void> {
    if (!supabase) {
      FlashGoDB.reconcileDriverCOD(driverId);
      return;
    }

    // 1. Fetch current liability
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('cod_wallet_liability')
      .eq('id', driverId)
      .single();

    if (fetchErr) throw fetchErr;

    const liability = Number(profile.cod_wallet_liability || 0);

    // 2. Call RPC to settle liability if > 0
    if (liability > 0) {
      const { error: rpcErr } = await supabase.rpc('driver_cod_settlement', {
        p_driver_id: driverId,
        p_amount: liability
      });

      if (rpcErr) throw rpcErr;
    }
  }

  static async getCodCollections(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('cod_collections')
      .select('*, order:orders(customer_id), driver:profiles!driver_id(full_name)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  static async markCodCollected(orderId: string, adminId: string): Promise<boolean> {
    if (!supabase) {
      FlashGoDB.markCodCollected(orderId);
      return true;
    }

    const { error: rpcErr, data: success } = await supabase.rpc('mark_cod_collected', {
      p_order_id: orderId
    });

    if (rpcErr) throw rpcErr;
    return success;
  }
}
