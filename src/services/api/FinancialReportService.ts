import { supabase } from './supabaseClient';

export interface FinancialSummaryData {
  gov: number;
  net_revenue: number;
  delivered_orders: number;
  aov: number;
  online_revenue: number;
  cod_revenue: number;
  refunds: number;
  discounts: number;
  picker_payouts: number;
  driver_payouts: number;
  warehouse_payroll: number;
  procurement_spend: number;
}

export interface FinancialExportData {
  revenue_by_date: any[];
  warehouse_performance: any[];
  orders: any[];
  category_sales: any[];
  payment_breakdown: any[];
  refunds: any[];
  workforce_payouts: any[];
  warehouse_payroll: any[];
  procurement_spend: any[];
}

export class FinancialReportService {
  static async getDashboardSummary(
    startDate: Date,
    endDate: Date,
    warehouseId: string | null = null
  ): Promise<FinancialSummaryData> {
    const { data, error } = await supabase.rpc('admin_get_financial_dashboard_summary', {
      p_start_date: startDate.toISOString(),
      p_end_date: endDate.toISOString(),
      p_warehouse_id: warehouseId
    });

    if (error) {
      throw error;
    }

    return data as FinancialSummaryData;
  }

  static async getExportData(
    startDate: Date,
    endDate: Date,
    warehouseId: string | null = null
  ): Promise<FinancialExportData> {
    const { data, error } = await supabase.rpc('admin_get_financial_export_data', {
      p_start_date: startDate.toISOString(),
      p_end_date: endDate.toISOString(),
      p_warehouse_id: warehouseId
    });

    if (error) {
      throw error;
    }

    return data as FinancialExportData;
  }
}
