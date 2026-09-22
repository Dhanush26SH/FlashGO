import React, { useState, useEffect } from 'react';
import './FinanceSettlements.css';
import { IndianRupee, Users, Calendar, X, AlertCircle, Info, Filter, Edit2, Check } from 'lucide-react';
import { FinanceService } from '../../../services/api/FinanceService';
import { supabase } from '../../../services/api/supabaseClient';
import { DataTable } from '../../../components/Admin/DataTable';
import { useApp } from '../../../context/AppContext';

const toLocalIso = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
};

const getIstToUtcInterval = (startDateStr: string, endDateStr: string) => {
  const startUtc = new Date(new Date(`${startDateStr}T00:00:00Z`).getTime() - (5.5 * 3600000)).toISOString();
  const endIst = new Date(`${endDateStr}T00:00:00Z`);
  endIst.setDate(endIst.getDate() + 1);
  const endExclusiveUtc = new Date(endIst.getTime() - (5.5 * 3600000)).toISOString();
  return { startUtc, endExclusiveUtc };
};

const generatePickerPeriods = (n = 52) => {
  const periods = [];
  let d = new Date();
  const currentDay = d.getDay();
  const daysToWednesday = currentDay >= 3 ? currentDay - 3 : currentDay + 4;
  d.setDate(d.getDate() - daysToWednesday);
  d.setHours(0,0,0,0);
  
  for (let i = 0; i < n; i++) {
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const startIso = toLocalIso(start);
    const label = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    periods.push({ start: startIso, label, rawEnd: toLocalIso(end) });
    d.setDate(d.getDate() - 7);
  }
  return periods;
};

const generateDriverPeriods = (n = 52) => {
  const periods = [];
  let d = new Date();
  const currentDay = d.getDay();
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
  d.setDate(d.getDate() - daysToMonday);
  d.setHours(0,0,0,0);
  
  for (let i = 0; i < n; i++) {
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const startIso = toLocalIso(start);
    const label = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    periods.push({ start: startIso, label, rawEnd: toLocalIso(end) });
    d.setDate(d.getDate() - 7);
  }
  return periods;
};

const generateWarehousePeriods = (n = 12) => {
  const periods = [];
  let d = new Date();
  d.setDate(1);
  d.setHours(0,0,0,0);
  
  for (let i = 0; i < n; i++) {
    const isoMonth = toLocalIso(d);
    const label = d.toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
    periods.push({ start: isoMonth, label, rawEnd: 'Monthly' });
    d.setMonth(d.getMonth() - 1);
  }
  return periods;
};

const pickerPeriods = generatePickerPeriods();
const driverPeriods = generateDriverPeriods();
const warehousePeriods = generateWarehousePeriods();

export const FinanceSettlements: React.FC = () => {
  const { addToast } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [roster, setRoster] = useState<any[]>([]);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'picker' | 'driver' | 'warehouse_staff'>('picker');
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
  const [pickerPeriodStr, setPickerPeriodStr] = useState<string>(pickerPeriods[0].start);
  const [driverPeriodStr, setDriverPeriodStr] = useState<string>(driverPeriods[0].start);
  const [warehousePeriodStr, setWarehousePeriodStr] = useState<string>(warehousePeriods[0].start);
  const [unpaidCounts, setUnpaidCounts] = useState({ picker: 0, driver: 0, warehouse_staff: 0 });

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

  const [testPayModalOpen, setTestPayModalOpen] = useState(false);
  const [testPayLoading, setTestPayLoading] = useState(false);

  const [staffDetailsModalOpen, setStaffDetailsModalOpen] = useState(false);
  const [selectedStaffInfo, setSelectedStaffInfo] = useState<any>(null);
  const [staffPayoutDetails, setStaffPayoutDetails] = useState<any>(null);
  const [staffPhone, setStaffPhone] = useState<string | null>(null);
  const [staffDetailsLoading, setStaffDetailsLoading] = useState(false);

  // Phone editing state
  const [phoneEditMode, setPhoneEditMode] = useState(false);
  const [phoneEditValue, setPhoneEditValue] = useState('');
  const [phoneEditSaving, setPhoneEditSaving] = useState(false);
  const [phoneEditError, setPhoneEditError] = useState('');
  
  const [dailyActivity, setDailyActivity] = useState<any[]>([]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      const [pickerU, driverU, whU] = await Promise.all([
        FinanceService.getOutstandingPickerPayables(),
        FinanceService.getOutstandingDriverPayables(),
        FinanceService.getOutstandingWarehousePayables()
      ]);
      
      setUnpaidCounts({
        picker: pickerU.length,
        driver: driverU.length,
        warehouse_staff: whU.length
      });

      const staff = await FinanceService.getStaffRoster();
      let combinedRoster: any[] = [];

      if (showUnpaidOnly) {
        let outstandingItems: any[] = [];
        if (activeTab === 'picker') outstandingItems = pickerU;
        else if (activeTab === 'driver') outstandingItems = driverU;
         else if (activeTab === 'warehouse_staff') outstandingItems = whU;

        combinedRoster = outstandingItems.map((s: any) => {
           let periodDisplay = '';
           let periodRaw = { start: '', end: '' };
           if (activeTab === 'picker' || activeTab === 'driver') {
             const start = parseLocalDate(s.week_start);
             const end = new Date(start);
             end.setDate(end.getDate() + 6);
             periodDisplay = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
             periodRaw = { start: s.week_start, end: toLocalIso(end) };
           } else {
             const d = parseLocalDate(s.salary_month);
             periodDisplay = d.toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
             periodRaw = { start: s.salary_month, end: 'Monthly' };
           }

           const member = staff.find(st => st.id === (s.staff_id || s.driver_id)) || s.profiles;

           return {
             id: member?.id || (s.staff_id || s.driver_id),
             name: member?.full_name || 'Unknown',
             employee_id: member?.employee_id || '—',
             role: activeTab,
             roleRaw: activeTab,
             warehouse: member?.warehouses?.name || s.warehouses?.name || '—',
             warehouse_id: member?.warehouse_id || s.warehouse_id,
             periodDisplay,
             periodRaw,
             hasSettlement: true,
             net_amount: Number(s.net_amount || s.net_salary || s.total_amount || 0),
             status: s.status,
             details: s
           };
        });
      } else {
        let matchedSettlements: any[] = [];
        let periodStart = '';
        let periodEnd = '';
        let periodDisplay = '';

        if (activeTab === 'picker') {
          periodStart = pickerPeriodStr;
          const end = parseLocalDate(periodStart);
          end.setDate(end.getDate() + 6);
          periodEnd = toLocalIso(end);
          periodDisplay = `${parseLocalDate(periodStart).toLocaleDateString()} - ${end.toLocaleDateString()}`;
          matchedSettlements = await FinanceService.getPickerSettlements(undefined, periodStart);
        } else if (activeTab === 'driver') {
          periodStart = driverPeriodStr;
          const end = parseLocalDate(periodStart);
          end.setDate(end.getDate() + 6);
          periodEnd = toLocalIso(end);
          periodDisplay = `${parseLocalDate(periodStart).toLocaleDateString()} - ${end.toLocaleDateString()}`;
          matchedSettlements = await FinanceService.getDriverSettlements(undefined, periodStart);
        } else if (activeTab === 'warehouse_staff') {
          periodStart = warehousePeriodStr;
          periodEnd = 'Monthly';
          periodDisplay = parseLocalDate(periodStart).toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
          matchedSettlements = await FinanceService.getWarehousePayroll(periodStart);
        }

        let activityMap = new Set<string>();
        if (activeTab === 'picker') {
           const { data: payouts } = await supabase.from('staff_shift_payouts').select('staff_id').gte('earning_date', periodStart).lte('earning_date', periodEnd);
           const { data: bonuses } = await supabase.from('picker_bonus_awards').select('staff_id').gte('earning_date', periodStart).lte('earning_date', periodEnd);
           (payouts || []).forEach((p:any) => activityMap.add(p.staff_id));
           (bonuses || []).forEach((b:any) => activityMap.add(b.staff_id));
        } else if (activeTab === 'driver') {
           const { startUtc, endExclusiveUtc } = getIstToUtcInterval(periodStart, periodEnd);
           const { data: ledgers } = await supabase.from('driver_financial_ledger').select('driver_id').gte('occurred_at', startUtc).lt('occurred_at', endExclusiveUtc);
           (ledgers || []).forEach((l:any) => activityMap.add(l.driver_id));
        } else if (activeTab === 'warehouse_staff') {
           // For warehouse, if they have salary configs or time logs in the month. Let's just assume we rely on settlements for now, or just show all for current period.
        }
        
        const settlementStaffIds = new Set(matchedSettlements.map(s => s.staff_id || s.driver_id));
        
        combinedRoster = staff.filter(member => {
            if (member.role !== activeTab) return false;
            
            const hasSettlement = settlementStaffIds.has(member.id);
            const hasActivity = activityMap.has(member.id);
            
            let isCurrentPeriod = false;
            if (activeTab === 'picker' && periodStart === pickerPeriods[0].start) isCurrentPeriod = true;
            if (activeTab === 'driver' && periodStart === driverPeriods[0].start) isCurrentPeriod = true;
            if (activeTab === 'warehouse_staff' && periodStart === warehousePeriods[0].start) isCurrentPeriod = true;

            if (isCurrentPeriod) return true;
            
            return hasSettlement || hasActivity;
        }).map(member => {
            const s = matchedSettlements.find(st => (st.staff_id === member.id || st.driver_id === member.id));
            
            return {
             id: member.id,
             name: member.full_name || 'Unknown',
             employee_id: member.employee_id || '—',
             role: activeTab,
             roleRaw: activeTab,
             warehouse: member.warehouses?.name || '—',
             warehouse_id: member.warehouse_id,
             periodDisplay,
             periodRaw: { start: periodStart, end: periodEnd },
             hasSettlement: !!s,
             net_amount: s ? Number(s.net_amount || s.net_salary || s.total_amount || 0) : null,
             status: s ? s.status : 'NOT GENERATED',
             details: s
           };
        });
        
        // Append former staff that have a settlement but are not in the current roster
        matchedSettlements.forEach(s => {
          const staffId = s.staff_id || s.driver_id;
          if (!combinedRoster.find(r => r.id === staffId)) {
            const member = s.profiles;
            combinedRoster.push({
             id: staffId,
             name: member?.full_name || 'Unknown',
             employee_id: member?.employee_id || '—',
             role: activeTab,
             roleRaw: activeTab,
             warehouse: s.warehouses?.name || '—',
             warehouse_id: s.warehouse_id,
             periodDisplay,
             periodRaw: { start: periodStart, end: periodEnd },
             hasSettlement: true,
             net_amount: Number(s.net_amount || s.net_salary || s.total_amount || 0),
             status: s.status,
             details: s
            });
          }
        });
      }

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
  }, [activeTab, pickerPeriodStr, driverPeriodStr, warehousePeriodStr, showUnpaidOnly]);

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
        });

        (bonuses || []).forEach((b: any) => {
          if (!dateMap[b.earning_date]) dateMap[b.earning_date] = { date: b.earning_date, shiftEarnings: 0, bonus: 0, deductions: 0 };
          dateMap[b.earning_date].bonus += Number(b.incremental_award_amount || 0);
        });

      } else if (staff.roleRaw === 'driver') {
        const { data: sumData } = await supabase.from('driver_financial_summary').select('*').eq('driver_id', staff.id).single();
        if (sumData) setDriverSummary(sumData);

        const { startUtc, endExclusiveUtc } = getIstToUtcInterval(staff.periodRaw.start, staff.periodRaw.end);

        const { data: earnings } = await supabase.from('driver_financial_ledger')
          .select('*')
          .eq('driver_id', staff.id)
          .gte('occurred_at', startUtc)
          .lt('occurred_at', endExclusiveUtc)
          .in('transaction_type', ['delivery_earning', 'customer_tip', 'incentive', 'penalty', 'adjustment']);
        
        (earnings || []).forEach((e: any) => {
          const istTime = new Date(new Date(e.occurred_at).getTime() + (5.5 * 3600000));
          const d = istTime.toISOString().split('T')[0];
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
      openView(selectedStaff); 
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
      closeView();
      await loadData(); 
    } catch (e: any) {
      addToast(e.message, 'error');
      setModalLoading(false);
    }
  };

  const handleGeneratePickerSettlement = async () => {
    const confirmMsg = `Generate weekly settlement for ${selectedStaff.name}?\nPeriod: ${selectedStaff.periodDisplay}`;
    if (!window.confirm(confirmMsg)) return;

    if (!selectedStaff.warehouse_id) {
      addToast('Cannot generate settlement: warehouse assignment is missing.', 'error');
      return;
    }

    try {
      setModalLoading(true);
      await FinanceService.createPickerSettlements(selectedStaff.warehouse_id, selectedStaff.periodRaw.start, [selectedStaff.id]);
      addToast('Picker settlement generated successfully', 'success');
      closeView();
      await loadData();
    } catch (e: any) {
      addToast(e.message, 'error');
      setModalLoading(false);
    }
  };

  const openStaffDetails = async (staff: any) => {
    setSelectedStaffInfo(staff);
    setStaffDetailsModalOpen(true);
    setStaffDetailsLoading(true);
    setStaffPayoutDetails(null);
    setStaffPhone(null);

    try {
      if (!supabase) return;
      
      const { data: profileData } = await supabase.from('profiles').select('phone').eq('id', staff.id).single();
      if (profileData) setStaffPhone(profileData.phone);
      
      const { data: payoutData } = await supabase.from('staff_payout_details').select('*').eq('staff_id', staff.id).single();
      if (payoutData) setStaffPayoutDetails(payoutData);

    } catch (e: any) {
      console.error('Failed to load staff details', e);
    } finally {
      setStaffDetailsLoading(false);
    }
  };

  const closeStaffDetails = () => {
    setStaffDetailsModalOpen(false);
    setSelectedStaffInfo(null);
    setStaffPayoutDetails(null);
    setStaffPhone(null);
    setPhoneEditMode(false);
    setPhoneEditError('');
  };

  const handleSavePhone = async () => {
    if (!selectedStaffInfo || !supabase) return;
    setPhoneEditError('');
    setPhoneEditSaving(true);
    
    try {
      const { error } = await supabase.rpc('admin_update_staff_phone', {
        p_staff_id: selectedStaffInfo.id,
        p_phone: phoneEditValue
      });
      
      if (error) throw error;
      
      setStaffPhone(phoneEditValue);
      setPhoneEditMode(false);
      addToast('Phone number updated successfully', 'success');
    } catch (e: any) {
      console.error('Failed to update phone', e);
      setPhoneEditError(e.message || 'Failed to update phone');
    } finally {
      setPhoneEditSaving(false);
    }
  };

  const handleGenerateDriverSettlement = async () => {
    const confirmMsg = `Generate weekly settlement for ${selectedStaff.name}?\nPeriod: ${selectedStaff.periodDisplay}`;
    if (!window.confirm(confirmMsg)) return;

    if (!selectedStaff.warehouse_id) {
      addToast('Cannot generate settlement: warehouse assignment is missing.', 'error');
      return;
    }

    try {
      setModalLoading(true);
      await FinanceService.generateDriverSettlement(selectedStaff.warehouse_id, selectedStaff.periodRaw.start, [selectedStaff.id]);
      addToast('Driver settlement generated successfully', 'success');
      closeView();
      await loadData();
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
      loadData();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setAdjSaving(false);
    }
  };

  const handleTestPay = async () => {
    if (!selectedStaff || !selectedStaff.details?.id) return;
    
    try {
      setTestPayLoading(true);
      const reference = await FinanceService.executeTestPayout(selectedStaff.details.id, selectedStaff.roleRaw);
      
      setSelectedStaff({
        ...selectedStaff,
        status: 'paid',
        details: {
          ...selectedStaff.details,
          status: 'paid',
          payment_reference: reference,
          payment_provider: 'FlashGO Test Payout',
          payment_method: 'bank_transfer',
          paid_at: new Date().toISOString()
        }
      });
      
      addToast('TEST PAYMENT SUCCESSFUL', 'success');
      setTestPayModalOpen(false);
      loadData();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setTestPayLoading(false);
    }
  };

  const getUnpaidCount = (tab: string) => {
    if (tab === 'picker') return unpaidCounts.picker;
    if (tab === 'driver') return unpaidCounts.driver;
    if (tab === 'warehouse_staff') return unpaidCounts.warehouse_staff;
    return 0;
  };

  return (
    <div className="container animate-slide-up">
      <div className="welcome-banner" style={{ marginBottom: '24px' }}>
        <div>
          <h2 className="title">Staff Payments</h2>
          <p className="subtitle">Manage payouts across perfectly aligned accounting periods.</p>
        </div>
        <Users size={36} color="var(--primary)" />
      </div>

      <div className="panel-card glass-panel animate-slide-up">
        <div className="finance-tabs">
          <button 
            onClick={() => { setActiveTab('picker'); setShowUnpaidOnly(false); }}
            className={`finance-tab-btn ${activeTab === 'picker' ? 'active' : ''}`}
          >
            Picker
            {unpaidCounts.picker > 0 && <span className="unpaid-badge">{unpaidCounts.picker}</span>}
          </button>
          <button 
            onClick={() => { setActiveTab('driver'); setShowUnpaidOnly(false); }}
            className={`finance-tab-btn ${activeTab === 'driver' ? 'active' : ''}`}
          >
            Driver
            {unpaidCounts.driver > 0 && <span className="unpaid-badge">{unpaidCounts.driver}</span>}
          </button>
          <button 
            onClick={() => { setActiveTab('warehouse_staff'); setShowUnpaidOnly(false); }}
            className={`finance-tab-btn ${activeTab === 'warehouse_staff' ? 'active' : ''}`}
          >
            Warehouse Staff
            {unpaidCounts.warehouse_staff > 0 && <span className="unpaid-badge">{unpaidCounts.warehouse_staff}</span>}
          </button>
        </div>

        <div className="panel-header-toolbar">
          <h3 className="panel-title">
            <Calendar size={18} color="var(--primary)" /> 
            {activeTab === 'picker' ? 'Picker Payments' : activeTab === 'driver' ? 'Driver Payments' : 'Warehouse Payroll'}
          </h3>

          <div className="toolbar-controls">
            <label className="toggle-switch">
              <input type="checkbox" checked={showUnpaidOnly} onChange={(e) => setShowUnpaidOnly(e.target.checked)} />
              <div className="toggle-slider"></div>
              <span className="toggle-label">Show Unpaid Only</span>
            </label>
            
            {!showUnpaidOnly && activeTab === 'picker' && (
              <select className="period-select" value={pickerPeriodStr} onChange={e => setPickerPeriodStr(e.target.value)}>
                {pickerPeriods.map(p => <option key={p.start} value={p.start}>{p.label}</option>)}
              </select>
            )}
            {!showUnpaidOnly && activeTab === 'driver' && (
              <select className="period-select" value={driverPeriodStr} onChange={e => setDriverPeriodStr(e.target.value)}>
                {driverPeriods.map(p => <option key={p.start} value={p.start}>{p.label}</option>)}
              </select>
            )}
            {!showUnpaidOnly && activeTab === 'warehouse_staff' && (
              <select className="period-select" value={warehousePeriodStr} onChange={e => setWarehousePeriodStr(e.target.value)}>
                {warehousePeriods.map(p => <option key={p.start} value={p.start}>{p.label}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="table-wrapper">
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>Loading Staff Roster...</div>
          ) : roster.length > 0 ? (
            <DataTable
              data={roster}
              keyExtractor={(s, index) => `${s.id}-${index}`}
              columns={[
                { key: 'name', header: 'NAME', render: r => (
                  <span style={{ fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => openStaffDetails(r)}>
                    {r.name}
                  </span>
                )},
                { key: 'employee_id', header: 'EMPLOYEE ID', sortable: true },
                { key: 'warehouse', header: 'WAREHOUSE' },
                { key: 'period', header: showUnpaidOnly ? 'ORIGINAL PERIOD' : 'PAY PERIOD', render: r => <span style={{ fontSize: '0.85rem' }}>{r.periodDisplay}</span> },
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
                  </div>
                )}
              ]}
            />
          ) : (
            <div className="empty-state animate-fade-in">
              <Users size={48} />
              <div className="empty-state-title">No staff members found</div>
              <div className="empty-state-desc">There is no matching staff activity or records for the selected period.</div>
            </div>
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
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>GROSS EARNINGS (PERIOD)</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      ₹{dailyActivity.reduce((sum, d) => sum + d.shiftEarnings + d.bonus, 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>PENALTIES (ALREADY DEDUCTED)</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--error)' }}>
                      ₹{dailyActivity.reduce((sum, d) => sum + d.deductions, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>NET EARNINGS (PERIOD)</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      ₹{dailyActivity.reduce((sum, d) => sum + d.dailyTotal, 0).toFixed(2)}
                    </span>
                  </div>

                  {selectedStaff.details && (
                    <>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>CARRIED DEFICIT</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--error)' }}>
                          ₹{Number(selectedStaff.details.carried_deficit || 0).toFixed(2)}
                        </span>
                      </div>

                      <div style={{ backgroundColor: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>DEFICIT RECOVERED</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--success)' }}>
                            ₹{Number(selectedStaff.details.deficit_recovered || 0).toFixed(2)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>AVAILABLE PAYOUT</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>
                            ₹{Math.max(0, Number(selectedStaff.details.net_amount || 0)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                  {!selectedStaff.details && (
                    <div style={{ backgroundColor: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>AVAILABLE PAYOUT</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>
                          NOT GENERATED
                        </span>
                      </div>
                    </div>
                  )}
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
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>TOTAL PAYABLE</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>
                    ₹{selectedStaff.status === 'NOT GENERATED' ? dailyActivity.reduce((sum: number, d: any) => sum + d.dailyTotal, 0).toFixed(2) : Math.max(0, Number(selectedStaff.net_amount || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {selectedStaff.status === 'paid' && selectedStaff.details && (
              <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '24px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>PAID AT</span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {selectedStaff.details.paid_at ? new Date(selectedStaff.details.paid_at).toLocaleString() : '—'}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>REFERENCE</span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'monospace' }}>
                    {selectedStaff.details.payment_reference || '—'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>
                {selectedStaff.roleRaw === 'warehouse_staff' ? 'Salary Configuration' : 'Daily Activity Breakdown'}
              </h4>
              
              {selectedStaff.roleRaw === 'warehouse_staff' ? (
                <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '16px' }}>
                  {warehouseSalaryConfig ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Active Configuration (from {new Date(warehouseSalaryConfig.effective_from).toLocaleDateString()})</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>₹{Number(warehouseSalaryConfig.monthly_base_salary).toFixed(2)} / month</div>
                      </div>
                      <button onClick={() => openConfigModal(warehouseSalaryConfig.monthly_base_salary)} style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--primary)', backgroundColor: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                        Update Salary
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No salary configured for this employee.</div>
                      <button onClick={() => openConfigModal()} style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                        Configure Salary
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <DataTable
                  data={dailyActivity}
                  keyExtractor={r => r.date}
                  columns={[
                    { key: 'date', header: 'DATE', render: r => <span>{parseLocalDate(r.date).toLocaleDateString()}</span> },
                    { key: 'shiftEarnings', header: 'SHIFT EARNINGS', render: r => <span>₹{r.shiftEarnings.toFixed(2)}</span> },
                    { key: 'bonus', header: 'BONUS', render: r => <span>₹{r.bonus.toFixed(2)}</span> },
                    { key: 'deductions', header: 'DEDUCTIONS', render: r => <span>₹{r.deductions.toFixed(2)}</span> },
                    { key: 'dailyTotal', header: 'DAILY TOTAL', render: r => <span style={{ fontWeight: 600 }}>₹{r.dailyTotal.toFixed(2)}</span> }
                  ]}
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '24px', gap: '12px', flexWrap: 'wrap' }}>
              {selectedStaff.status === 'NOT GENERATED' && (selectedStaff.roleRaw === 'driver' || selectedStaff.roleRaw === 'picker') && dailyActivity.length > 0 && (() => {
                const closeDate = new Date(`${selectedStaff.periodRaw.start}T00:00:00+05:30`);
                closeDate.setDate(closeDate.getDate() + 7);
                const isClosed = new Date() >= closeDate;
                
                const handleGenerate = selectedStaff.roleRaw === 'driver' ? handleGenerateDriverSettlement : handleGeneratePickerSettlement;
                
                return (
                  <>
                    {!isClosed && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <Info size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> 
                        Generation available on {closeDate.toLocaleDateString()}
                      </span>
                    )}
                    <button 
                      onClick={handleGenerate}
                      disabled={!isClosed}
                      style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--success)', color: 'white', cursor: isClosed ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: isClosed ? 1 : 0.5 }}
                    >
                      Generate Settlement
                    </button>
                  </>
                );
              })()}

              {selectedStaff.status === 'NOT GENERATED' && selectedStaff.roleRaw === 'warehouse_staff' && warehouseSalaryConfig && (
                <button 
                  onClick={handleGeneratePayroll}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--success)', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                >
                  Generate Payroll
                </button>
              )}

              {selectedStaff.status !== 'NOT GENERATED' && selectedStaff.status !== 'paid' && selectedStaff.net_amount <= 0 && selectedStaff.roleRaw === 'driver' && (
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600, marginRight: 'auto' }}>
                  <Info size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }}/>
                  Deficit Carried Forward
                </span>
              )}
              {selectedStaff.status !== 'NOT GENERATED' && selectedStaff.status !== 'paid' && selectedStaff.net_amount > 0 && (
                <button 
                  onClick={() => setTestPayModalOpen(true)}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                >
                  Test Pay
                </button>
              )}
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
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>MONTHLY BASE SALARY (₹)</label>
              <input type="number" className="input-field" value={configAmount} onChange={e => setConfigAmount(e.target.value)} placeholder="e.g. 15000" style={{ width: '100%' }} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>EFFECTIVE FROM</label>
              <input type="date" className="input-field" value={configDate} onChange={e => setConfigDate(e.target.value)} style={{ width: '100%' }} />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: '2px' }}/> Must be 1st of a month
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setConfigModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>
                Cancel
              </button>
              <button onClick={handleSaveConfig} disabled={configSaving} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 500, opacity: configSaving ? 0.7 : 1 }}>
                {configSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {adjModalOpen && selectedStaff && (
        <div className="modal-overlay animate-fade-in" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', color: 'var(--text-primary)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Add Payroll Adjustment</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ADJUSTMENT TYPE</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => setAdjType('addition')}
                  style={{ flex: 1, padding: '8px', border: adjType === 'addition' ? '2px solid var(--success)' : '1px solid var(--border-light)', borderRadius: '6px', background: adjType === 'addition' ? 'rgba(34, 197, 94, 0.1)' : 'transparent', color: adjType === 'addition' ? 'var(--success)' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}
                >
                  Addition (+)
                </button>
                <button 
                  onClick={() => setAdjType('deduction')}
                  style={{ flex: 1, padding: '8px', border: adjType === 'deduction' ? '2px solid var(--error)' : '1px solid var(--border-light)', borderRadius: '6px', background: adjType === 'deduction' ? 'rgba(239, 68, 68, 0.1)' : 'transparent', color: adjType === 'deduction' ? 'var(--error)' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}
                >
                  Deduction (-)
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>AMOUNT (₹)</label>
              <input type="number" className="input-field" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="e.g. 500" style={{ width: '100%' }} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>REASON / DESCRIPTION</label>
              <input type="text" className="input-field" value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="e.g. Overtime bonus, Uniform deduction..." style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setAdjModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>
                Cancel
              </button>
              <button onClick={handleSaveAdj} disabled={adjSaving} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 500, opacity: adjSaving ? 0.7 : 1 }}>
                {adjSaving ? 'Saving...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {testPayModalOpen && selectedStaff && (
        <div className="modal-overlay animate-fade-in" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', color: 'var(--text-primary)', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', backgroundColor: 'rgba(14, 165, 233, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: 'var(--primary)' }}>
              <IndianRupee size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem' }}>Execute Test Payment</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              This will simulate a successful bank transfer for <strong>₹{selectedStaff.net_amount.toFixed(2)}</strong> to <strong>{selectedStaff.name}</strong>.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button onClick={() => setTestPayModalOpen(false)} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleTestPay} disabled={testPayLoading} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600, opacity: testPayLoading ? 0.7 : 1 }}>
                {testPayLoading ? 'Processing...' : 'Confirm Test Pay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {staffDetailsModalOpen && selectedStaffInfo && (
        <div className="modal-overlay animate-fade-in" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '600px', color: 'var(--text-primary)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--primary)' }}>Staff Details</h3>
              <button onClick={closeStaffDetails} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>

            {staffDetailsLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>Loading Details...</div>
            ) : (
              <>
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Staff Information</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '16px', borderRadius: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>FULL NAME</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{selectedStaffInfo.name}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>EMPLOYEE ID</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{selectedStaffInfo.employee_id || '—'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>PHONE NUMBER</span>
                      {phoneEditMode ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <input
                            type="text"
                            value={phoneEditValue}
                            onChange={e => setPhoneEditValue(e.target.value)}
                            placeholder="Enter phone number"
                            style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem', width: '100%' }}
                            disabled={phoneEditSaving}
                          />
                          {phoneEditError && <div style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{phoneEditError}</div>}
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={handleSavePhone} disabled={phoneEditSaving} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', border: 'none', backgroundColor: 'var(--success)', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}>
                              <Check size={14} /> {phoneEditSaving ? 'Saving' : 'Save'}
                            </button>
                            <button onClick={() => { setPhoneEditMode(false); setPhoneEditError(''); }} disabled={phoneEditSaving} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.75rem' }}>
                              <X size={14} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{staffPhone || 'Not added'}</span>
                          <button onClick={() => { setPhoneEditValue(staffPhone || ''); setPhoneEditMode(true); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, display: 'flex' }} title="Edit Phone">
                            <Edit2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>WAREHOUSE</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{selectedStaffInfo.warehouse}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>ROLE</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'capitalize' }}>{selectedStaffInfo.roleRaw.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Bank Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', backgroundColor: 'var(--bg-base)', padding: '16px', borderRadius: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>ACCOUNT HOLDER NAME</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{staffPayoutDetails?.account_holder || 'Not added'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>ACCOUNT NUMBER</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                        {staffPayoutDetails?.account_number ? `**** **** ${staffPayoutDetails.account_number.slice(-4)}` : 'Not added'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>IFSC CODE</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{staffPayoutDetails?.ifsc || 'Not added'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>BANK NAME</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{staffPayoutDetails?.bank_name || 'Not added'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>BRANCH</span>
                      {/* branch_name might not exist in older driver_payout_details schema, fallback to Not added if not present */}
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{staffPayoutDetails?.branch_name || 'Not added'}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
