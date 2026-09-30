import React, { useState, useEffect } from 'react';
import { Package, MapPin, Check, Plus, AlertCircle, RefreshCw, X, AlertTriangle, Search, ChevronLeft, ChevronRight, Clock, User, Hash, Calendar, CheckCircle } from 'lucide-react';
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
  const [kpis, setKpis] = useState({ pending: 0, in_progress: 0, completed_today: 0 });
  const [totalCount, setTotalCount] = useState(0);

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const limit = 25;

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('7days'); // 'today', '7days', '30days'

  // Modal
  const [selectedTask, setSelectedTask] = useState<any>(null);

  const getDatesForRange = (range: string) => {
    const end = new Date();
    const start = new Date();
    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (range === '7days') {
      start.setDate(end.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (range === '30days') {
      start.setDate(end.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    }
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  };

  const fetchTasks = async () => {
    try {
      if (!selectedWarehouseId) return;
      setLoading(true);
      
      const { startDate, endDate } = getDatesForRange(dateRange);
      const res = await InventoryService.getPutawayTasksPaginated(
        selectedWarehouseId,
        page,
        limit,
        { search, status: statusFilter, startDate, endDate }
      );
      
      setTasks(res.data || []);
      setTotalCount(res.count || 0);
      setKpis(res.kpis);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    InventoryService.getWarehouses().then(data => {
      setWarehouses(data);
      if (data.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(currentUser?.warehouse_id || data[0].id);
      }
    }).catch(console.error);
  }, [currentUser]);

  useEffect(() => {
    if (selectedWarehouseId) fetchTasks();
  }, [selectedWarehouseId, page, dateRange, statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page !== 1) setPage(1);
      else if (selectedWarehouseId) fetchTasks();
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!supabase || !selectedWarehouseId) return;
    const channel = supabase.channel('putaway_changes_' + selectedWarehouseId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'putaway_tasks', filter: `warehouse_id=eq.${selectedWarehouseId}` }, () => {
        fetchTasks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedWarehouseId]);

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const kpiCardStyle = {
    flex: 1,
    padding: '20px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-light)',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin color="var(--primary)" /> Putaway Monitoring & History
        </h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={selectedWarehouseId} 
            onChange={e => setSelectedWarehouseId(e.target.value)}
            disabled={!!currentUser?.warehouse_id}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', opacity: currentUser?.warehouse_id ? 0.7 : 1 }}
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button onClick={fetchTasks} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={kpiCardStyle}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>PENDING TASKS</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b' }}>{kpis.pending}</span>
        </div>
        <div style={kpiCardStyle}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>IN PROGRESS</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6' }}>{kpis.in_progress}</span>
        </div>
        <div style={kpiCardStyle}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>COMPLETED TODAY</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>{kpis.completed_today}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
        <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search by product, barcode, staff, task..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
          />
        </div>
        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', minWidth: '150px' }}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select 
          value={dateRange} 
          onChange={e => setDateRange(e.target.value)}
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', minWidth: '150px' }}
        >
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
        </select>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Date / Time</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Task ID</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Qty</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Source / Batch</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Assigned Staff</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Destination</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && tasks.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center' }}>Loading tasks...</td></tr>
              ) : tasks.length === 0 ? (
                <EmptyState message="No putaway tasks match the current filters." icon={<Package size={32} opacity={0.5} />} />
              ) : (
                tasks.map(t => (
                  <tr 
                    key={t.id} 
                    style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                    onClick={() => setSelectedTask(t)}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                      <div>{new Date(t.created_at).toLocaleDateString()}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--primary)' }}>{t.id.slice(0, 8)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t.product?.name || 'Unknown'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.product?.sku || 'No SKU'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.product?.internal_barcode || 'No Barcode'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 800 }}>{t.quantity}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ color: 'var(--text-primary)' }}>{t.source_type || 'GRN'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.batch?.batch_number || '-'}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {t.worker ? (
                        <>
                          <div style={{ color: 'var(--text-primary)' }}>{t.worker.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.worker.employee_id || 'No ID'}</div>
                        </>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: t.destination_location ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {t.destination_location || 'Awaiting allocation'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ 
                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, 
                        backgroundColor: t.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : t.status === 'in_progress' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)', 
                        color: t.status === 'completed' ? '#10b981' : t.status === 'in_progress' ? '#3b82f6' : '#f59e0b' 
                      }}>
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Showing {tasks.length > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, totalCount)} of {totalCount} records
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              disabled={page <= 1} 
              onClick={() => setPage(p => p - 1)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600, padding: '0 8px' }}>Page {page} of {totalPages}</span>
            <button 
              disabled={page >= totalPages} 
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Task Details Modal */}
      {selectedTask && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--bg-base)', padding: '24px', borderRadius: '16px', width: '500px', maxWidth: '90%', border: '1px solid var(--border-light)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflowY: 'auto', maxHeight: '90vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Putaway Task Details</h3>
              <button onClick={() => setSelectedTask(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Status</span>
                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 800, backgroundColor: selectedTask.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : selectedTask.status === 'in_progress' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: selectedTask.status === 'completed' ? '#10b981' : selectedTask.status === 'in_progress' ? '#3b82f6' : '#f59e0b' }}>
                  {selectedTask.status.toUpperCase()}
                </span>
              </div>
              
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Identifiers</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-muted)' }}>Task ID</span><span style={{ fontFamily: 'monospace' }}>{selectedTask.id}</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-muted)' }}>Source</span><span>{selectedTask.source_type || 'GRN'}</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-muted)' }}>Batch</span><span>{selectedTask.batch?.batch_number || 'N/A'}</span></div>
                </div>
              </div>
              
              <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: 0 }} />
              
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Product Info</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-muted)' }}>Name</span><span style={{ fontWeight: 700 }}>{selectedTask.product?.name || 'Unknown'}</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-muted)' }}>SKU</span><span>{selectedTask.product?.sku || 'N/A'}</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-muted)' }}>FLH Barcode</span><span>{selectedTask.product?.internal_barcode || 'N/A'}</span></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-muted)' }}>Quantity to Putaway</span><span style={{ fontWeight: 800 }}>{selectedTask.quantity}</span></div>
                </div>
              </div>
              
              <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: 0 }} />
              
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Worker & Location</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Assigned Staff</span>
                    <span>{selectedTask.worker ? `${selectedTask.worker.full_name} (${selectedTask.worker.employee_id || 'No ID'})` : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Unassigned</span>}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Destination</span>
                    <span style={{ fontWeight: 700 }}>{selectedTask.destination_location || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontWeight: 400 }}>Awaiting allocation</span>}</span>
                  </div>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: 0 }} />
              
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Timestamps</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Created At</span>
                    <span>{new Date(selectedTask.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Claimed At</span>
                    <span>{selectedTask.claimed_at ? new Date(selectedTask.claimed_at).toLocaleString() : '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Completed At</span>
                    <span>{selectedTask.completed_at ? new Date(selectedTask.completed_at).toLocaleString() : '-'}</span>
                  </div>
                  
                  {selectedTask.claimed_at && selectedTask.completed_at && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', padding: '8px', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Putaway Duration</span>
                      <span style={{ color: '#10b981', fontWeight: 800 }}>
                        {Math.round((new Date(selectedTask.completed_at).getTime() - new Date(selectedTask.claimed_at).getTime()) / 60000)} mins
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
            </div>
            
            <button 
              style={{ width: '100%', marginTop: '24px', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              onClick={() => setSelectedTask(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export const ReturnsDispositionModule: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [locations, setLocations] = useState<any[]>([]);
  const [restockModalOpen, setRestockModalOpen] = useState(false);
  const [currentRestockId, setCurrentRestockId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [selectedQueueDate, setSelectedQueueDate] = useState<Date>(new Date());
  const [selectedQueueStatus, setSelectedQueueStatus] = useState<string>('all');

  const fetchQueue = async () => {
    try {
      if (!selectedWarehouseId) return;
      setLoading(true);
      setErrorState(null);
      const data = await InventoryService.getUnpackQueue(selectedWarehouseId, selectedQueueDate, selectedQueueStatus);
      setQueue(data || []);
    } catch (e: any) {
      addToast(e.message, 'error');
      setErrorState(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    InventoryService.getWarehouses().then(data => {
      setWarehouses(data);
      if (data.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(currentUser?.warehouse_id || data[0].id);
      }
    }).catch(console.error);
  }, [currentUser]);

  useEffect(() => {
    if (selectedWarehouseId) {
      fetchQueue();
      InventoryService.getActiveLocations(selectedWarehouseId).then(setLocations).catch(console.error);
    }
  }, [selectedWarehouseId, selectedQueueDate, selectedQueueStatus]);

  useEffect(() => {
    if (!supabase || !selectedWarehouseId) return;
    const channel = supabase.channel('order_unpack_changes_' + selectedWarehouseId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_unpack_queue', filter: `warehouse_id=eq.${selectedWarehouseId}` }, () => {
        fetchQueue();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedWarehouseId]);

  const initiateRestock = (id: string) => {
    setCurrentRestockId(id);
    setSelectedLocationId('');
    setRestockModalOpen(true);
  };

  const submitRestock = async () => {
    if (!currentRestockId || !selectedLocationId) return;
    try {
      setProcessing(true);
      await InventoryService.processOrderUnpack(currentRestockId, 'restocked', currentUser!.id, selectedLocationId);
      addToast('Processed as restocked', 'success');
      setRestockModalOpen(false);
      setCurrentRestockId(null);
      fetchQueue();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDisposition = async (id: string, disp: 'restocked' | 'damaged' | 'quarantine') => {
    if (disp === 'restocked') {
      initiateRestock(id);
      return;
    }
    if (!confirm(`Confirm disposition: ${disp.toUpperCase()}?`)) return;
    try {
      setProcessing(true);
      await InventoryService.processOrderUnpack(id, disp, currentUser!.id);
      addToast(`Processed as ${disp}`, 'success');
      fetchQueue();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading returns queue...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle color="var(--primary)" /> Returns & Disposition Queue
        </h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '4px', backgroundColor: 'var(--bg-base)' }}>
            <button
              onClick={() => {
                const prev = new Date(selectedQueueDate);
                prev.setDate(prev.getDate() - 1);
                setSelectedQueueDate(prev);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px 8px' }}
            >
              &lt;
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '90px', textAlign: 'center' }}>
              {selectedQueueDate.toLocaleDateString()}
            </span>
            <button
              onClick={() => {
                const next = new Date(selectedQueueDate);
                next.setDate(next.getDate() + 1);
                setSelectedQueueDate(next);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px 8px' }}
            >
              &gt;
            </button>
          </div>
          <select
            value={selectedQueueStatus}
            onChange={e => setSelectedQueueStatus(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="restocked">Restocked</option>
            <option value="damaged">Damaged</option>
            <option value="quarantine">Quarantine</option>
          </select>
          <select 
            value={selectedWarehouseId} 
            onChange={e => setSelectedWarehouseId(e.target.value)}
            disabled={!!currentUser?.warehouse_id}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', opacity: currentUser?.warehouse_id ? 0.7 : 1 }}
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button 
            onClick={fetchQueue} 
            disabled={loading}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Return ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Order ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Processed At</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {errorState ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <AlertTriangle size={32} opacity={0.5} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Failed to load queue: {errorState}</span>
                  </div>
                </td>
              </tr>
            ) : queue.length === 0 ? (
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
                  <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {q.processed_at ? new Date(q.processed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {q.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleDisposition(q.id, 'restocked')} disabled={processing} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: processing ? 'not-allowed' : 'pointer', fontSize: '0.75rem', opacity: processing ? 0.6 : 1 }}>
                          Restock
                        </button>
                        <button onClick={() => handleDisposition(q.id, 'damaged')} disabled={processing} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: processing ? 'not-allowed' : 'pointer', fontSize: '0.75rem', opacity: processing ? 0.6 : 1 }}>
                          Damaged
                        </button>
                        <button onClick={() => handleDisposition(q.id, 'quarantine')} disabled={processing} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', cursor: processing ? 'not-allowed' : 'pointer', fontSize: '0.75rem', opacity: processing ? 0.6 : 1 }}>
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

      {restockModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={20} color="#10b981" /> Restock Location
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.4 }}>
              Choose a physical location to restock this return into. The location must belong to the current warehouse.
            </p>
            
            <select 
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              disabled={processing}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', marginBottom: '24px' }}
            >
              <option value="">-- Select Destination --</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.location_code} ({loc.zone})</option>
              ))}
            </select>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setRestockModalOpen(false)}
                disabled={processing}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-primary)', cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.6 : 1 }}
              >
                Cancel
              </button>
              <button 
                onClick={submitRestock}
                disabled={!selectedLocationId || processing}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#10b981', color: 'white', cursor: (!selectedLocationId || processing) ? 'not-allowed' : 'pointer', opacity: (!selectedLocationId || processing) ? 0.6 : 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {processing ? <RefreshCw size={14} className="spin" /> : <CheckCircle size={14} />} 
                {processing ? 'Processing...' : 'Confirm Restock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
