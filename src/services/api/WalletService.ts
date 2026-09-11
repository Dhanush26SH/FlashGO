import { supabase } from './supabaseClient';
import type { WalletTransaction } from '../../types';
import { FlashGoDB } from '../db';

export class WalletService {
  static async getWalletTransactions(userId: string): Promise<WalletTransaction[]> {
    if (!supabase) return FlashGoDB.getWalletTransactions(userId);

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return (data || []).map((t: any) => ({
      ...t,
      amount: Number(t.amount)
    }));
  }

  static async addWalletFunds(userId: string, amount: number, description: string): Promise<void> {
    if (!supabase) {
      FlashGoDB.addWalletFunds(userId, amount, description);
      return;
    }

    const { error: rpcErr, data: success } = await supabase.rpc('process_wallet_transaction', {
      p_user_id: userId,
      p_amount: amount,
      p_tx_type: 'credit',
      p_description: description
    });
    
    if (rpcErr) throw rpcErr;
    if (!success) throw new Error('Transaction failed');
  }

  static async deductWalletFunds(userId: string, amount: number, description: string): Promise<boolean> {
    if (!supabase) {
      return FlashGoDB.deductWalletFunds(userId, amount, description);
    }

    const { error: rpcErr, data: success } = await supabase.rpc('process_wallet_transaction', {
      p_user_id: userId,
      p_amount: amount,
      p_tx_type: 'debit',
      p_description: description
    });
    
    if (rpcErr) throw rpcErr;
    return success;
  }
}
