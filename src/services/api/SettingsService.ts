import { supabase } from './supabaseClient';

export interface PlatformSettings {
  id: number;
  base_delivery_fee: number;
  free_delivery_threshold: number;
  updated_at: string;
}

export class SettingsService {
  static async getSettings(): Promise<PlatformSettings | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('platform_settings')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (error) {
      console.warn('Failed to fetch platform settings', error);
      return null;
    }
    return {
      ...data,
      base_delivery_fee: Number(data.base_delivery_fee),
      free_delivery_threshold: Number(data.free_delivery_threshold)
    };
  }

  static async updateSettings(fee: number, threshold: number): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('platform_settings')
      .update({
        base_delivery_fee: fee,
        free_delivery_threshold: threshold,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);
    
    if (error) throw error;
  }
}
