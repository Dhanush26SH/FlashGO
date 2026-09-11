import { supabase } from './supabaseClient';

export interface Promotion {
  id: string;
  title: string;
  subtitle?: string;
  image_url: string;
  target_type: 'product' | 'category' | 'none';
  target_id?: string;
  active: boolean;
  display_order: number;
  starts_at?: string;
  ends_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export class MarketingService {
  static async getActivePromotions() {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('active', true)
      .or('starts_at.is.null,starts_at.lte.now')
      .or('ends_at.is.null,ends_at.gt.now')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Promotion[];
  }

  static async getAllPromotions() {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Promotion[];
  }

  static async createPromotion(promo: Partial<Promotion>) {
    const { data, error } = await supabase.rpc('admin_create_promotion', {
      p_title: promo.title,
      p_subtitle: promo.subtitle || null,
      p_image_url: promo.image_url,
      p_target_type: promo.target_type,
      p_target_id: promo.target_id || null,
      p_active: promo.active || false,
      p_display_order: promo.display_order || 0,
      p_starts_at: promo.starts_at || null,
      p_ends_at: promo.ends_at || null
    });
    if (error) throw error;
    return data;
  }

  static async updatePromotion(id: string, promo: Partial<Promotion>) {
    const { data, error } = await supabase.rpc('admin_update_promotion', {
      p_promo_id: id,
      p_title: promo.title,
      p_subtitle: promo.subtitle || null,
      p_image_url: promo.image_url,
      p_target_type: promo.target_type,
      p_target_id: promo.target_id || null,
      p_active: promo.active,
      p_display_order: promo.display_order,
      p_starts_at: promo.starts_at || null,
      p_ends_at: promo.ends_at || null
    });
    if (error) throw error;
    return data;
  }

  static async deletePromotion(id: string) {
    const { data, error } = await supabase.rpc('admin_delete_promotion', {
      p_promo_id: id
    });
    if (error) throw error;
    return data;
  }
}
