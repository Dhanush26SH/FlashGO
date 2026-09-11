import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { supabase } from '../../../services/db';
import { WorkSlotService } from '../../../services/api/WorkSlotService';
import type { WorkSlot } from '../../../services/api/WorkSlotService';
import { Calendar, Plus, Users, Warehouse, Search } from 'lucide-react';

export const WorkSlotManagement: React.FC = () => {
  const { addToast } = useApp();
  const [slots, setSlots] = useState<WorkSlot[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [warehouseId, setWarehouseId] = useState('');
  const [targetRole, setTargetRole] = useState<'picker' | 'driver' | 'warehouse_staff'>('picker');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [status, setStatus] = useState<'published' | 'unpublished' | 'cancelled'>('unpublished');
  const [rateMin, setRateMin] = useState<number | ''>('');
  const [rateMax, setRateMax] = useState<number | ''>('');
  
  const [activeTab, setActiveTab] = useState<'all' | 'picker' | 'driver' | 'warehouse_staff'>('all');
  const { currentUser } = useApp();

  useEffect(() => {
    loadData();
    loadWarehouses();
    
    if (!supabase) return;
    const sub = supabase.channel('work_slots_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_slots' }, () => {
        loadData();
      })
      .subscribe();
      
    return () => { sub.unsubscribe(); };
  }, []);

  const loadWarehouses = async () => {
    if (supabase) {
      const { data } = await supabase.from('warehouses').select('*');
      if (data) setWarehouses(data);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await WorkSlotService.adminGetWorkSlots();
      setSlots(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toLocalDT = (isoStr: string) => {
    const d = new Date(isoStr);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0,16);
  };

  const handleEdit = (slot: WorkSlot) => {
    setEditingId(slot.id);
    setWarehouseId(slot.warehouse_id);
    setTargetRole(slot.target_role);
    setStartTime(toLocalDT(slot.start_time));
    setEndTime(toLocalDT(slot.end_time));
    setCapacity(slot.capacity);
    setStatus(slot.status);
    setRateMin(slot.estimated_hourly_rate_min ?? '');
    setRateMax(slot.estimated_hourly_rate_max ?? '');
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setWarehouseId(currentUser?.warehouse_id || '');
    setTargetRole('picker');
    setStartTime('');
    setEndTime('');
    setCapacity(1);
    setStatus('unpublished');
    setRateMin('');
    setRateMax('');
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId || !targetRole || !startTime || !endTime) {
      addToast('Please fill all required fields', 'error');
      return;
    }

    const sDt = new Date(startTime).toISOString();
    const eDt = new Date(endTime).toISOString();

    try {
      const rMin = rateMin !== '' ? Number(rateMin) : null;
      const rMax = rateMax !== '' ? Number(rateMax) : null;

      if (editingId) {
        await WorkSlotService.adminEditWorkSlot(editingId, warehouseId, targetRole, sDt, eDt, capacity, status, rMin, rMax);
        addToast('Work slot updated', 'success');
      } else {
        await WorkSlotService.adminCreateWorkSlot(warehouseId, targetRole, sDt, eDt, capacity, status, rMin, rMax);
        addToast('Work slot created', 'success');
      }
      resetForm();
      loadData();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleCancelSlot = async (slotId: string) => {
    if (!window.confirm("Are you sure you want to cancel this slot? This will cancel all active bookings for this slot!")) return;
    try {
      await WorkSlotService.adminCancelWorkSlot(slotId);
      addToast('Slot cancelled successfully', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="container">
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Work Slot Management</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Publish available work times for Picker, Driver, and Warehouse Staff to self-book.</p>
          </div>
          <button 
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {showForm ? 'Cancel' : <><Plus size={18} /> Create Slot</>}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Warehouse</label>
                <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} disabled={!!currentUser?.warehouse_id} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', opacity: currentUser?.warehouse_id ? 0.7 : 1 }}>
                  <option value="">Select Warehouse...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Target Role</label>
                <select value={targetRole} onChange={e => setTargetRole(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }}>
                  <option value="picker">Picker</option>
                  <option value="driver">Driver</option>
                  <option value="warehouse_staff">Warehouse Staff</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Capacity (Workers)</label>
                <input type="number" min="1" value={capacity} onChange={e => setCapacity(parseInt(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }} />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Start Time</label>
                <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>End Time</label>
                <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }}>
                  <option value="unpublished">Unpublished (Hidden)</option>
                  <option value="published">Published (Bookable)</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {targetRole === 'driver' && (
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Min Hourly Rate (₹)</label>
                  <input type="number" min="0" value={rateMin} onChange={e => setRateMin(e.target.value ? Number(e.target.value) : '')} placeholder="Optional for draft" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Max Hourly Rate (₹)</label>
                  <input type="number" min="0" value={rateMax} onChange={e => setRateMax(e.target.value ? Number(e.target.value) : '')} placeholder="Optional for draft" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }} />
                </div>
                <div style={{ flex: 1 }} />
              </div>
            )}

            <div style={{ alignSelf: 'flex-end', marginTop: '8px' }}>
              <button type="submit" style={{ padding: '8px 24px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                {editingId ? 'Save Changes' : 'Create Slot'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
        {(['all', 'driver', 'picker', 'warehouse_staff'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              background: activeTab === tab ? 'var(--primary)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
            }}
          >
            {tab === 'all' ? 'All' : tab.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
        {slots.filter(s => activeTab === 'all' || s.target_role === activeTab).map(slot => {
          const wName = slot.warehouse_name || warehouses.find(w => w.id === slot.warehouse_id)?.name || 'Unknown Warehouse';
          const isFull = slot.booked_count >= slot.capacity;
          return (
            <div key={slot.id} className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{new Date(slot.start_time).toLocaleDateString()}</h4>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {new Date(slot.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(slot.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', backgroundColor: slot.status === 'published' ? 'rgba(16, 185, 129, 0.1)' : slot.status === 'unpublished' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: slot.status === 'published' ? '#10b981' : slot.status === 'unpublished' ? '#f59e0b' : '#ef4444' }}>
                    {slot.status.toUpperCase()}
                  </span>
                  {slot.target_role === 'driver' && slot.estimated_hourly_rate_min != null && slot.estimated_hourly_rate_max != null && (
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                      ₹{slot.estimated_hourly_rate_min}–₹{slot.estimated_hourly_rate_max}/hr
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Warehouse size={14} /> {wName}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}><Users size={14} /> {slot.target_role.replace('_', ' ')}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isFull ? 'var(--danger)' : 'var(--text-primary)' }}>
                    Booked: {slot.booked_count} / {slot.capacity} {isFull && '(FULL)'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => handleEdit(slot)}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  Edit
                </button>
                {slot.status !== 'cancelled' && (
                  <button 
                    onClick={() => handleCancelSlot(slot.id)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {slots.length === 0 && !loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No work slots found. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
};
