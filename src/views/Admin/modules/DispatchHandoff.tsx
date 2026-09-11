import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { supabase } from '../../../services/api/supabaseClient';
import { DataTable } from '../../../components/Admin/DataTable';
import { Search, MapPin, CheckCircle, Truck, PackageCheck, AlertTriangle } from 'lucide-react';
import type { Order } from '../../../services/db';

export const DispatchHandoff: React.FC = () => {
  const { orders, refreshData, addToast, isLoadingData, dataLoadError, profiles } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  
  // Realtime updates
  useEffect(() => {
    const channel = supabase.channel('admin-dispatch-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_packing_operations' }, refreshData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshData]);

  // Compute stats
  const staged = orders.filter(o => o.status === 'staged').length;
  const handedOff = orders.filter(o => o.status === 'handed_off').length;

  const filteredOrders = orders.filter(o => {
    const validStatuses = ['staged', 'handed_off'];
    if (!validStatuses.includes(o.status)) return false;
    
    if (searchQuery) {
      const match = o.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    (o.customer_name && o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!match) return false;
    }
    return true;
  });

  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  // Actions
  const handleHandoff = async (orderId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { error } = await supabase.rpc('handoff_order', {
        p_order_id: orderId,
        p_user_id: user.id
      });
      if (error) throw error;
      addToast('Order handed off to rider successfully', 'success');
      refreshData();
    } catch (e: any) {
      addToast(`Handoff error: ${e.message}`, 'error');
    }
  };

  return (
    <div className="container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', overflow: 'hidden' }}>
      
      {/* KPI Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <KpiCard title="Ready for Dispatch (Staged)" value={staged} icon={<MapPin />} color="#f59e0b" />
        <KpiCard title="Handed Off Today" value={handedOff} icon={<Truck />} color="#10b981" />
      </div>

      <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0 }}>
        
        {/* Main List */}
        <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontWeight: 800, color: 'var(--text-primary)', flex: 1 }}>Dispatch Queue</h3>
            
            <div style={{ position: 'relative', width: '250px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search orders..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              />
            </div>
          </div>
          
          <div style={{ flex: 1, overflow: 'auto' }}>
            <DataTable
              data={filteredOrders}
              keyExtractor={o => o.id}
              onRowClick={o => setSelectedOrderId(o.id)}
              selectedRowId={selectedOrderId || undefined}
              columns={[
                { key: 'id', header: 'ORDER ID', render: r => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{r.id.toUpperCase().slice(-6)}</span> },
                { key: 'customer', header: 'CUSTOMER', render: r => <span>{r.customer_name}</span> },
                { key: 'status', header: 'STATUS', render: r => <StatusBadge status={r.status} /> }
              ]}
            />
          </div>
        </div>

        {/* Action Panel */}
        <div style={{ flex: '1', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '24px', overflowY: 'auto' }}>
          {selectedOrder ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontWeight: 900, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Order #{selectedOrder.id.toUpperCase().slice(-6)}
                  <StatusBadge status={selectedOrder.status} />
                </h2>
              </div>

              {/* Handoff Verification */}
              <div style={{ backgroundColor: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border-light)', overflow: 'hidden', padding: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Assigned Rider:</span>
                    <span style={{ fontWeight: 800 }}>{selectedOrder.driver_name || <span style={{ color: 'var(--accent-red)' }}><AlertTriangle size={12}/> Not Assigned</span>}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Trip ID:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{selectedOrder.trip_id ? `#${selectedOrder.trip_id.slice(-6).toUpperCase()}` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Actions Based on Status */}
              {selectedOrder.status === 'staged' && (
                <button 
                  onClick={() => handleHandoff(selectedOrder.id)}
                  disabled={!selectedOrder.driver_id}
                  style={{ width: '100%', padding: '14px', backgroundColor: selectedOrder.driver_id ? '#10b981' : 'var(--border-light)', color: selectedOrder.driver_id ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: selectedOrder.driver_id ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <PackageCheck size={18} /> Confirm Physical Handoff
                </button>
              )}

              {selectedOrder.status === 'handed_off' && (
                <div style={{ textAlign: 'center', padding: '32px 16px', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', color: '#10b981' }}>
                  <CheckCircle size={48} style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ margin: 0, fontWeight: 900 }}>Handed Off</h3>
                  <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Waiting for rider to start trip.</p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Truck size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <h3>Select a Staged Order</h3>
              <p style={{ textAlign: 'center', fontSize: '0.85rem', maxWidth: '200px' }}>Verify driver and confirm handoff of staged bags.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Subcomponents
const KpiCard = ({ title, value, icon, color }: any) => (
  <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '16px' }}>
    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
    </div>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, any> = {
    staged: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
    handed_off: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' }
  };
  const s = styles[status] || { bg: 'var(--border-light)', text: 'var(--text-secondary)' };
  
  return (
    <span style={{ backgroundColor: s.bg, color: s.text, padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800 }}>
      {status.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
};
