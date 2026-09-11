import { supabase } from './supabaseClient';
import type { Category } from '../../types';

export class CategoriesService {
  static async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return data || [];
  }
}
