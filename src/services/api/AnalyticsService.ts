import { supabase } from './supabaseClient';

export class AnalyticsService {
  static async getAdminDashboardStats(warehouseId?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('get_admin_dashboard_stats', {
      p_warehouse_id: warehouseId || null
    });
    if (error) {
      console.error('Error in getAdminDashboardStats:', error);
      throw error;
    }
    return data;
  }

  static async getInventoryAnalytics() {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('get_inventory_analytics');
    if (error) {
      console.error('Error in getInventoryAnalytics:', error);
      throw error;
    }
    return data;
  }

  static async getFinanceAnalytics() {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('get_finance_analytics');
    if (error) {
      console.error('Error in getFinanceAnalytics:', error);
      throw error;
    }
    return data;
  }

  static async getSalesTrends(timeframe: string, warehouseId?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('get_sales_trends', { 
      p_timeframe: timeframe,
      p_warehouse_id: warehouseId || null
    });
    if (error) {
      console.error('Error in getSalesTrends:', error);
      throw error;
    }
    return data;
  }
  
  static async getSalesTrendsCustom(startDate: string, endDate: string, warehouseId?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('get_sales_trends_custom', { 
      p_start_date: startDate,
      p_end_date: endDate,
      p_warehouse_id: warehouseId || null
    });
    if (error) {
      console.error('Error in getSalesTrendsCustom:', error);
      throw error;
    }
    return data;
  }

  static async getOrdersPerHour(warehouseId?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('get_orders_per_hour', {
      p_warehouse_id: warehouseId || null
    });
    if (error) {
      console.error('Error in getOrdersPerHour:', error);
      throw error;
    }
    return data;
  }

  static async getDashboardInventoryAlerts(warehouseId?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('get_dashboard_inventory_alerts', {
      p_warehouse_id: warehouseId || null
    });
    if (error) {
      console.error('Error in getDashboardInventoryAlerts:', error);
      throw error;
    }
    return data;
  }

  static async getProductPerformance(startDate: string, endDate: string, warehouseId?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase.rpc('get_product_performance', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_warehouse_id: warehouseId || null
    });
    if (error) throw error;
    return data;
  }

  static async getFinancialLedgerExport(startDate: string, endDate: string, warehouseId?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase.rpc('get_financial_ledger_export', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_warehouse_id: warehouseId || null
    });
    if (error) throw error;
    return data;
  }
}
