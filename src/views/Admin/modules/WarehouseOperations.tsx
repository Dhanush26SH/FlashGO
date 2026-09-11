import React, { useState, useEffect } from 'react';
import { Package, MapPin, Check, Plus, AlertCircle, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { InventoryService } from '../../../services/api/InventoryService';
import { useApp } from '../../../context/AppContext';
import { supabase } from '../../../services/api/supabaseClient';

const EmptyState: React.FC<{ message: string, icon: React.ReactNode }> = ({ message, icon }) => (
  <tr>
    <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        {icon}
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{message}</span>
      </div>
    </td>
  </tr>
);

export const PutawayModule: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      if (!currentUser?.warehouse_id) return;
      const data = await InventoryService.getPutawayTasks(currentUser.warehouse_id);
      setTasks(data || []);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    if (!supabase || !currentUser?.warehouse_id) return;
    const channel = supabase.channel('putaway_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'putaway_tasks', filter: `warehouse_id=eq.${currentUser.warehouse_id}` }, () => {
        fetchTasks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  const handleComplete = async (taskId: string) => {
    const loc = prompt('Enter destination location (e.g. A-12-3):');
    if (!loc) return;
    try {
      await InventoryService.completePutaway(taskId, loc, currentUser!.id);
      addToast('Putaway completed', 'success');
      fetchTasks();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  if (loading) return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading putaway tasks...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin color="var(--primary)" /> Putaway Operations
        </h2>
        <button onClick={fetchTasks} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Task ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Batch</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Quantity</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <EmptyState message="No pending putaway tasks found." icon={<Package size={32} opacity={0.5} />} />
            ) : (
              tasks.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{t.id.slice(0, 8)}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{t.product?.name || 'Unknown'}</td>
                  <td style={{ padding: '12px 16px' }}>{t.batch?.batch_number || '-'}</td>
                  <td style={{ padding: '12px 16px' }}>{t.quantity}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: t.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: t.status === 'completed' ? '#10b981' : '#f59e0b' }}>
                      {t.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {t.status === 'pending' && (
                      <button onClick={() => handleComplete(t.id)} style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--primary)', background: 'var(--primary-transparent)', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}>
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const CycleCountsModule: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [counts, setCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCounts = async () => {
    try {
      if (!currentUser?.warehouse_id) return;
      const data = await InventoryService.getCycleCounts(currentUser.warehouse_id);
      setCounts(data || []);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCounts();
    if (!supabase || !currentUser?.warehouse_id) return;
    const channel = supabase.channel('cycle_counts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cycle_counts', filter: `warehouse_id=eq.${currentUser.warehouse_id}` }, () => {
        fetchCounts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  const handleResolve = async (id: string, status: 'approved' | 'rejected') => {
    if (!confirm(`Are you sure you want to ${status} this count?`)) return;
    try {
      await InventoryService.resolveCycleCount(id, status, currentUser!.id);
      addToast(`Count ${status}`, 'success');
      fetchCounts();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  if (loading) return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading cycle counts...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle color="var(--primary)" /> Cycle Counts & Variances
        </h2>
        <button onClick={fetchCounts} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Count ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>System Qty</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Counted Qty</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Variance</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {counts.length === 0 ? (
              <EmptyState message="No cycle counts pending resolution." icon={<AlertCircle size={32} opacity={0.5} />} />
            ) : (
              counts.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{c.id.slice(0, 8)}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{c.product?.name || 'Unknown'}</td>
                  <td style={{ padding: '12px 16px' }}>{c.system_quantity}</td>
                  <td style={{ padding: '12px 16px' }}>{c.counted_quantity ?? '-'}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: (c.variance || 0) < 0 ? '#ef4444' : (c.variance || 0) > 0 ? '#f59e0b' : 'inherit' }}>
                    {c.variance ?? '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: c.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : c.status === 'rejected' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: c.status === 'approved' ? '#10b981' : c.status === 'rejected' ? '#ef4444' : '#f59e0b' }}>
                      {c.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {c.status === 'submitted' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleResolve(c.id, 'approved')} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                          <Check size={14} /> Approve
                        </button>
                        <button onClick={() => handleResolve(c.id, 'rejected')} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                          <X size={14} /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ReturnsDispositionModule: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    try {
      if (!currentUser?.warehouse_id) return;
      const data = await InventoryService.getUnpackQueue(currentUser.warehouse_id);
      setQueue(data || []);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    if (!supabase || !currentUser?.warehouse_id) return;
    const channel = supabase.channel('order_unpack_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_unpack_queue', filter: `warehouse_id=eq.${currentUser.warehouse_id}` }, () => {
        fetchQueue();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  const handleDisposition = async (id: string, disp: 'restocked' | 'damaged' | 'quarantine') => {
    if (!confirm(`Confirm disposition: ${disp.toUpperCase()}?`)) return;
    try {
      await InventoryService.processOrderUnpack(id, disp, currentUser!.id);
      addToast(`Processed as ${disp}`, 'success');
      fetchQueue();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  if (loading) return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading returns queue...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle color="var(--primary)" /> Returns & Disposition Queue
        </h2>
        <button onClick={fetchQueue} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Return ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Order ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <EmptyState message="No pending items in returns & disposition queue." icon={<AlertTriangle size={32} opacity={0.5} />} />
            ) : (
              queue.map(q => (
                <tr key={q.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{q.id.slice(0, 8)}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{q.order_id.slice(0, 8)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: q.status === 'pending' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: q.status === 'pending' ? '#f59e0b' : '#10b981' }}>
                      {q.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {q.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleDisposition(q.id, 'restocked')} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: 'pointer', fontSize: '0.75rem' }}>
                          Restock
                        </button>
                        <button onClick={() => handleDisposition(q.id, 'damaged')} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}>
                          Damaged
                        </button>
                        <button onClick={() => handleDisposition(q.id, 'quarantine')} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', cursor: 'pointer', fontSize: '0.75rem' }}>
                          Quarantine
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
