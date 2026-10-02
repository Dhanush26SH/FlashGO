import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { supabase } from '../../../services/api/supabaseClient';
import { AdminService } from '../../../services/api/AdminService';
import { InventoryService } from '../../../services/api/InventoryService';
import { Warehouse, Check, X } from 'lucide-react';
import { PutawayModule, ReturnsDispositionModule, InwardReceiptsModule } from './WarehouseOperations';

const InventoryAuditsModule: React.FC = () => {
  const { addToast, currentUser } = useApp();

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Audits state
  const [audits, setAudits] = useState<any[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [auditProductId, setAuditProductId] = useState('');
  const [auditLocationId, setAuditLocationId] = useState('');
  const [auditNote, setAuditNote] = useState('');
  const [auditMappedLocations, setAuditMappedLocations] = useState<any[]>([]);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    AdminService.getWarehouses().then(data => {
      setWarehouses(data);
      if (data.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(currentUser?.warehouse_id || data[0].id);
      }
    }).catch(e => addToast(e.message, 'error'));
  }, [currentUser]);

  useEffect(() => {
    if (!selectedWarehouseId) return;
    setIsLoading(true);
    AdminService.getWarehouseInventory(selectedWarehouseId).then(data => {
      setInventory(data || []);
      setIsLoading(false);
    }).catch(e => {
      addToast(e.message, 'error');
      setIsLoading(false);
    });
  }, [selectedWarehouseId]);

  const fetchAudits = async () => {
    if (!selectedWarehouseId) return;
    setLoadingAudits(true);
    try {
      const { data: auditData, error: auditErr } = await supabase
        .from('cycle_counts')
        .select('*, product:products(name, sku, internal_barcode), location:warehouse_locations(location_code), counter:profiles!counter_id(full_name)')
        .eq('warehouse_id', selectedWarehouseId)
        .order('created_at', { ascending: false });
      if (auditErr) throw auditErr;
      setAudits(auditData || []);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoadingAudits(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!auditProductId || !selectedWarehouseId) {
      setAuditMappedLocations([]);
      return;
    }
    
    const fetchMappedLocations = async () => {
      const { data, error } = await supabase
        .from('warehouse_product_placements')
        .select(`
          location_id,
          quantity,
          location:warehouse_locations ( location_code )
        `)
        .eq('product_id', auditProductId)
        .eq('warehouse_id', selectedWarehouseId);
        
      if (!error && data) {
        setAuditMappedLocations(data);
      } else {
        setAuditMappedLocations([]);
      }
    };
    
    fetchMappedLocations();
  }, [auditProductId, selectedWarehouseId]);

  const handleResolve = async (id: string, status: 'approved' | 'rejected') => {
    if (isResolving) return;
    if (!confirm(`Are you sure you want to ${status} this count?`)) return;
    setIsResolving(true);
    try {
      await InventoryService.resolveCycleCount(id, status, currentUser!.id);
      addToast(`Count ${status}`, 'success');
      await fetchAudits();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsResolving(false);
    }
  };

  const handleCreateAudit = async () => {
    if (!auditProductId || !auditLocationId) {
      addToast('Product and Location are required', 'error');
      return;
    }
    try {
      const { error } = await supabase.rpc('admin_create_warehouse_audit', {
        p_warehouse_id: selectedWarehouseId,
        p_product_id: auditProductId,
        p_location_id: auditLocationId,
        p_note: auditNote || null
      });
      if (error) throw error;
      addToast('Audit task created successfully', 'success');
      setAuditProductId('');
      setAuditLocationId('');
      setAuditNote('');
      fetchAudits();
    } catch (err: any) {
      addToast(err.message || 'Failed to create audit', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
        <Warehouse size={20} color="var(--primary)" />
        <strong style={{ fontSize: '1.1rem' }}>Active Dark Store:</strong>
        <select 
          value={selectedWarehouseId} 
          onChange={(e) => setSelectedWarehouseId(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontWeight: 600, minWidth: '250px' }}
        >
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name} {w.code ? `(${w.code})` : ''}</option>
          ))}
        </select>
        {isLoading && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Syncing inventory...</span>}
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>Create Audit Task</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Product</label>
            <select 
              value={auditProductId} 
              onChange={(e) => {
                setAuditProductId(e.target.value);
                setAuditLocationId('');
              }}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)' }}
            >
              <option value="">Select a product...</option>
              {inventory.map(inv => (
                <option key={inv.product_id} value={inv.product_id}>{inv.name} ({inv.sku})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Target Location (Mapped only)</label>
            <select 
              value={auditLocationId} 
              onChange={(e) => setAuditLocationId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)' }}
              disabled={!auditProductId}
            >
              <option value="">Select mapped location...</option>
              {auditMappedLocations.map((p: any) => (
                <option key={p.location_id} value={p.location_id}>{p.location?.location_code} (Qty: {p.quantity})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Note (Optional)</label>
            <input 
              type="text" 
              value={auditNote} 
              onChange={(e) => setAuditNote(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)' }}
              placeholder="Reason for count..."
            />
          </div>
          <button 
            onClick={handleCreateAudit}
            style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 24px', fontWeight: 600, cursor: 'pointer', height: '42px' }}
            disabled={!auditProductId || !auditLocationId}
          >
            Create Task
          </button>
        </div>
      </div>
      
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>Audit Tasks</h3>
        {loadingAudits ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading audits...</p>
        ) : audits.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No audit tasks found for this warehouse.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Created</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Location</th>
                <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>System Qty</th>
                <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>Counted</th>
                <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>Variance</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Auditor</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {audits.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{new Date(a.created_at).toLocaleString()}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
                      backgroundColor: a.status === 'open' ? '#fef3c7' : a.status === 'counting' ? '#e0f2fe' : a.status === 'submitted' ? '#f3e8ff' : '#f1f5f9',
                      color: a.status === 'open' ? '#d97706' : a.status === 'counting' ? '#0284c7' : a.status === 'submitted' ? '#9333ea' : '#475569'
                    }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{a.product?.name} ({a.product?.sku})</td>
                  <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{a.location?.location_code}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{a.status === 'open' || a.status === 'counting' ? '-' : a.system_quantity}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{a.counted_quantity ?? '-'}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: a.variance < 0 ? '#ef4444' : a.variance > 0 ? '#10b981' : 'var(--text-primary)' }}>
                    {a.variance !== null ? (a.variance > 0 ? `+${a.variance}` : a.variance) : '-'}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{a.counter?.full_name || '-'}</td>
                  <td style={{ padding: '12px' }}>
                    {a.status === 'submitted' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleResolve(a.id, 'approved')} disabled={isResolving} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: isResolving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', opacity: isResolving ? 0.5 : 1 }}>
                          <Check size={14} /> Approve
                        </button>
                        <button onClick={() => handleResolve(a.id, 'rejected')} disabled={isResolving} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: isResolving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', opacity: isResolving ? 0.5 : 1 }}>
                          <X size={14} /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export const WarehouseTasks: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'putaway' | 'inward' | 'audits' | 'returns'>('putaway');

  const activeTabStyle = { padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' };
  const inactiveTabStyle = { padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' };

  return (
    <div className="container">
      <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid var(--border-light)', marginBottom: '24px', overflowX: 'auto' }}>
        <button style={activeTab === 'putaway' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('putaway')}>Putaway Tasks</button>
        <button style={activeTab === 'inward' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('inward')}>Inward Receipts</button>
        <button style={activeTab === 'audits' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('audits')}>Inventory Audits</button>
        <button style={activeTab === 'returns' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('returns')}>Returns</button>
      </div>

      {activeTab === 'putaway' && <PutawayModule />}
      {activeTab === 'inward' && <InwardReceiptsModule />}
      {activeTab === 'audits' && <InventoryAuditsModule />}
      {activeTab === 'returns' && <ReturnsDispositionModule />}
    </div>
  );
};
