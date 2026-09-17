import React, { useState, useEffect } from 'react';
import './FinanceSettlements.css';
import { IndianRupee, Users, Calendar, X, AlertCircle } from 'lucide-react';
import { FinanceService } from '../../../services/api/FinanceService';
import { supabase } from '../../../services/api/supabaseClient';
import { DataTable } from '../../../components/Admin/DataTable';
import { useApp } from '../../../context/AppContext';

// Helpers to define current active periods
const getCurrentPickerPeriod = () => {
  const today = new Date();
  const currentDay = today.getDay();
  const daysToWednesday = currentDay >= 3 ? currentDay - 3 : currentDay + 4;
  const start = new Date(today);
  start.setDate(today.getDate() - daysToWednesday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
};

const getCurrentDriverPeriod = () => {
  const today = new Date();
  const currentDay = today.getDay();
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const start = new Date(today);
  start.setDate(today.getDate() - daysToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
};

export const FinanceSettlements: React.FC = () => {
  const { addToast } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [roster, setRoster] = useState<any[]>([]);
  
  // Modal State
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [driverSummary, setDriverSummary] = useState<any>(null);
  const [warehouseSalaryConfig, setWarehouseSalaryConfig] = useState<any>(null);

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configAmount, setConfigAmount] = useState('');
  const [configDate, setConfigDate] = useState('');
  const [configSaving, setConfigSaving] = useState(false);

  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjType, setAdjType] = useState<'addition'|'deduction'>('addition');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  
  // Array of { date, shiftEarnings, bonus, deductions, dailyTotal }
  const [dailyActivity, setDailyActivity] = useState<any[]>([]);

  const pickerPeriod = getCurrentPickerPeriod();
  const driverPeriod = getCurrentDriverPeriod();

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      const staff = await FinanceService.getStaffRoster();
      const ps = await FinanceService.getPickerSettlements();
      const ds = await FinanceService.getDriverSettlements();
      
      const currentMonth = new Date();
      currentMonth.setDate(1);
      const isoMonth = currentMonth.toISOString().split('T')[0];
      const wp = await FinanceService.getWarehousePayroll(isoMonth);

      const combinedRoster = staff.map(member => {
        let matchedSettlement = null;
        let periodDisplay = '';
        let periodRaw = { start: '', end: '' };
        
        if (member.role === 'picker') {
          matchedSettlement = ps.find(s => s.staff_id === member.id && s.week_start === pickerPeriod.start);
          periodDisplay = `${new Date(pickerPeriod.start).toLocaleDateString()} - ${new Date(pickerPeriod.end).toLocaleDateString()}`;
          periodRaw = { start: pickerPeriod.start, end: pickerPeriod.end };
        } else if (member.role === 'driver') {
          matchedSettlement = ds.find(s => s.driver_id === member.id && s.week_start === driverPeriod.start);
          periodDisplay = `${new Date(driverPeriod.start).toLocaleDateString()} - ${new Date(driverPeriod.end).toLocaleDateString()}`;
          periodRaw = { start: driverPeriod.start, end: driverPeriod.end };
        } else if (member.role === 'warehouse_staff') {
          matchedSettlement = wp.find(w => w.staff_id === member.id && w.salary_month === isoMonth);
          periodDisplay = new Date(isoMonth).toLocaleDateString(undefined, {month: 'short', year: 'numeric'});
          periodRaw = { start: isoMonth, end: 'Monthly' };
        }

        const roleLabels: Record<string, string> = {
          picker: 'Picker',
          driver: 'Driver',
          warehouse_staff: 'Warehouse Staff'
        };

        return {
          id: member.id,
          name: member.full_name || 'Unknown',
          employee_id: member.employee_id || '—',
          role: roleLabels[member.role] || member.role,
          roleRaw: member.role,
          warehouse: member.warehouses?.name || '—',
          warehouse_id: member.warehouse_id,
          periodDisplay,
          periodRaw,
          hasSettlement: !!matchedSettlement,
          net_amount: matchedSettlement ? Number(matchedSettlement.net_amount || matchedSettlement.net_salary || matchedSettlement.total_amount || 0) : null,
          status: matchedSettlement ? matchedSettlement.status : 'NOT GENERATED',
          details: matchedSettlement
        };
      });

      setRoster(combinedRoster);

    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (!supabase) return;
    const channel = supabase.channel('staff_payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picker_settlements' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_settlements' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_staff_payroll' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const openView = async (staff: any) => {
    setSelectedStaff(staff);
    setIsModalOpen(true);
    setModalLoading(true);
    setDailyActivity([]);
    setDriverSummary(null);
    setWarehouseSalaryConfig(null);

    try {
      if (!supabase) return;

      const dateMap: Record<string, any> = {};

      if (staff.roleRaw === 'picker') {
        const { data: payouts } = await supabase.from('staff_shift_payouts')
          .select('*')
          .eq('staff_id', staff.id)
          .gte('earning_date', staff.periodRaw.start)
          .lte('earning_date', staff.periodRaw.end);
        
        const { data: bonuses } = await supabase.from('picker_bonus_awards')
          .select('*')
          .eq('staff_id', staff.id)
          .gte('earning_date', staff.periodRaw.start)
          .lte('earning_date', staff.periodRaw.end);
        
        (payouts || []).forEach((p: any) => {
          if (!dateMap[p.earning_date]) dateMap[p.earning_date] = { date: p.earning_date, shiftEarnings: 0, bonus: 0, deductions: 0 };
          dateMap[p.earning_date].shiftEarnings += Number(p.total_amount || 0);
          // if deductions exist in payouts later, add here
        });

        (bonuses || []).forEach((b: any) => {
          if (!dateMap[b.earning_date]) dateMap[b.earning_date] = { date: b.earning_date, shiftEarnings: 0, bonus: 0, deductions: 0 };
          dateMap[b.earning_date].bonus += Number(b.incremental_award_amount || 0);
        });

      } else if (staff.roleRaw === 'driver') {
        const { data: sumData } = await supabase.from('driver_financial_summary').select('*').eq('driver_id', staff.id).single();
        if (sumData) setDriverSummary(sumData);

        const { data: earnings } = await supabase.from('driver_financial_ledger')
          .select('*')
          .eq('driver_id', staff.id)
          .gte('occurred_at', `${staff.periodRaw.start}T00:00:00Z`)
          .lte('occurred_at', `${staff.periodRaw.end}T23:59:59Z`)
          .in('transaction_type', ['delivery_earning', 'customer_tip', 'incentive', 'penalty', 'adjustment']);
        
        (earnings || []).forEach((e: any) => {
          const d = e.occurred_at.split('T')[0];
          if (!dateMap[d]) dateMap[d] = { date: d, shiftEarnings: 0, bonus: 0, deductions: 0 };
          
          if (e.transaction_type === 'delivery_earning' || e.transaction_type === 'customer_tip') {
            dateMap[d].shiftEarnings += Number(e.amount || 0);
          } else if (e.transaction_type === 'incentive' || e.transaction_type === 'adjustment' && Number(e.amount) > 0) {
            dateMap[d].bonus += Number(e.amount || 0);
          } else if (e.transaction_type === 'penalty' || e.transaction_type === 'adjustment' && Number(e.amount) < 0) {
            dateMap[d].deductions += Math.abs(Number(e.amount || 0));
          }
        });
      } else if (staff.roleRaw === 'warehouse_staff') {
        const config = await FinanceService.getWarehouseStaffSalaryConfig(staff.id);
        setWarehouseSalaryConfig(config);
      }

      const activityArray = Object.values(dateMap).map((a: any) => ({
        ...a,
        dailyTotal: a.shiftEarnings + a.bonus - a.deductions
      })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setDailyActivity(activityArray);
    } catch (e: any) {
      addToast('Failed to load activity details: ' + e.message, 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const closeView = () => {
    setIsModalOpen(false);
    setSelectedStaff(null);
  };

  const openConfigModal = (currentSalary?: any) => {
    setConfigAmount(currentSalary ? String(currentSalary) : '');
    setConfigDate(selectedStaff?.periodRaw?.start || '');
    setConfigModalOpen(true);
  };

  const handleSaveConfig = async () => {
    const val = Number(configAmount);
    if (!val || isNaN(val) || val <= 0) {
      addToast('Please enter a valid salary amount greater than ₹0', 'error');
      return;
    }
    if (!configDate) {
      addToast('Please select an effective date', 'error');
      return;
    }

    const confirmMsg = `Configure monthly salary of ₹${val} for ${selectedStaff.name} effective ${new Date(configDate).toLocaleDateString()}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setConfigSaving(true);
      await FinanceService.configureWarehouseSalary(selectedStaff.id, val, configDate);
      addToast('Salary configured successfully', 'success');
      setConfigModalOpen(false);
      openView(selectedStaff); // reload the view
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setConfigSaving(false);
    }
  };

  const handleGeneratePayroll = async () => {
    const val = Number(warehouseSalaryConfig?.monthly_base_salary);
    const confirmMsg = `Generate payroll?\nEmployee: ${selectedStaff.name} (${selectedStaff.employee_id})\nWarehouse: ${selectedStaff.warehouse}\nPayroll Month: ${selectedStaff.periodRaw.start}\nConfigured Base Salary: ₹${val}`;
    if (!window.confirm(confirmMsg)) return;

    if (!selectedStaff.warehouse_id) {
      addToast('Cannot generate payroll: warehouse assignment is missing.', 'error');
      return;
    }

    try {
      setModalLoading(true);
      await FinanceService.generateWarehousePayroll(selectedStaff.warehouse_id, selectedStaff.periodRaw.start, [selectedStaff.id]);
      addToast('Payroll generated successfully', 'success');
      
      // Close the view so that when it's reopened or when the roster updates, it shows the new status
      closeView();
      await loadData(); // Reload main roster to reflect changes
    } catch (e: any) {
      addToast(e.message, 'error');
      setModalLoading(false);
    }
  };

  const openAdjModal = () => {
    setAdjType('addition');
    setAdjAmount('');
    setAdjReason('');
    setAdjModalOpen(true);
  };

  const handleSaveAdj = async () => {
    const val = Number(adjAmount);
    if (!val || isNaN(val) || val <= 0) {
      addToast('Please enter a valid positive amount', 'error');
      return;
    }
    if (!adjReason.trim()) {
      addToast('Please enter a reason', 'error');
      return;
    }

    if (!selectedStaff?.details?.id) {
      addToast('Cannot adjust: invalid payroll record', 'error');
      return;
    }

    try {
      setAdjSaving(true);
      await FinanceService.addPayrollAdjustment(selectedStaff.details.id, adjType, val, adjReason.trim());
      addToast('Adjustment added successfully', 'success');
      setAdjModalOpen(false);
      
      // Reload authoritative data
      const isoMonth = selectedStaff.periodRaw.start; 
      const wp = await FinanceService.getWarehousePayroll(isoMonth);
      const updatedDetails = wp.find(w => w.staff_id === selectedStaff.id && w.salary_month === isoMonth);
      if (updatedDetails) {
        setSelectedStaff({ 
          ...selectedStaff, 
          details: updatedDetails, 
          status: updatedDetails.status, 
          net_amount: updatedDetails.net_salary 
        });
      }
      
      // Also reload background roster
      loadData();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setAdjSaving(false);
    }
  };

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Staff Roster...</div>;

  return (
    <div className="container animate-slide-up">
      <div className="welcome-banner" style={{ marginBottom: '24px' }}>
        <div>
          <h2 className="title">Staff Payments</h2>
          <p className="subtitle">Manage unified payouts for Pickers, Drivers, and Warehouse Staff.</p>
        </div>
        <Users size={36} color="var(--primary)" />
      </div>

      <div className="panel-card glass-panel animate-slide-up">
        <div className="panel-header">
          <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={18} color="var(--primary)" /> Staff Roster</h3>
        </div>
        <div style={{ marginTop: '16px' }}>
          {roster.length > 0 ? (
            <DataTable
              data={roster}
              keyExtractor={s => s.id}
              columns={[
                { key: 'name', header: 'NAME', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
                { key: 'employee_id', header: 'EMPLOYEE ID', sortable: true },
                { key: 'role', header: 'ROLE', sortable: true },
                { key: 'warehouse', header: 'WAREHOUSE' },
                { key: 'period', header: 'CURRENT PAY PERIOD', render: r => <span style={{ fontSize: '0.85rem' }}>{r.periodDisplay}</span> },
                { key: 'status', header: 'STATUS', render: r => {
                  if (r.status === 'NOT GENERATED') {
                    return <span className="admin-badge" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>NOT GENERATED</span>;
                  }
                  return (
                    <span className={r.status === 'paid' ? "admin-badge-success" : "admin-badge-warning"}>
                      {r.status.toUpperCase()}
                    </span>
                  );
                }},
                { key: 'actions', header: 'ACTIONS', render: r => (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => openView(r)}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      View
                    </button>
                    {r.hasSettlement && r.status !== 'paid' && (
                      <button disabled style={{ padding: '6px 12px', fontSize: '0.75rem', backgroundColor: '#e2e8f0', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'not-allowed' }} title="Payment integration pending">
                        Pay
                      </button>
                    )}
                  </div>
                )}
              ]}
            />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No staff members found.</div>
          )}
        </div>
      </div>

      {isModalOpen && selectedStaff && (
        <div className="modal-overlay animate-fade-in" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '800px', color: 'var(--text-primary)', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {selectedStaff.name} | {selectedStaff.employee_id} | {selectedStaff.role} | {selectedStaff.warehouse}
                </h3>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Period: {selectedStaff.periodDisplay}
                </p>
              </div>
              <button onClick={closeView} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>

            {selectedStaff.roleRaw === 'driver' ? (
              <div style={{ backgroundColor: 'var(--bg-base)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>SETTLEMENT STATUS</span>
                    {selectedStaff.status === 'NOT GENERATED' ? (
                      <span className="admin-badge" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', fontWeight: 600 }}>NOT GENERATED</span>
                    ) : (
                      <span className={selectedStaff.status === 'paid' ? "admin-badge-success" : "admin-badge-warning"} style={{ fontWeight: 600 }}>
                        {selectedStaff.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>PERIOD EARNINGS</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      ₹{dailyActivity.reduce((sum, d) => sum + d.shiftEarnings + d.bonus, 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>PERIOD DEDUCTIONS</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--error)' }}>
                      ₹{dailyActivity.reduce((sum, d) => sum + d.deductions, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>PERIOD NET</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      ₹{dailyActivity.reduce((sum, d) => sum + d.dailyTotal, 0).toFixed(2)}
                    </span>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>AVAILABLE PAYOUT</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>
                        ₹{Math.max(0, driverSummary?.pocket_balance || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedStaff.roleRaw === 'warehouse_staff' ? (
              <div style={{ backgroundColor: 'var(--bg-base)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>PAYROLL STATUS</span>
                    {selectedStaff.status === 'NOT GENERATED' ? (
                      <span className="admin-badge" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', fontWeight: 600 }}>NOT GENERATED</span>
                    ) : (
                      <span className={selectedStaff.status === 'paid' ? "admin-badge-success" : "admin-badge-warning"} style={{ fontWeight: 600 }}>
                        {selectedStaff.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {selectedStaff.details && (
                    <>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>BASE SALARY</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          ₹{Number(selectedStaff.details.base_salary || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>ADDITIONS / DEDUCTIONS</span>
                          {selectedStaff.status === 'pending' && (
                            <button onClick={openAdjModal} style={{ fontSize: '0.7rem', padding: '2px 6px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>+ Add</button>
                          )}
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          +₹{Number(selectedStaff.details.additions || 0).toFixed(2)} / -₹{Number(selectedStaff.details.deductions || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>NET SALARY</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--success)' }}>
                          ₹{Number(selectedStaff.details.net_salary || 0).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: 'var(--bg-base)', padding: '16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>SETTLEMENT STATUS</span>
                  {selectedStaff.status === 'NOT GENERATED' ? (
                    <span className="admin-badge" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', fontWeight: 600 }}>NOT GENERATED</span>
                  ) : (
                    <span className={selectedStaff.status === 'paid' ? "admin-badge-success" : "admin-badge-warning"} style={{ fontWeight: 600 }}>
                      {selectedStaff.status.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>CURRENT PERIOD EARNINGS</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {selectedStaff.net_amount !== null 
                      ? `₹${selectedStaff.net_amount.toFixed(2)}` 
                      : `₹${dailyActivity.reduce((sum, d) => sum + d.dailyTotal, 0).toFixed(2)}`}
                  </span>
                </div>
              </div>
            )}

            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>Detail</h4>
              
              {modalLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading authoritative activity...</div>
              ) : selectedStaff.roleRaw === 'warehouse_staff' ? (
                <div style={{ padding: '24px', backgroundColor: 'var(--bg-base)', borderRadius: '8px', color: 'var(--text-primary)' }}>
                  {selectedStaff.status === 'NOT GENERATED' ? (
                    <>
                      <h5 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>MONTHLY SALARY CONFIGURATION</h5>
                      {warehouseSalaryConfig ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                              <span style={{ display: 'block', fontSize: '1.2rem', fontWeight: 600 }}>₹{Number(warehouseSalaryConfig.monthly_base_salary).toFixed(2)} / month</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Effective from {new Date(warehouseSalaryConfig.effective_from).toLocaleDateString()}</span>
                            </div>
                            <button onClick={() => openConfigModal(warehouseSalaryConfig.monthly_base_salary)} style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Update Salary</button>
                          </div>
                          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleGeneratePayroll} style={{ padding: '8px 16px', fontSize: '0.85rem', backgroundColor: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Generate Payroll</button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--error)', fontWeight: 600 }}>Salary: NOT CONFIGURED</span>
                          <button onClick={() => openConfigModal()} style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Configure Salary</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <span>Monthly payroll is fixed and does not have daily shift details.</span>
                    </div>
                  )}
                </div>
              ) : dailyActivity.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', backgroundColor: 'var(--bg-base)', borderRadius: '8px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={24} color="#94a3b8" />
                  <span>No earnings recorded for this period.</span>
                </div>
              ) : (
                <DataTable
                  data={dailyActivity}
                  keyExtractor={r => r.date}
                  columns={[
                    { key: 'date', header: 'DATE', render: r => <span>{new Date(r.date).toLocaleDateString()}</span> },
                    { key: 'shiftEarnings', header: 'SHIFT EARNINGS', render: r => <span>₹{r.shiftEarnings.toFixed(2)}</span> },
                    { key: 'bonus', header: 'BONUS', render: r => <span>₹{r.bonus.toFixed(2)}</span> },
                    { key: 'deductions', header: 'DEDUCTIONS', render: r => <span>₹{r.deductions.toFixed(2)}</span> },
                    { key: 'dailyTotal', header: 'DAILY TOTAL', render: r => <span style={{ fontWeight: 600 }}>₹{r.dailyTotal.toFixed(2)}</span> }
                  ]}
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button 
                onClick={closeView}
                style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {configModalOpen && selectedStaff && (
        <div className="modal-overlay animate-fade-in" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', color: 'var(--text-primary)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Configure Monthly Salary</h3>
            
            <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <p style={{ margin: '0 0 4px 0' }}><strong>Employee:</strong> {selectedStaff.name} ({selectedStaff.employee_id})</p>
              <p style={{ margin: '0 0 4px 0' }}><strong>Warehouse:</strong> {selectedStaff.warehouse}</p>
              <p style={{ margin: 0 }}><strong>Role:</strong> Warehouse Staff</p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>Monthly Base Salary (₹)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={configAmount}
                onChange={(e) => setConfigAmount(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                placeholder="e.g. 15000"
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>Effective From Date</label>
              <input
                type="date"
                value={configDate}
                onChange={(e) => setConfigDate(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setConfigModalOpen(false)}
                disabled={configSaving}
                style={{ padding: '10px 16px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveConfig}
                disabled={configSaving}
                style={{ padding: '10px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600, opacity: configSaving ? 0.7 : 1 }}
              >
                {configSaving ? 'Saving...' : 'Save Salary'}
              </button>
            </div>
          </div>
        </div>
      )}

      {adjModalOpen && selectedStaff && (
        <div className="modal-overlay animate-fade-in" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', color: 'var(--text-primary)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Add Payroll Adjustment</h3>
            
            <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <p style={{ margin: '0 0 4px 0' }}><strong>Employee:</strong> {selectedStaff.name} ({selectedStaff.employee_id})</p>
              <p style={{ margin: '0 0 4px 0' }}><strong>Warehouse:</strong> {selectedStaff.warehouse}</p>
              <p style={{ margin: '0 0 4px 0' }}><strong>Payroll Month:</strong> {selectedStaff.periodRaw.start}</p>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-light)' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', display: 'block' }}>Current Base</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{Number(selectedStaff.details?.base_salary || 0).toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', display: 'block' }}>Current Net</span>
                  <span style={{ fontWeight: 600, color: 'var(--success)' }}>₹{Number(selectedStaff.details?.net_salary || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>Adjustment Type</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => setAdjType('addition')}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid', borderColor: adjType === 'addition' ? 'var(--primary)' : 'var(--border-light)', backgroundColor: adjType === 'addition' ? 'var(--primary)' : 'var(--bg-base)', color: adjType === 'addition' ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Addition
                </button>
                <button 
                  onClick={() => setAdjType('deduction')}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid', borderColor: adjType === 'deduction' ? 'var(--error)' : 'var(--border-light)', backgroundColor: adjType === 'deduction' ? 'var(--error)' : 'var(--bg-base)', color: adjType === 'deduction' ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Deduction
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>Amount (₹)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                placeholder="e.g. 500"
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>Reason</label>
              <textarea
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', boxSizing: 'border-box', resize: 'vertical', minHeight: '60px' }}
                placeholder="Required explanation..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setAdjModalOpen(false)}
                disabled={adjSaving}
                style={{ padding: '10px 16px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveAdj}
                disabled={adjSaving}
                style={{ padding: '10px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600, opacity: adjSaving ? 0.7 : 1 }}
              >
                {adjSaving ? 'Saving...' : 'Add Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
