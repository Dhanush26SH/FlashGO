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
  
  // Bookings view states
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
  const [slotBookings, setSlotBookings] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  
  const [warehouseId, setWarehouseId] = useState('');
  const [targetRole, setTargetRole] = useState<'picker' | 'driver' | 'warehouse_staff'>('picker');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [status, setStatus] = useState<'published' | 'unpublished' | 'cancelled'>('unpublished');
  const [rateMin, setRateMin] = useState<number | ''>('');
  const [rateMax, setRateMax] = useState<number | ''>('');
  const [pickerPayRate, setPickerPayRate] = useState<number | ''>(0.50);
  
  // Picker Incentive States
  const [pickerIncentiveEnabled, setPickerIncentiveEnabled] = useState(false);
  const [pickerMilestones, setPickerMilestones] = useState<any[]>([]);

  // Warehouse Staff Assignment Form States
  const [availableWarehouseStaff, setAvailableWarehouseStaff] = useState<any[]>([]);
  const [warehouseStaffAssignments, setWarehouseStaffAssignments] = useState<{staffId: string, duty: string}[]>([]);
  
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

  useEffect(() => {
    if (warehouseId && targetRole === 'warehouse_staff') {
      loadAvailableWarehouseStaff(warehouseId);
    } else {
      setAvailableWarehouseStaff([]);
    }
  }, [warehouseId, targetRole]);

  const loadWarehouses = async () => {
    if (supabase) {
      const { data } = await supabase.from('warehouses').select('*');
      if (data) setWarehouses(data);
    }
  };

  const loadAvailableWarehouseStaff = async (wId: string) => {
    try {
      const { data, error } = await supabase!
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'warehouse_staff')
        .eq('warehouse_id', wId)
        .eq('is_suspended', false);
      if (error) throw error;
      setAvailableWarehouseStaff(data || []);
    } catch (e) {
      console.error('Error loading warehouse staff', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await WorkSlotService.adminGetWorkSlots();
      setSlots(data);
      if (expandedSlotId) {
        loadSlotBookings(expandedSlotId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSlotBookings = async (slotId: string) => {
    setLoadingBookings(true);
    try {
      const { data, error } = await supabase!
        .from('staff_shifts')
        .select(`
          id, shift_start, shift_end, status,
          profiles ( id, full_name, email, phone )
        `)
        .eq('work_slot_id', slotId)
        .neq('status', 'cancelled');
      
      if (error) throw error;
      setSlotBookings(data || []);
      return data || [];
    } catch (e) {
      console.error(e);
      addToast('Failed to load bookings', 'error');
      return [];
    } finally {
      setLoadingBookings(false);
    }
  };

  const toggleBookings = (slotId: string) => {
    if (expandedSlotId === slotId) {
      setExpandedSlotId(null);
      setSlotBookings([]);
    } else {
      setExpandedSlotId(slotId);
      loadSlotBookings(slotId);
    }
  };

  const toLocalDT = (isoStr: string) => {
    const d = new Date(isoStr);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0,16);
  };

  const handleEdit = async (slot: WorkSlot) => {
    setEditingId(slot.id);
    setWarehouseId(slot.warehouse_id);
    setTargetRole(slot.target_role);
    setStartTime(toLocalDT(slot.start_time));
    setEndTime(toLocalDT(slot.end_time));
    setCapacity(slot.capacity);
    setStatus(slot.status);
    setRateMin(slot.estimated_hourly_rate_min ?? '');
    setRateMax(slot.estimated_hourly_rate_max ?? '');
    setPickerPayRate(slot.picker_pay_rate ?? 0.50);
    
    setPickerIncentiveEnabled(slot.picker_incentive_enabled ?? false);
    setPickerMilestones(slot.picker_incentives ?? []);
    
    if (slot.target_role === 'warehouse_staff') {
      const shifts = await loadSlotBookings(slot.id);
      setWarehouseStaffIds(shifts.map(s => (s.profiles as any)?.id || (s.profiles as any)?.[0]?.id).filter(Boolean));
    } else {
      setWarehouseStaffIds([]);
    }
    
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
    setPickerPayRate(0.50);
    setPickerIncentiveEnabled(false);
    setPickerMilestones([]);
    setWarehouseStaffAssignments([]);
    setShowForm(false);
  };

  const handleAddMilestone = () => {
    if (pickerMilestones.length >= 4) return;
    setPickerMilestones([...pickerMilestones, { target_items: '', reward_amount: '', sort_order: pickerMilestones.length + 1 }]);
  };

  const handleUpdateMilestone = (index: number, field: string, value: string) => {
    const newMilestones = [...pickerMilestones];
    const numValue = value === '' ? '' : Number(value);
    newMilestones[index] = { ...newMilestones[index], [field]: numValue };
    setPickerMilestones(newMilestones);
  };

  const handleRemoveMilestone = (index: number) => {
    const newMilestones = pickerMilestones.filter((_, i) => i !== index).map((m, i) => ({ ...m, sort_order: i + 1 }));
    setPickerMilestones(newMilestones);
  };

  const handleMoveMilestone = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === pickerMilestones.length - 1) return;
    
    const newMilestones = [...pickerMilestones];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    
    const temp = newMilestones[index];
    newMilestones[index] = newMilestones[swapIndex];
    newMilestones[swapIndex] = temp;
    
    newMilestones.forEach((m, i) => m.sort_order = i + 1);
    setPickerMilestones(newMilestones);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId || !targetRole || !startTime || !endTime) {
      addToast('Please fill all required fields', 'error');
      return;
    }

    if (targetRole === 'warehouse_staff' && warehouseStaffAssignments.length === 0) {
      addToast('Please assign at least one warehouse staff', 'error');
      return;
    }

    if (targetRole === 'warehouse_staff') {
      const missingDuty = warehouseStaffAssignments.some(a => !a.duty);
      if (missingDuty) {
        addToast('Please assign a duty to all selected warehouse staff', 'error');
        return;
      }
    }

    const sDt = new Date(startTime).toISOString();
    const eDt = new Date(endTime).toISOString();

    if (targetRole === 'picker' && status === 'published') {
      if (pickerPayRate === '' || Number(pickerPayRate) <= 0) {
        addToast('Picker Pay Rate must be greater than 0', 'error');
        return;
      }
    }

    if (targetRole === 'picker' && pickerIncentiveEnabled) {
      if (pickerMilestones.length === 0) {
        addToast('Add at least one incentive milestone.', 'error');
        return;
      }
      for (const m of pickerMilestones) {
        if (m.target_items === '' || Number(m.target_items) <= 0) {
          addToast('Target Items must be greater than 0', 'error');
          return;
        }
        if (m.reward_amount === '' || Number(m.reward_amount) < 0) {
          addToast('Reward Amount must be 0 or greater', 'error');
          return;
        }
      }
    }

    try {
      if (targetRole === 'warehouse_staff') {
        if (editingId) {
          await WorkSlotService.adminUpdateWarehouseStaffShift(editingId, sDt, eDt, warehouseStaffAssignments);
          addToast('Warehouse shift updated', 'success');
        } else {
          await WorkSlotService.adminCreateWarehouseStaffShift(warehouseId, sDt, eDt, warehouseStaffAssignments);
          addToast('Warehouse shift created & assigned', 'success');
        }
      } else {
        const rMin = rateMin !== '' ? Number(rateMin) : null;
        const rMax = rateMax !== '' ? Number(rateMax) : null;
        const pRate = pickerPayRate !== '' ? Number(pickerPayRate) : null;

        if (editingId) {
          await WorkSlotService.adminEditWorkSlot(editingId, warehouseId, targetRole, sDt, eDt, capacity, status, rMin, rMax, pRate);
          if (targetRole === 'picker') {
             await WorkSlotService.adminSaveIncentives(editingId, pickerIncentiveEnabled, pickerMilestones);
          }
          addToast('Work slot updated', 'success');
        } else {
          // Note: Admin create slot needs to return ID to save incentives properly. 
          // Assuming we need to reload data and find it, or we skip incentives on create for now? 
          // Wait, adminCreateWorkSlot currently returns void and doesn't return the ID. 
          // I will use a simple workaround: fetch the newly created slot.
          await WorkSlotService.adminCreateWorkSlot(warehouseId, targetRole, sDt, eDt, capacity, status, rMin, rMax, pRate);
          if (targetRole === 'picker') {
             // Let's refetch to get the latest slot id for this exact time and warehouse
             const allSlots = await WorkSlotService.adminGetWorkSlots();
             const newSlot = allSlots.find(s => s.warehouse_id === warehouseId && s.target_role === targetRole && s.start_time === sDt);
             if (newSlot) {
               await WorkSlotService.adminSaveIncentives(newSlot.id, pickerIncentiveEnabled, pickerMilestones);
             }
          }
          addToast('Work slot created', 'success');
        }
      }
      
      resetForm();
      loadData();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleCancelSlot = async (slotId: string) => {
    if (!window.confirm("Are you sure you want to cancel this slot? This will cancel all scheduled bookings for this slot. Active or completed shifts will block this action.")) return;
    try {
      await WorkSlotService.adminCancelWorkSlot(slotId);
      addToast('Slot cancelled successfully', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const filteredSlots = activeTab === 'all' ? slots : slots.filter(s => s.target_role === activeTab);

  return (
    <div className="container">
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Work Slot Management</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Publish self-bookable slots for Pickers and Drivers, and directly assign shifts to Warehouse Staff.</p>
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
              
              {targetRole !== 'warehouse_staff' && (
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Capacity (Workers)</label>
                  <input type="number" min="1" value={capacity} onChange={e => setCapacity(parseInt(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }} />
                </div>
              )}
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
              
              {targetRole !== 'warehouse_staff' && (
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }}>
                    <option value="unpublished">Unpublished (Hidden)</option>
                    <option value="published">Published (Bookable)</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
            </div>

            {targetRole === 'warehouse_staff' && (
              <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '12px' }}>Assign Staff (Required)</label>
                {!warehouseId ? (
                  <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Select a warehouse first to see available staff.</p>
                ) : availableWarehouseStaff.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#ef4444' }}>No active warehouse staff found for this location.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px' }}>
                    {availableWarehouseStaff.map(staff => {
                      const assignment = warehouseStaffAssignments.find(a => a.staffId === staff.id);
                      const isSelected = !!assignment;
                      return (
                      <div key={staff.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', padding: '8px', backgroundColor: isSelected ? '#e0f2fe' : '#fff', borderRadius: '6px', border: `1px solid ${isSelected ? '#7dd3fc' : '#e2e8f0'}` }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                setWarehouseStaffAssignments(prev => prev.filter(a => a.staffId !== staff.id));
                              } else {
                                setWarehouseStaffAssignments(prev => [...prev, { staffId: staff.id, duty: '' }]);
                              }
                            }}
                            style={{ width: '16px', height: '16px' }}
                          />
                          {staff.full_name}
                        </label>
                        {isSelected && (
                          <div style={{ paddingLeft: '24px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Duty:</label>
                            <select 
                              value={assignment.duty}
                              onChange={(e) => {
                                const newDuty = e.target.value;
                                setWarehouseStaffAssignments(prev => prev.map(a => a.staffId === staff.id ? { ...a, duty: newDuty } : a));
                              }}
                              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            >
                              <option value="" disabled>Select Duty</option>
                              <option value="putaway">Putter (Putaway)</option>
                              <option value="auditor">Auditor</option>
                              <option value="inward_damage">Inward + Damage/Expiry</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                )}
              </div>
            )}

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

            {targetRole === 'picker' && (
              <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Picker Pay Rate (₹ / item)</label>
                  <input 
                    type="number" 
                    min="0.01"
                    step="0.01"
                    value={pickerPayRate} 
                    onChange={e => setPickerPayRate(e.target.value ? Number(e.target.value) : '')} 
                    placeholder="e.g. 0.50"
                    style={{ width: '200px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }} 
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Picker Incentive</h3>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={pickerIncentiveEnabled} 
                      onChange={(e) => setPickerIncentiveEnabled(e.target.checked)} 
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span style={{ fontWeight: 'bold' }}>{pickerIncentiveEnabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>
                
                {pickerIncentiveEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {pickerMilestones.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic', margin: 0 }}>No milestones configured</p>
                    ) : (
                      pickerMilestones.map((m, index) => (
                        <div key={index} style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--bg-base)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                          <div style={{ fontWeight: 'bold', width: '90px' }}>Milestone {index + 1}</div>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Target Items</label>
                            <input 
                              type="number" 
                              value={m.target_items} 
                              onChange={(e) => handleUpdateMilestone(index, 'target_items', e.target.value)}
                              min="1"
                              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: '#fff' }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Reward Amount (₹)</label>
                            <input 
                              type="number" 
                              value={m.reward_amount} 
                              onChange={(e) => handleUpdateMilestone(index, 'reward_amount', e.target.value)}
                              min="0"
                              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: '#fff' }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                            <button type="button" onClick={() => handleMoveMilestone(index, 'up')} disabled={index === 0} style={{ padding: '8px', cursor: 'pointer', background: '#fff', border: '1px solid var(--border-light)', borderRadius: '6px' }}>↑</button>
                            <button type="button" onClick={() => handleMoveMilestone(index, 'down')} disabled={index === pickerMilestones.length - 1} style={{ padding: '8px', cursor: 'pointer', background: '#fff', border: '1px solid var(--border-light)', borderRadius: '6px' }}>↓</button>
                            <button type="button" onClick={() => handleRemoveMilestone(index)} style={{ padding: '8px', color: '#dc2626', cursor: 'pointer', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px' }}>✕</button>
                          </div>
                        </div>
                      ))
                    )}
                    
                    {pickerMilestones.length < 4 && (
                      <button 
                        type="button" 
                        onClick={handleAddMilestone}
                        style={{ padding: '10px', background: 'transparent', border: '1px dashed var(--primary)', borderRadius: '8px', cursor: 'pointer', color: 'var(--primary)', fontWeight: 'bold' }}
                      >
                        + Add milestone
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ alignSelf: 'flex-end', marginTop: '8px' }}>
              <button type="submit" style={{ padding: '8px 24px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                {targetRole === 'warehouse_staff' 
                  ? (editingId ? 'Update Assignment' : 'Create & Assign')
                  : (editingId ? 'Save Changes' : 'Create Slot')}
              </button>
            </div>
          </form>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['all', 'picker', 'driver', 'warehouse_staff'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none',
              background: activeTab === tab ? 'var(--primary)' : 'var(--bg-surface)',
              color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
              fontWeight: '600', cursor: 'pointer'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Loading slots...</p>
      ) : filteredSlots.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>No work slots found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredSlots.map(slot => (
            <div key={slot.id} className="glass-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: slot.target_role === 'picker' ? '#e0f2fe' : slot.target_role === 'driver' ? '#fef3c7' : '#e0e7ff', color: slot.target_role === 'picker' ? '#0369a1' : slot.target_role === 'driver' ? '#b45309' : '#4338ca', textTransform: 'uppercase' }}>
                      {slot.target_role.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Warehouse size={14} /> {slot.warehouse_name || 'Unknown Warehouse'}
                    </span>
                    
                    {slot.target_role !== 'warehouse_staff' && (
                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: slot.status === 'published' ? '#dcfce7' : slot.status === 'unpublished' ? '#f1f5f9' : '#fee2e2', color: slot.status === 'published' ? '#166534' : slot.status === 'unpublished' ? '#475569' : '#991b1b', textTransform: 'uppercase' }}>
                        {slot.status}
                      </span>
                    )}
                    {slot.target_role === 'warehouse_staff' && (
                       <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: '#dcfce7', color: '#166534', textTransform: 'uppercase' }}>
                         ASSIGNED
                       </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={16} color="var(--text-secondary)" />
                      <span style={{ fontWeight: '500' }}>{new Date(slot.start_time).toLocaleDateString()}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {new Date(slot.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(slot.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      <Users size={16} />
                      {slot.target_role === 'warehouse_staff' ? (
                        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                          Assigned Staff: {slot.booked_count}
                        </span>
                      ) : (
                        <span style={{ fontWeight: '600', color: slot.booked_count >= slot.capacity ? '#ef4444' : 'var(--text-primary)' }}>
                          Booked: {slot.booked_count} / {slot.capacity}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => toggleBookings(slot.id)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--primary)', background: expandedSlotId === slot.id ? 'var(--primary)' : 'transparent', color: expandedSlotId === slot.id ? '#fff' : 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem' }}>
                      {expandedSlotId === slot.id ? 'Hide Assignments' : 'View Assignments'}
                    </button>
                    {slot.status !== 'cancelled' && (
                      <>
                        <button onClick={() => handleEdit(slot)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
                          Edit
                        </button>
                        <button onClick={() => handleCancelSlot(slot.id)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem' }}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Bookings View */}
              {expandedSlotId === slot.id && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                    {slot.target_role === 'warehouse_staff' ? 'Assigned Staff Members' : 'Current Bookings'}
                  </h4>
                  {loadingBookings ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading...</p>
                  ) : slotBookings.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No active assignments for this slot.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {slotBookings.map(booking => {
                        let dutyLabel = '';
                        if (booking.current_duty) {
                          const cd = booking.current_duty;
                          if (cd === 'putaway') dutyLabel = 'Putter (Putaway)';
                          else if (cd === 'auditor') dutyLabel = 'Auditor';
                          else dutyLabel = 'Inward + Damage/Expiry'; // inward_damage, inward_receiver, damage_expiry, fnv
                        }
                        
                        return (
                        <div key={booking.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                          <div>
                            <p style={{ fontWeight: '600', fontSize: '0.9rem', margin: 0 }}>{booking.profiles?.full_name || 'Unknown Worker'}</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{booking.profiles?.phone || 'No phone'}</p>
                            {dutyLabel && <p style={{ fontSize: '0.8rem', color: '#10b981', margin: '4px 0 0 0', fontWeight: 'bold' }}>{dutyLabel}</p>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', 
                              backgroundColor: booking.status === 'active' ? '#dcfce7' : booking.status === 'completed' ? '#f3f4f6' : '#e0f2fe',
                              color: booking.status === 'active' ? '#166534' : booking.status === 'completed' ? '#4b5563' : '#0369a1'
                            }}>
                              {booking.status}
                            </span>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
