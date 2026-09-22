import React, { useState, useEffect } from 'react';
import { FinancialReportService } from '../../../services/api/FinancialReportService';
import type { FinancialSummaryData, FinancialExportData } from '../../../services/api/FinancialReportService';
import { supabase } from '../../../services/api/supabaseClient';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export const RevenueReports = () => {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [summaryData, setSummaryData] = useState<FinancialSummaryData | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  
  const [selectedRange, setSelectedRange] = useState<'today' | '7days' | '30days' | 'month' | 'custom'>('7days');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    updateDatesForRange();
  }, [selectedRange]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchReportData();
    }
  }, [startDate, endDate, selectedWarehouseId]);

  const fetchWarehouses = async () => {
    const { data } = await supabase.from('warehouses').select('id, name').eq('is_active', true);
    if (data) {
      setWarehouses(data);
    }
  };

  const updateDatesForRange = () => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    if (selectedRange === '7days') {
      start.setDate(start.getDate() - 7);
    } else if (selectedRange === '30days') {
      start.setDate(start.getDate() - 30);
    } else if (selectedRange === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (selectedRange === 'custom') {
      return;
    }

    setStartDate(start);
    setEndDate(end);
  };

  const fetchReportData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [sData, eData] = await Promise.all([
        FinancialReportService.getDashboardSummary(startDate, endDate, selectedWarehouseId),
        FinancialReportService.getExportData(startDate, endDate, selectedWarehouseId)
      ]);
      
      setSummaryData(sData);
      
      // Format chart data from payment breakdown
      if (eData && eData.payment_breakdown) {
        const formattedChartData = eData.payment_breakdown.map((d: any) => {
          const rawDateStr = d['Date'] || d.date;
          const onlineVal = Number(d['Online Revenue'] || d.online_revenue || 0);
          const codVal = Number(d['COD Revenue'] || d.cod_revenue || 0);
          
          let formattedDate = 'Invalid Date';
          if (rawDateStr) {
             const dateObj = new Date(rawDateStr);
             if (!isNaN(dateObj.getTime())) {
                formattedDate = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
             }
          }

          return {
            date: formattedDate,
            'Online Revenue': onlineVal,
            'COD Revenue': codVal,
            'Total Revenue': onlineVal + codVal
          };
        });
        setChartData(formattedChartData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch financial reports');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return '₹' + (val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const exportData = await FinancialReportService.getExportData(startDate, endDate, selectedWarehouseId);
      
      const wb = XLSX.utils.book_new();
      
      // Helper to cast strings to numbers for Excel
      const castNumbers = (data: any[]) => data.map(row => {
        const newRow: any = {};
        for (const key in row) {
          const val = row[key];
          if (typeof val === 'string' && val !== '' && !isNaN(Number(val)) && (key.includes('(₹)') || key.includes('GOV') || key.includes('Amount') || key.includes('Revenue') || key.includes('Cost') || key.includes('Salary') || key.includes('Value') || key.includes('AOV') || key.includes('Refunds') || key.includes('Discounts'))) {
            newRow[key] = Number(val);
          } else {
            newRow[key] = val;
          }
        }
        return newRow;
      });

      // 1. Executive Summary
      const warehouseName = selectedWarehouseId ? warehouses.find(w => w.id === selectedWarehouseId)?.name || 'Unknown' : 'All Warehouses (Global)';
      const summaryAoA = [
        ['FlashGO Revenue & Reports'],
        ['Generated At', new Date().toLocaleString('en-IN')],
        ['Report Start Date', startDate.toISOString().split('T')[0]],
        ['Report End Date', endDate.toISOString().split('T')[0]],
        ['Selected Warehouse', warehouseName],
        [],
        ['Metric', 'Value'],
        ['Gross Order Value (GOV)', Number(summaryData?.gov || 0)],
        ['Net Revenue', Number(summaryData?.net_revenue || 0)],
        ['Delivered Orders', Number(summaryData?.delivered_orders || 0)],
        ['Average Order Value', Number(summaryData?.aov || 0)],
        ['Online Revenue', Number(summaryData?.online_revenue || 0)],
        ['COD Revenue', Number(summaryData?.cod_revenue || 0)],
        ['Refunds', Number(summaryData?.refunds || 0)],
        ['Discounts', Number(summaryData?.discounts || 0)],
        ['Picker Payouts', Number(summaryData?.picker_payouts || 0)],
        ['Driver Payouts', Number(summaryData?.driver_payouts || 0)],
        ['Warehouse Payroll', Number(summaryData?.warehouse_payroll || 0)],
        ['Procurement Spend', Number(summaryData?.procurement_spend || 0)]
      ];
      
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoA);
      summaryWs['!cols'] = [{ wch: 25 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Executive Summary');

      // Helper to create and format sheet
      const addSheet = (data: any[], name: string) => {
        const ws = XLSX.utils.json_to_sheet(castNumbers(data));
        if (data.length > 0) {
          const keys = Object.keys(data[0]);
          ws['!cols'] = keys.map(k => ({ wch: k.includes('ID') ? 36 : k.includes('Date') || k.includes('Time') ? 15 : k.includes('Name') || k.includes('Address') || k.includes('Category') ? 25 : 15 }));
          ws['!autofilter'] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')) };
          ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
        }
        XLSX.utils.book_append_sheet(wb, ws, name);
      };

      addSheet(exportData.revenue_by_date || [], 'Revenue by Date');
      addSheet(exportData.warehouse_performance || [], 'Warehouse Performance');
      addSheet(exportData.orders || [], 'Orders');
      addSheet(exportData.category_sales || [], 'Category Sales');
      addSheet(exportData.payment_breakdown || [], 'Payment Breakdown');
      addSheet(exportData.refunds || [], 'Refunds');
      addSheet(exportData.workforce_payouts || [], 'Workforce Payouts');
      addSheet(exportData.warehouse_payroll || [], 'Warehouse Payroll');
      addSheet(exportData.procurement_spend || [], 'Procurement Spend');

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      const filename = `FlashGO_Revenue_Report_${startStr}_to_${endStr}.xlsx`;

      XLSX.writeFile(wb, filename);
    } catch (err: any) {
      alert('Export Failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const renderKpiCard = (title: string, value: string | number, subtitle?: string) => (
    <div style={styles.kpiCard}>
      <h4 style={styles.kpiTitle}>{title}</h4>
      <div style={styles.kpiValue}>{value}</div>
      {subtitle && <div style={styles.kpiSubtitle}>{subtitle}</div>}
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Revenue & Reports</h2>
          <div style={styles.subtitle}>Financial and operational performance across FlashGO</div>
        </div>
        <button style={styles.exportBtn} onClick={handleExport} disabled={exporting || loading}>
          {exporting ? 'Exporting...' : 'Export Excel'}
        </button>
      </div>

      <div style={styles.filters}>
        <div style={styles.dateFilters}>
          {['today', '7days', '30days', 'month', 'custom'].map((range) => (
            <button 
              key={range}
              style={{...styles.filterBtn, ...(selectedRange === range ? styles.filterBtnActive : {})}}
              onClick={() => setSelectedRange(range as any)}
            >
              {range === 'today' ? 'Today' : range === '7days' ? '7 Days' : range === '30days' ? '30 Days' : range === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
        </div>
        <div style={styles.warehouseFilters}>
          <button 
            style={{...styles.filterBtn, ...(selectedWarehouseId === null ? styles.filterBtnActive : {})}}
            onClick={() => setSelectedWarehouseId(null)}
          >
            All Warehouses (Global)
          </button>
          {warehouses.map((w) => (
            <button 
              key={w.id}
              style={{...styles.filterBtn, ...(selectedWarehouseId === w.id ? styles.filterBtnActive : {})}}
              onClick={() => setSelectedWarehouseId(w.id)}
            >
              {w.name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={styles.errorContainer}>
          <span style={styles.errorText}>{error}</span>
          <button style={styles.retryBtn} onClick={fetchReportData}>Retry</button>
        </div>
      )}

      {loading && !summaryData ? (
        <div style={styles.loadingContainer}>
          Loading reports...
        </div>
      ) : summaryData ? (
        <div style={styles.content}>
          <div style={styles.kpiGrid}>
            {renderKpiCard('Gross Order Value (GOV)', formatCurrency(summaryData.gov))}
            {renderKpiCard('Net Revenue', formatCurrency(summaryData.net_revenue))}
            {renderKpiCard('Delivered Orders', summaryData.delivered_orders)}
            {renderKpiCard('Average Order Value', formatCurrency(summaryData.aov))}
            {renderKpiCard('Online Revenue', formatCurrency(summaryData.online_revenue))}
            {renderKpiCard('COD Revenue', formatCurrency(summaryData.cod_revenue))}
            {renderKpiCard('Refunds', formatCurrency(summaryData.refunds))}
            {renderKpiCard('Discounts', formatCurrency(summaryData.discounts))}
            {renderKpiCard('Picker Payouts', formatCurrency(summaryData.picker_payouts))}
            {renderKpiCard('Driver Payouts', formatCurrency(summaryData.driver_payouts))}
            {renderKpiCard('Warehouse Payroll', formatCurrency(summaryData.warehouse_payroll))}
            {renderKpiCard('Procurement Spend', formatCurrency(summaryData.procurement_spend))}
          </div>

          {chartData.length > 0 && (
            <div style={styles.chartContainer}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', textAlign: 'left', color: 'var(--text-primary)' }}>Revenue Trend</h3>
              <div style={{ width: '100%', height: 350 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dx={-10} tickFormatter={(val: number) => {
                      if (val === 0) return '₹0';
                      if (val >= 1000) return '₹' + (val / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'k';
                      return '₹' + val.toLocaleString('en-IN');
                    }} />
                    <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} formatter={(val: any) => ['₹' + Number(val).toLocaleString(), '']} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="Online Revenue" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} barSize={32} />
                    <Bar dataKey="COD Revenue" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', flex: 1, padding: '24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' },
  subtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' },
  exportBtn: { backgroundColor: '#10B981', color: 'white', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, border: 'none', cursor: 'pointer' },
  filters: { marginBottom: '24px' },
  dateFilters: { display: 'flex', gap: '8px', marginBottom: '12px' },
  warehouseFilters: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterBtn: { padding: '6px 12px', borderRadius: '16px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  filterBtnActive: { backgroundColor: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' },
  kpiCard: { backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-light)' },
  kpiTitle: { fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, margin: '0 0 8px 0' },
  kpiValue: { fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' },
  kpiSubtitle: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' },
  errorContainer: { backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  errorText: { color: 'var(--danger)' },
  retryBtn: { background: 'none', border: 'none', color: 'var(--danger)', fontWeight: 'bold', cursor: 'pointer' },
  loadingContainer: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' },
  content: { flex: 1, display: 'flex', flexDirection: 'column' },
  chartContainer: { marginTop: '32px', padding: '24px', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)' },
};

export default RevenueReports;
