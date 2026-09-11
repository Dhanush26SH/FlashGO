import React, { useState, useEffect } from 'react';
import './FinanceSettlements.css';
import { FlashGoDB } from '../../../services/db';
import type { DriverEarning } from '../../../services/db';
import { IndianRupee, CreditCard, TrendingUp, Search, Download, Package } from 'lucide-react';
import { FinanceService } from '../../../services/api/FinanceService';
import { UsersService } from '../../../services/api/UsersService';
import { OrdersService } from '../../../services/api/OrdersService';
import { supabase } from '../../../services/api/supabaseClient';
import { DataTable } from '../../../components/Admin/DataTable';
import { useApp } from '../../../context/AppContext';
import { AnalyticsService } from '../../../services/api/AnalyticsService';

export const FinanceSettlements: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [earnings, setEarnings] = useState<DriverEarning[]>([]);
  const [codOrders, setCodOrders] = useState<any[]>([]);
  
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load earnings, COD orders and analytics from API on mount
  const loadData = async () => {
    try {
      setIsLoading(true);
      
      const stats = await AnalyticsService.getFinanceAnalytics();
      setAnalytics(stats);

      // Load driver earnings
      const drivers = await UsersService.getProfiles();
      const driverProfiles = drivers.filter((p: any) => p.role === 'driver');
      let allEarnings: DriverEarning[] = [];
      for (const d of driverProfiles) {
        try {
          const driverEarnings = await FinanceService.getDriverEarnings(d.id);
          allEarnings = allEarnings.concat(driverEarnings);
        } catch (e) {
          console.warn(`Failed to fetch earnings for ${d.id}`);
        }
      }
      
      setEarnings(allEarnings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

      // Load COD collections
      try {
        const collections = await FinanceService.getCodCollections();
        setCodOrders(collections.map(c => ({
          id: c.order_id,
          driver_id: c.driver_id,
          customer_name: c.order?.customer_id ? 'Active Customer' : 'Unknown',
          total_amount: Number(c.amount),
          cod_collected: c.status === 'collected'
        })));
      } catch (e) {
        console.warn('Failed to fetch cod collections');
        setCodOrders([]);
      }
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_earnings' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleMarkCollected = async (orderId: string) => {
    try {
      if (!currentUser?.id) throw new Error('No user authenticated');
      const success = await FinanceService.markCodCollected(orderId, currentUser.id);
      if (success) {
        // Refresh collections
        const collections = await FinanceService.getCodCollections();
        setCodOrders(collections.map(c => ({
          id: c.order_id,
          driver_id: c.driver_id,
          customer_name: c.order?.customer_id ? 'Active Customer' : 'Unknown',
          total_amount: Number(c.amount),
          cod_collected: c.status === 'collected'
        })));
      }
    } catch (e: any) {
      addToast(`Failed to mark COD collected: ${e.message}`, 'error');
    }
  };

  const [searchQuery, setSearchQuery] = useState('');

  const totalPayouts = analytics?.driver_payouts_total || 0;
  const totalCommissions = analytics?.platform_commission_total || 0;
  const codPending = analytics?.cod_pending || 0;
  const codCollected = analytics?.cod_collected || 0;
  const netRevenue = totalPayouts + totalCommissions;

  const [activeTab, setActiveTab] = useState<'ledger'>('ledger');

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Finance Analytics...</div>;

  return (
    <div className="container">
      <div className="catalog-tab-bar glass-panel" style={{ display: 'flex', gap: '12px', marginBottom: '24px', padding: '4px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)', width: 'max-content', overflowX: 'auto' }}>
        {[
          { id: 'ledger', label: 'Ledger & Payouts' }
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

      {activeTab === 'ledger' && (
        <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="welcome-banner">
        <div>
          <h2 className="title">Finance & Reconciliation</h2>
          <p className="subtitle">Manage platform revenue, COD reconciliations, and driver earnings ledgers.</p>
        </div>
        <IndianRupee size={36} color="var(--primary)" />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div style={statIconStyle('var(--primary)')}><TrendingUp size={20} /></div>
          <div>
            <div className="stat-label">Total Revenue (7d)</div>
            <div className="stat-value">₹{netRevenue.toFixed(2)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div style={statIconStyle('#f59e0b')}><IndianRupee size={20} /></div>
          <div>
            <div className="stat-label">Driver Earnings</div>
            <div className="stat-value">₹{totalPayouts.toFixed(2)}</div>
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

      <div className="panel-card glass-panel">
        <div className="panel-header">
          <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CreditCard size={18} color="var(--primary)" /> Driver Earnings & Settlements Ledger</h3>
        </div>
        <div style={{ marginTop: '16px' }}>
          {earnings.length > 0 ? (
            <DataTable
              data={earnings}
              keyExtractor={e => e.id}
              columns={[
                { key: 'id', header: 'TRANSACTION ID', sortable: true, render: r => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{r.id.slice(-8).toUpperCase()}</span> },
                { key: 'created_at', header: 'DATE', sortable: true, render: r => new Date(r.created_at).toLocaleDateString() },
                { key: 'order_id', header: 'ORDER REF', sortable: true, render: r => <span style={{ color: 'var(--primary)' }}>#{r.order_id.slice(-6).toUpperCase()}</span> },
                { key: 'driver_id', header: 'DRIVER ID', sortable: true },
                { key: 'earning_amount', header: 'EARNING', sortable: true, render: r => <span style={{ fontWeight: 800 }}>₹{r.earning_amount.toFixed(2)}</span> },
                { key: 'commission_amount', header: 'PLATFORM FEE', sortable: true, render: r => <span style={{ color: 'var(--success)', fontWeight: 700 }}>+₹{r.commission_amount.toFixed(2)}</span> },
                { key: 'status', header: 'STATUS', render: () => (
                  <span className="admin-badge-success">
                    CLEARED
                  </span>
                ) }
              ]}
            />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No recent driver earnings found.</div>
          )}
        </div>
      </div>

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
                { key: 'driver_id', header: 'DRIVER ID', sortable: true },
                { key: 'customer_name', header: 'CUSTOMER', sortable: true },
                { key: 'total_amount', header: 'TOTAL CASH', sortable: true, render: r => <span style={{ fontWeight: 800 }}>₹{r.total_amount.toFixed(2)}</span> },
                { key: 'status', header: 'COLLECTION STATUS', render: r => (
                  r.cod_collected ? (
                    <span className="admin-badge-success">CASH RECONCILED</span>
                  ) : (
                    <span className="admin-badge-warning">PENDING COLLECTION</span>
                  )
                )},
                { key: 'actions', header: 'ACTIONS', render: r => (
                  !r.cod_collected && (
                    <button 
                      onClick={() => handleMarkCollected(r.id)}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Mark Collected
                    </button>
                  )
                )}
              ]}
              exportFilename="cod_collections"
            />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No COD collections found.</div>
          )}
        </div>
      </div>
        </div>
      )}


    </div>
  );
};

// Styles






const statIconStyle = (color: string): React.CSSProperties => ({ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' });

















