import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { supabase } from '../../../services/api/supabaseClient';
import { DataTable } from '../../../components/Admin/DataTable';
import { Search, Package, CheckCircle, ArrowRight, ShieldAlert, RefreshCw, Layers } from 'lucide-react';
import type { Order } from '../../../services/db';

export const PackingStaging: React.FC = () => {
  const { orders, refreshData, addToast, isLoadingData, dataLoadError, profiles } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  
  // Realtime updates
  useEffect(() => {
    const channel = supabase.channel('admin-packing-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_packing_operations' }, refreshData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshData]);

  // Compute stats
  const waitingPacking = orders.filter(o => o.status === 'waiting_for_packing').length;
  const packingNow = orders.filter(o => o.status === 'packing').length;
  const packed = orders.filter(o => o.status === 'packed').length;
  const staged = orders.filter(o => o.status === 'staged').length;

  const filteredOrders = orders.filter(o => {
    const validStatuses = ['waiting_for_packing', 'packing', 'packed', 'staged'];
    if (!validStatuses.includes(o.status)) return false;
    
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    
    if (searchQuery) {
      const match = o.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    (o.customer_name && o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!match) return false;
    }
    return true;
  });

  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  // Actions
  const handleStartPacking = async (orderId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { error } = await supabase.rpc('start_packing_order', {
        p_order_id: orderId,
        p_packer_id: user.id
      });
      if (error) throw error;
      addToast('Packing started', 'success');
      refreshData();
    } catch (e: any) {
      addToast(`Error: ${e.message}`, 'error');
    }
  };

  const [bagNumber, setBagNumber] = useState('');
  const handleCompletePacking = async (orderId: string) => {
    if (!bagNumber.trim()) {
      addToast('Bag number is required', 'error');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { error } = await supabase.rpc('pack_order', {
        p_order_id: orderId,
        p_picker_id: user.id, // Packer ID
        p_bag_number: bagNumber.trim()
      });
      if (error) throw error;
      addToast('Order packed successfully', 'success');
      setBagNumber('');
      refreshData();
    } catch (e: any) {
      addToast(`Packing error: ${e.message}`, 'error');
    }
  };

  const [stagingLocations, setStagingLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  
  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase.from('warehouse_staging_locations').select('*').eq('active', true);
      if (data) setStagingLocations(data);
    };
    fetchLocations();
  }, []);

  const handleStageOrder = async (orderId: string) => {
    if (!selectedLocationId) {
      addToast('Please select a staging location', 'error');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { error } = await supabase.rpc('stage_order', {
        p_order_id: orderId,
        p_location_id: selectedLocationId,
        p_user_id: user.id
      });
      if (error) throw error;
      addToast('Order staged for dispatch', 'success');
      setSelectedLocationId('');
      refreshData();
    } catch (e: any) {
      addToast(`Staging error: ${e.message}`, 'error');
    }
  };

  return (
    <div className="container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', overflow: 'hidden' }}>
      
      {/* KPI Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <KpiCard title="Waiting for Packing" value={waitingPacking} icon={<Layers />} color="#f59e0b" />
        <KpiCard title="Packing Now" value={packingNow} icon={<Package />} color="#3b82f6" />
        <KpiCard title="Packed" value={packed} icon={<CheckCircle />} color="#8b5cf6" />
        <KpiCard title="Staged (Ready)" value={staged} icon={<ArrowRight />} color="#10b981" />
      </div>

      <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0 }}>
        
        {/* Main List */}
        <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontWeight: 800, color: 'var(--text-primary)', flex: 1 }}>Warehouse Packing Queue</h3>
            
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
            >
              <option value="all">All Stages</option>
              <option value="waiting_for_packing">Waiting for Packing</option>
              <option value="packing">Packing Now</option>
              <option value="packed">Packed</option>
              <option value="staged">Staged</option>
            </select>
            
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
                { key: 'items', header: 'ITEMS', render: r => <span>{r.items?.length || 0} items</span> },
                { key: 'age', header: 'TIME', render: r => <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(r.created_at).toLocaleTimeString()}</span> },
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
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
                  Customer: {selectedOrder.customer_name}
                </div>
              </div>

              {/* Items Verification */}
              <div style={{ backgroundColor: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)', fontWeight: 800, fontSize: '0.85rem' }}>
                  Items to Pack ({selectedOrder.items?.length || 0})
                </div>
                <div style={{ padding: '8px 16px', maxHeight: '200px', overflowY: 'auto' }}>
                  {selectedOrder.items?.map((item: any) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 600 }}>{item.product?.name}</span>
                      <span style={{ fontWeight: 800 }}>Qty: {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions Based on Status */}
              {selectedOrder.status === 'waiting_for_packing' && (
                <button 
                  onClick={() => handleStartPacking(selectedOrder.id)}
                  style={{ width: '100%', padding: '12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Start Packing
                </button>
              )}

              {selectedOrder.status === 'packing' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Scan or Enter Bag Number</label>
                  <input 
                    type="text" 
                    placeholder="e.g. BAG-001" 
                    value={bagNumber}
                    onChange={e => setBagNumber(e.target.value)}
                    style={{ padding: '12px', borderRadius: '8px', border: '2px solid var(--primary)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700 }}
                  />
                  <button 
                    onClick={() => handleCompletePacking(selectedOrder.id)}
                    style={{ width: '100%', padding: '12px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Confirm Packing Complete
                  </button>
                </div>
              )}

              {selectedOrder.status === 'packed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Assign Staging Location</label>
                  <select 
                    value={selectedLocationId}
                    onChange={e => setSelectedLocationId(e.target.value)}
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                  >
                    <option value="">Select Location...</option>
                    {stagingLocations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                  <button 
                    onClick={() => handleStageOrder(selectedOrder.id)}
                    style={{ width: '100%', padding: '12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Mark as Staged
                  </button>
                </div>
              )}

              {selectedOrder.status === 'staged' && (
                <div style={{ textAlign: 'center', padding: '32px 16px', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', color: '#10b981' }}>
                  <CheckCircle size={48} style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ margin: 0, fontWeight: 900 }}>Order is Staged</h3>
                  <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Waiting for rider handoff at Dispatch.</p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Package size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <h3>Select an Order</h3>
              <p style={{ textAlign: 'center', fontSize: '0.85rem', maxWidth: '200px' }}>Choose an order from the queue to process packing and staging.</p>
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
    waiting_for_packing: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
    packing: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
    packed: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6' },
    staged: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' }
  };
  const s = styles[status] || { bg: 'var(--border-light)', text: 'var(--text-secondary)' };
  
  return (
    <span style={{ backgroundColor: s.bg, color: s.text, padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800 }}>
      {status.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
};
