import React, { useState, useEffect } from 'react';
import './FinanceSettlements.css';
import { IndianRupee, CreditCard, TrendingUp, Search, Download, Package, Calendar, Users, DollarSign, CheckCircle2 } from 'lucide-react';
import { FinanceService } from '../../../services/api/FinanceService';
import { UsersService } from '../../../services/api/UsersService';
import { supabase } from '../../../services/api/supabaseClient';
import { DataTable } from '../../../components/Admin/DataTable';
import { useApp } from '../../../context/AppContext';
import { AnalyticsService } from '../../../services/api/AnalyticsService';
import { DriverRateCards } from './DriverRateCards';

export const FinanceSettlements: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'picker' | 'driver' | 'warehouse' | 'rate_cards'>('picker');
  const [isLoading, setIsLoading] = useState(true);

  // Stats
  const [analytics, setAnalytics] = useState<any>(null);

  // Driver Data
  const [codOrders, setCodOrders] = useState<any[]>([]);

  // Picker Data
  const [pickerSettlements, setPickerSettlements] = useState<any[]>([]);
  
  // Warehouse Data
  const [warehousePayroll, setWarehousePayroll] = useState<any[]>([]);

  // COD Settlement Modal State
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementOrders, setSettlementOrders] = useState<any[]>([]);
  const [settlementReference, setSettlementReference] = useState('');
  const [settlementLoading, setSettlementLoading] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      const stats = await AnalyticsService.getFinanceAnalytics();
      setAnalytics(stats);

      // Load Picker Settlements
      const ps = await FinanceService.getPickerSettlements();
      setPickerSettlements(ps);

      // Load COD collections (Driver)
      try {
        const collections = await FinanceService.getCodCollections();
        setCodOrders(collections.map(c => ({
          id: c.order_id,
          driver_id: c.driver_id,
          driver_name: c.driver?.full_name || 'Unnamed driver',
          employee_id: c.driver?.employee_id || '—',
          customer_name: c.order?.customer?.full_name || '—',
          total_amount: Number(c.amount),
          status: c.status,
          cod_collected: c.status === 'settled' || c.status === 'collected'
        })));
      } catch (e) {
        console.warn('Failed to fetch cod collections');
        setCodOrders([]);
      }

      // Load Warehouse Payroll
      // Default to current month's 1st day for display
      const currentMonth = new Date();
      currentMonth.setDate(1);
      const isoMonth = currentMonth.toISOString().split('T')[0];
      const wp = await FinanceService.getWarehousePayroll(isoMonth);
      setWarehousePayroll(wp);

    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (!supabase) return;
    const channel = supabase.channel('finance_analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picker_settlements' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_staff_payroll' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleBulkAction = (action: string, selectedIds: string[]) => {
    if (action === 'settle') {
      const selected = codOrders.filter(o => selectedIds.includes(o.id));
      
      // Check if all selected orders belong to the same driver
      const drivers = new Set(selected.map(o => o.driver_id));
      if (drivers.size > 1) {
        addToast('Cannot settle orders for multiple drivers at once.', 'error');
        return;
      }

      // Check unnamed driver safety restriction
      const driverName = selected[0].driver_name;
      const employeeId = selected[0].employee_id;
      if (driverName === 'Unnamed driver' || employeeId === '—') {
        addToast('Cannot settle for a driver with incomplete identity. Review required.', 'error');
        return;
      }

      setSettlementOrders(selected);
      setSettlementReference('');
      setIsSettlementModalOpen(true);
    }
  };

  const executeSettlement = async () => {
    if (!settlementReference.trim()) {
      addToast('Payment reference is required', 'error');
      return;
    }
    
    try {
      setSettlementLoading(true);
      const driverId = settlementOrders[0].driver_id;
      const orderIds = settlementOrders.map(o => o.id);
      
      await FinanceService.adminSettleDriverCod(driverId, orderIds, settlementReference);
      addToast('COD Settlement successful', 'success');
      setIsSettlementModalOpen(false);
      loadData();
    } catch (e: any) {
      addToast(`Settlement failed: ${e.message}`, 'error');
    } finally {
      setSettlementLoading(false);
    }
  };

  const totalPayouts = analytics?.driver_payouts_total || 0;
  const totalCommissions = analytics?.platform_commission_total || 0;
  const codPending = analytics?.cod_pending || 0;
  const codCollected = analytics?.cod_collected || 0;
  const netRevenue = totalPayouts + totalCommissions;

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Finance Analytics...</div>;

  return (
    <div className="container animate-slide-up">
      <div className="welcome-banner" style={{ marginBottom: '24px' }}>
        <div>
          <h2 className="title">Finance & Settlements</h2>
          <p className="subtitle">Manage Picker payouts, Warehouse payroll, and Driver COD reconciliations.</p>
        </div>
        <IndianRupee size={36} color="var(--primary)" />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div style={statIconStyle('var(--primary)')}><TrendingUp size={20} /></div>
          <div>
            <div className="stat-label">Platform Net Revenue (7d)</div>
            <div className="stat-value">₹{netRevenue.toFixed(2)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div style={statIconStyle('#f59e0b')}><IndianRupee size={20} /></div>
          <div>
            <div className="stat-label">Driver Unsettled COD</div>
            <div className="stat-value">₹{codPending.toFixed(2)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div style={statIconStyle('#10b981')}><CreditCard size={20} /></div>
          <div>
            <div className="stat-label">Platform Commission</div>
            <div className="stat-value">₹{totalCommissions.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="catalog-tab-bar glass-panel" style={{ display: 'flex', gap: '12px', margin: '24px 0', padding: '4px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)', width: 'max-content', overflowX: 'auto' }}>
        {[
          { id: 'picker', label: 'Picker Weekly Settlements' },
          { id: 'driver', label: 'Driver Finance & COD' },
          { id: 'warehouse', label: 'Warehouse Staff Payroll' },
          { id: 'rate_cards', label: 'Driver Earnings Rate Card' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: activeTab === tab.id ? 'var(--primary)' : 'transparent', color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'picker' && (
        <div className="panel-card glass-panel animate-slide-up">
          <div className="panel-header">
            <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={18} color="var(--primary)" /> Picker Weekly Settlements</h3>
          </div>
          <div style={{ marginTop: '16px' }}>
            {pickerSettlements.length > 0 ? (
              <DataTable
                data={pickerSettlements}
                keyExtractor={s => s.id}
                columns={[
                  { key: 'week_start', header: 'WEEK START', sortable: true, render: r => new Date(r.week_start).toLocaleDateString() },
                  { key: 'staff', header: 'PICKER', render: r => <span style={{ fontWeight: 600 }}>{r.profiles?.full_name || 'Unknown'}</span> },
                  { key: 'total_amount', header: 'TOTAL PAYABLE', sortable: true, render: r => <span style={{ fontWeight: 800 }}>₹{r.total_amount.toFixed(2)}</span> },
                  { key: 'status', header: 'STATUS', render: r => (
                    <span className={r.status === 'paid' ? "admin-badge-success" : "admin-badge-warning"}>
                      {r.status.toUpperCase()}
                    </span>
                  )},
                  { key: 'actions', header: 'ACTIONS', render: r => (
                    r.status !== 'paid' && (
                      <button style={{ padding: '6px 12px', fontSize: '0.75rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Mark Paid
                      </button>
                    )
                  )}
                ]}
              />
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No picker settlements generated yet.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'driver' && (
        <div className="animate-slide-up">
          <div className="panel-card glass-panel" style={{ marginTop: '24px' }}>
            <div className="panel-header">
              <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Package size={18} color="#f59e0b" /> Cash On Delivery (COD) Reconciliations</h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pending Cash: <strong>₹{codPending.toFixed(2)}</strong> | Collected: <strong>₹{codCollected.toFixed(2)}</strong></span>
            </div>
            <div style={{ marginTop: '16px' }}>
              {codOrders.length > 0 ? (
                <DataTable
                  data={codOrders}
                  keyExtractor={o => o.id}
                  columns={[
                    { key: 'id', header: 'ORDER REF', sortable: true, render: r => <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>#{r.id.slice(-6).toUpperCase()}</span> },
                    { key: 'driver_name', header: 'DRIVER', sortable: true, render: r => <span style={{ fontWeight: 600 }}>{r.driver_name}</span> },
                    { key: 'employee_id', header: 'EMPLOYEE ID', sortable: true },
                    { key: 'customer_name', header: 'CUSTOMER', sortable: true },
                    { key: 'total_amount', header: 'COD AMOUNT', sortable: true, render: r => <span style={{ fontWeight: 800 }}>₹{r.total_amount.toFixed(2)}</span> },
                    { key: 'status', header: 'REMITTANCE STATUS', render: r => (
                      r.status === 'settled' ? (
                        <span className="admin-badge-success">SETTLED</span>
                      ) : r.status === 'collected' ? (
                        <span className="admin-badge-success">LEGACY COLLECTED</span>
                      ) : (
                        <span className="admin-badge-warning">PENDING REMITTANCE</span>
                      )
                    )}
                  ]}
                  bulkActions={[
                    { label: 'Settle COD', value: 'settle' }
                  ]}
                  onBulkAction={handleBulkAction}
                  exportFilename="cod_collections"
                />
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No COD collections found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'warehouse' && (
        <div className="panel-card glass-panel animate-slide-up">
          <div className="panel-header">
            <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={18} color="var(--primary)" /> Warehouse Staff Monthly Payroll</h3>
          </div>
          <div style={{ marginTop: '16px' }}>
            {warehousePayroll.length > 0 ? (
              <DataTable
                data={warehousePayroll}
                keyExtractor={p => p.id}
                columns={[
                  { key: 'salary_month', header: 'MONTH', sortable: true, render: r => new Date(r.salary_month).toLocaleDateString(undefined, {month: 'short', year: 'numeric'}) },
                  { key: 'staff', header: 'STAFF', render: r => <span style={{ fontWeight: 600 }}>{r.profiles?.full_name || 'Unknown'}</span> },
                  { key: 'base_salary', header: 'BASE SALARY', render: r => <span>₹{r.base_salary.toFixed(2)}</span> },
                  { key: 'net_salary', header: 'NET PAYABLE', sortable: true, render: r => <span style={{ fontWeight: 800 }}>₹{r.net_salary.toFixed(2)}</span> },
                  { key: 'status', header: 'STATUS', render: r => (
                    <span className={r.status === 'paid' ? "admin-badge-success" : "admin-badge-warning"}>
                      {r.status.toUpperCase()}
                    </span>
                  )},
                  { key: 'actions', header: 'ACTIONS', render: r => (
                    r.status !== 'paid' && (
                      <button style={{ padding: '6px 12px', fontSize: '0.75rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Mark Paid
                      </button>
                    )
                  )}
                ]}
              />
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No payroll generated for the current month.</div>
            )}
          </div>
        </div>
      )}

      {/* Settlement Confirmation Modal */}
      {isSettlementModalOpen && (
        <div className="modal-overlay animate-fade-in" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px', color: 'var(--text-primary)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 color="var(--primary)" /> Confirm COD Settlement</h3>
            
            <div style={{ backgroundColor: 'var(--bg-base)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>DRIVER</span>
                  <div style={{ fontWeight: 600 }}>{settlementOrders[0]?.driver_name}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>EMPLOYEE ID</span>
                  <div style={{ fontWeight: 600 }}>{settlementOrders[0]?.employee_id}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ORDERS SELECTED</span>
                  <div style={{ fontWeight: 600 }}>{settlementOrders.length}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TOTAL AMOUNT</span>
                  <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.2rem' }}>₹{settlementOrders.reduce((sum, o) => sum + o.total_amount, 0).toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Payment / Remittance Reference *</label>
              <input 
                type="text" 
                value={settlementReference}
                onChange={e => setSettlementReference(e.target.value)}
                placeholder="e.g. TXN-12345 or CASH-SEP15"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setIsSettlementModalOpen(false)}
                disabled={settlementLoading}
                style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                onClick={executeSettlement}
                disabled={settlementLoading || !settlementReference.trim()}
                style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {settlementLoading ? 'Processing...' : 'Confirm COD Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rate_cards' && (
        <DriverRateCards />
      )}
    </div>
  );
};

const statIconStyle = (color: string): React.CSSProperties => ({ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' });
