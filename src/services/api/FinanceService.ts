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
      .select('*, order:orders(customer:profiles!customer_id(full_name)), driver:profiles!driver_id(full_name, employee_id)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  static async adminSettleDriverCod(driverId: string, orderIds: string[], reference: string): Promise<string> {
    if (!supabase) throw new Error('Supabase not configured');
    
    const { data, error } = await supabase.rpc('admin_settle_driver_cod', {
      p_driver_id: driverId,
      p_order_ids: orderIds,
      p_payment_reference: reference
    });

    if (error) throw error;
    return data;
  }

  // Deprecated: Operational marking only, does not settle financial ledger
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

  // --- Picker Settlements ---
  static async createPickerSettlements(warehouseId: string, weekStart: string, staffIds: string[]): Promise<any> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('create_picker_settlement_batch', {
      p_warehouse_id: warehouseId,
      p_week_start: weekStart,
      p_staff_ids: staffIds
    });
    if (error) throw error;
    return data;
  }

  static async markPickerSettlementPaid(settlementId: string, reference: string, method: string, provider: string = 'manual'): Promise<any> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('mark_picker_settlement_paid', {
      p_settlement_id: settlementId,
      p_payment_reference: reference,
      p_payment_method: method,
      p_payment_provider: provider
    });
    if (error) throw error;
    return data;
  }

  static async markDriverSettlementPaid(settlementId: string, reference: string, method: string, provider: string = 'manual'): Promise<any> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('mark_driver_settlement_paid', {
      p_settlement_id: settlementId,
      p_payment_reference: reference,
      p_payment_method: method,
      p_payment_provider: provider
    });
    if (error) throw error;
    return data;
  }

  static async getStaffRoster(): Promise<any[]> {
    if (!supabase) return [];
    
    // Fetch test accounts to exclude them authoritatively
    const { data: testAccounts } = await supabase.from('dev_test_accounts').select('email').eq('is_e2e_test_account', true);
    const testEmails = new Set((testAccounts || []).map((t: any) => t.email));

    // Fetch authoritative driver onboarding statuses
    const { data: driverOnboarding } = await supabase.from('driver_onboarding').select('id, status');
    const approvedDrivers = new Set(
      (driverOnboarding || [])
        .filter((d: any) => d.status === 'approved')
        .map((d: any) => d.id)
    );

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, employee_id, warehouse_id, is_pending_staff, is_suspended')
      .in('role', ['picker', 'driver', 'warehouse_staff'])
      .order('full_name', { ascending: true });
    
    if (error) throw error;
    if (!profiles) return [];
    
    // Authoritative Eligibility Filter
    const eligibleStaff = profiles.filter((p: any) => {
      const hasValidName = p.full_name && p.full_name.trim() !== '' && p.full_name.trim().toLowerCase() !== 'unknown';
      const hasValidId = p.employee_id && p.employee_id.trim() !== '' && p.employee_id.trim() !== '—' && p.employee_id.trim() !== '-';
      const isApproved = !p.is_pending_staff; 
      const isActive = !p.is_suspended;
      
      // All operational roles (including drivers) must have an active warehouse assignment
      const hasWarehouse = !!p.warehouse_id; 
      
      // Exclude profiles identified by dev_test_accounts architecture
      const isTestAccount = p.email && testEmails.has(p.email);

      // Driver-specific authoritative check
      let isRoleEligible = true;
      if (p.role === 'driver') {
        isRoleEligible = approvedDrivers.has(p.id);
      }
      
      // Consistency check: ensure we have normal EMP- ID prefix pattern, though not as sole proof
      const isEMP = p.employee_id && p.employee_id.startsWith('EMP-');
      
      return hasValidName && hasValidId && isApproved && isActive && hasWarehouse && !isTestAccount && isRoleEligible;
    });

    const { data: warehouses } = await supabase.from('warehouses').select('id, name');
    const warehouseMap = (warehouses || []).reduce((acc: any, w: any) => { acc[w.id] = w.name; return acc; }, {});

    return eligibleStaff.map((p: any) => ({
      ...p,
      warehouses: { name: p.warehouse_id ? (warehouseMap[p.warehouse_id] || 'Unassigned') : 'Unassigned' }
    }));
  }

  static async getPickerSettlements(warehouseId?: string): Promise<any[]> {
    if (!supabase) return [];
    let query = supabase.from('picker_settlements').select('*, profiles!staff_id(full_name, id, role, employee_id), picker_settlement_items(*)').order('created_at', { ascending: false });
    if (warehouseId) query = query.eq('warehouse_id', warehouseId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data) return [];

    const { data: warehouses } = await supabase.from('warehouses').select('id, name');
    const warehouseMap = (warehouses || []).reduce((acc: any, w: any) => { acc[w.id] = w.name; return acc; }, {});

    return data.map((s: any) => ({
      ...s,
      warehouses: { name: s.warehouse_id ? (warehouseMap[s.warehouse_id] || 'Unassigned') : 'Unassigned' }
    }));
  }

  static async getDriverSettlements(warehouseId?: string): Promise<any[]> {
    if (!supabase) return [];
    let query = supabase.from('driver_settlements').select('*, profiles!driver_id(full_name, id, role, employee_id), driver_settlement_items(*)').order('created_at', { ascending: false });
    if (warehouseId) query = query.eq('warehouse_id', warehouseId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data) return [];

    const { data: warehouses } = await supabase.from('warehouses').select('id, name');
    const warehouseMap = (warehouses || []).reduce((acc: any, w: any) => { acc[w.id] = w.name; return acc; }, {});

    return data.map((s: any) => ({
      ...s,
      warehouses: { name: s.warehouse_id ? (warehouseMap[s.warehouse_id] || 'Unassigned') : 'Unassigned' }
    }));
  }

  // --- Warehouse Payroll ---
  static async configureWarehouseSalary(staffId: string, monthlySalary: number, effectiveFrom: string): Promise<any> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('configure_warehouse_salary', {
      p_staff_id: staffId,
      p_monthly_salary: monthlySalary,
      p_effective_from: effectiveFrom
    });
    if (error) throw error;
    return data;
  }

  static async generateWarehousePayroll(warehouseId: string, salaryMonth: string, staffIds: string[]): Promise<any> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('generate_warehouse_payroll', {
      p_warehouse_id: warehouseId,
      p_salary_month: salaryMonth,
      p_staff_ids: staffIds
    });
    if (error) throw error;
    return data;
  }

  static async addPayrollAdjustment(payrollId: string, type: 'addition'|'deduction', amount: number, reason: string): Promise<any> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('add_payroll_adjustment', {
      p_payroll_id: payrollId,
      p_type: type,
      p_amount: amount,
      p_reason: reason
    });
    if (error) throw error;
    return data;
  }

  static async markPayrollPaid(payrollId: string, reference: string, method: string, provider: string = 'manual'): Promise<any> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('mark_payroll_paid', {
      p_payroll_id: payrollId,
      p_payment_reference: reference,
      p_payment_method: method,
      p_payment_provider: provider
    });
    if (error) throw error;
    return data;
  }

  static async executeTestPayout(id: string, role: string): Promise<string> {
    const reference = `FGTEST-${Date.now()}`;
    const method = 'bank_transfer';
    const provider = 'FlashGO Test Payout';

    if (role === 'picker') {
      await this.markPickerSettlementPaid(id, reference, method, provider);
    } else if (role === 'driver') {
      await this.markDriverSettlementPaid(id, reference, method, provider);
    } else if (role === 'warehouse_staff') {
      await this.markPayrollPaid(id, reference, method, provider);
    } else {
      throw new Error(`Test payout not supported for role: ${role}`);
    }
    return reference;
  }

  static async getWarehousePayroll(month: string): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('warehouse_staff_payroll')
      .select('*, profiles!staff_id(full_name, id)')
      .eq('salary_month', month)
      .order('generated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async getWarehouseStaffSalaryConfig(staffId: string): Promise<any> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('warehouse_staff_salary_configs')
      .select('*')
      .eq('staff_id', staffId)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 is not found
      throw error;
    }
    return data;
  }
}
