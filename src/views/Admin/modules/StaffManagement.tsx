const bannerItemStyle: any = {}; const addBannerBtnStyle: any = {}; const tableContainerStyle: any = {}; const panelHeaderStyle: any = {}; const formGroupStyle: any = {}; const btnSubmitStyle: any = {}; const staffItemStyle: any = {}; const panelCardStyle: any = {}; const custCardStyle: any = {}; const emptyStateStyle: any = {};
import React, { useState, useEffect } from 'react';
import './StaffManagement.css';
import { useApp } from '../../../context/AppContext';
import { 
  Users, 
  ShieldCheck, 
  UserX, 
  UserCheck, 
  Calendar, 
  Plus, 
  Star, 
  CheckCircle2, 
  AlertCircle,
  Search
} from 'lucide-react';
import { FlashGoDB, supabase } from '../../../services/db';
import type { StaffShift } from '../../../services/api/StaffService';
import { StaffService } from '../../../services/api/StaffService';
import { UsersService } from '../../../services/api/UsersService';
import type { Profile } from '../../../services/db';
// Extend Profile locally to include employee_id
export interface ExtendedProfile extends Profile {
  employee_id?: string;
}
import { FinanceService } from '../../../services/api/FinanceService';
import { DataTable } from '../../../components/Admin/DataTable';


export const StaffManagement: React.FC = () => {
  const { addToast } = useApp();

  // Load shifts and profiles from DB
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [profiles, setProfiles] = useState<ExtendedProfile[]>([]);
  const [suspendedIds, setSuspendedIds] = useState<string[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    loadWarehouses();

    if (!supabase) return;
    
    const profilesSub = supabase.channel('staff_profiles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadData();
      })
      .subscribe();
      
    const shiftsSub = supabase.channel('staff_shifts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_shifts' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      profilesSub.unsubscribe();
      shiftsSub.unsubscribe();
    };
  }, []);

  const loadWarehouses = async () => {
    try {
      if (supabase) {
        const { data } = await supabase.from('warehouses').select('*');
        if (data) setWarehouses(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadData = async () => {
    setLoadingProfiles(true);
    try {
      const profs = await UsersService.getProfiles();
      setProfiles(profs as any);
      
      const realShifts = await StaffService.getShifts();
      setShifts(realShifts);
    } catch (e) {
      console.error('Failed to load real data', e);
      // Fallback
      setProfiles(FlashGoDB.getProfiles() as any);
      setShifts(FlashGoDB.getStaffShifts() as any);
    } finally {
      setLoadingProfiles(false);
    }
  };

  // Form states
  const [newShiftStaffId, setNewShiftStaffId] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('');
  const [newShiftEnd, setNewShiftEnd] = useState('');
  
  // Edit Shift State
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editShiftStaffId, setEditShiftStaffId] = useState('');
  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftEnd, setEditShiftEnd] = useState('');

  // Get active staff for shift assignments dropdown
  const staffMembers = profiles
    .filter(p => p.role !== 'customer');

  // Add shift
  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftStaffId || !newShiftStart || !newShiftEnd) {
      addToast('Please fill all shift details', 'error');
      return;
    }

    const startDt = new Date(newShiftStart);
    const endDt = new Date(newShiftEnd);

    if (endDt <= startDt) {
      addToast('End time must be after start time', 'error');
      return;
    }

    const staff = profiles.find(p => p.id === newShiftStaffId);

    const newShift: Omit<StaffShift, 'id' | 'staff_name' | 'status'> = {
      staff_id: newShiftStaffId,
      warehouse_id: staff?.warehouse_id || undefined,
      shift_start: startDt.toISOString(),
      shift_end: endDt.toISOString()
    };

    try {
      await StaffService.createShift(newShift);
      addToast('Shift scheduled successfully', 'success');
      loadData();
    } catch (err) {
      console.error(err);
      addToast('Failed to schedule shift', 'error');
    }
  };

  const handleUpdateShiftDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShiftId || !editShiftStaffId || !editShiftStart || !editShiftEnd) return;
    
    const startDt = new Date(editShiftStart);
    const endDt = new Date(editShiftEnd);
    if (endDt <= startDt) {
      addToast('End time must be after start time', 'error');
      return;
    }

    try {
      await StaffService.updateShiftDetails(editingShiftId, editShiftStaffId, startDt.toISOString(), endDt.toISOString());
      addToast('Shift updated successfully', 'success');
      setEditingShiftId(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      addToast(err.message || 'Failed to update shift', 'error');
    }
  };

  // Update attendance
  const handleUpdateAttendance = async (shiftId: string, status: 'present' | 'absent' | 'cancelled') => {
    try {
      await StaffService.updateShiftStatus(shiftId, status);
      addToast(`Shift attendance marked as ${status}`, 'success');
      loadData();
    } catch (e: any) {
      addToast('Failed to update attendance', 'error');
    }
  };

  return (
    <div className="container">
      {/* Header Banner */}
      <div className=" ">
        <div>
          <h2 className="title">Shifts & Attendance</h2>
          <p className="subtitle">Schedule shifts, view attendance registers, and monitor workforce metrics</p>
        </div>
        <Calendar size={36} color="var(--primary)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginTop: '16px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={24} color="var(--primary)" />
              <h3 className="panel-title" style={{ fontSize: '1.2rem' }}>Shift Planner & Scheduler</h3>
            </div>
          </div>
          <p className="panel-desc">Provision shifts for all warehouse staff, pickers, and drivers.</p>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <form onSubmit={handleCreateShift} className="shift-form" style={{ flex: 2, minWidth: '300px' }}>
              <div style={{ flex: 1 }}>
                <label className="input-label">STAFF OPERATOR</label>
                <select 
                  value={newShiftStaffId} 
                  onChange={(e) => setNewShiftStaffId(e.target.value)} 
                  className="dropdown"
                >
                  <option value="">Select Staff...</option>
                  {staffMembers.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.full_name} ({staff.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label className="input-label">START</label>
                  <input 
                    type="datetime-local" 
                    value={newShiftStart} 
                    onChange={(e) => setNewShiftStart(e.target.value)} 
                    className="dropdown"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="input-label">END</label>
                  <input 
                    type="datetime-local" 
                    value={newShiftEnd} 
                    onChange={(e) => setNewShiftEnd(e.target.value)} 
                    className="dropdown"
                  />
                </div>
              </div>

              <button type="submit" className="schedule-btn">
                <Plus size={16} /> Schedule
              </button>
            </form>
          </div>

          <div className="divider" style={{ margin: '32px 0' }} />

          <div className="shift-list-container">
            <h4 className="sub-header-title">WORKFORCE SHIFT ATTENDANCE REGISTER</h4>
            {shifts.length === 0 ? (
              <div className="empty-state">No shifts scheduled for today</div>
            ) : (
              shifts.map(shift => {
                const sRole = staffMembers.find(p => p.id === shift.staff_id)?.role || 'staff';
                return (
                  <div key={shift.id} className="shift-item" style={{ padding: '16px', backgroundColor: 'var(--bg-surface)' }}>
                    <div style={{ flex: 1 }}>
                      <div className="shift-name" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {shift.staff_name}
                        {shift.work_slot_id && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 6px', backgroundColor: 'var(--primary)', color: '#fff', borderRadius: '4px', fontWeight: 'bold' }}>
                            SELF-BOOKED
                          </span>
                        )}
                      </div>
                      <div className="shift-meta">
                        {new Date(shift.shift_start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(shift.shift_end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} | <span style={{ textTransform: 'capitalize' }}>{sRole.replace('_', ' ')}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {!shift.work_slot_id && (
                        <button 
                          type="button" 
                          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem' }}
                          onClick={() => {
                            setEditingShiftId(shift.id);
                            setEditShiftStaffId(shift.staff_id);
                            
                            const toLocalDT = (isoStr: string) => {
                              const d = new Date(isoStr);
                              return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0,16);
                            };
                            setEditShiftStart(toLocalDT(shift.shift_start));
                            setEditShiftEnd(toLocalDT(shift.shift_end));
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <select 
                        value={shift.status}
                        onChange={(e) => handleUpdateAttendance(shift.id, e.target.value as any)}
                        style={attendanceSelectStyle(shift.status)}
                      >
                        <option value="scheduled">⏳ PENDING</option>
                        <option value="present">✓ PRESENT</option>
                        <option value="absent">✗ ABSENT</option>
                        <option value="cancelled">🚫 CANCELLED</option>
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Edit Shift Modal Overlay */}
      {editingShiftId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '500px', backgroundColor: 'var(--bg-base)', padding: '24px', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={20} color="var(--primary)" /> Edit Shift Details
              </h3>
              <button onClick={() => setEditingShiftId(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
            </div>
            
            <form onSubmit={handleUpdateShiftDetails} className="shift-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="input-label" style={{ display: 'block', marginBottom: '4px' }}>STAFF OPERATOR</label>
                <select 
                  value={editShiftStaffId} 
                  onChange={(e) => setEditShiftStaffId(e.target.value)} 
                  className="dropdown"
                  style={{ width: '100%' }}
                >
                  <option value="">Select Staff...</option>
                  {staffMembers.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.full_name} ({staff.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: '4px' }}>START</label>
                  <input 
                    type="datetime-local" 
                    value={editShiftStart} 
                    onChange={(e) => setEditShiftStart(e.target.value)} 
                    className="dropdown"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: '4px' }}>END</label>
                  <input 
                    type="datetime-local" 
                    value={editShiftEnd} 
                    onChange={(e) => setEditShiftEnd(e.target.value)} 
                    className="dropdown"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setEditingShiftId(null)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};




























const staffAvatarStyle = (role: string): React.CSSProperties => {
  let bg = 'rgba(59, 130, 246, 0.15)';
  let color = 'var(--info)';
  if (role === 'picker') {
    bg = 'var(--primary-glow)';
    color = 'var(--primary)';
  } else if (role === 'warehouse_staff') {
    bg = 'rgba(16, 185, 129, 0.15)';
    color = '#10b981';
  }

  return {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    backgroundColor: bg,
    color: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.1rem',
    fontWeight: 900
  };
};





const roleBadgeStyle = (role: string): React.CSSProperties => {
  let color = 'var(--info)';
  let bg = 'rgba(59, 130, 246, 0.15)';
  if (role === 'picker') {
    color = 'var(--primary)';
    bg = 'var(--primary-glow)';
  } else if (role === 'warehouse_staff') {
    color = '#10b981';
    bg = 'rgba(16, 185, 129, 0.15)';
  }

  return {
    fontSize: '0.58rem',
    fontWeight: 800,
    padding: '2px 6px',
    borderRadius: '4px',
    color: color,
    backgroundColor: bg,
    letterSpacing: '0.04em'
  };
};







const suspendBtnStyle = (suspended: boolean): React.CSSProperties => ({
  fontSize: '0.65rem',
  fontWeight: 800,
  padding: '6px 12px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: suspended ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
  color: suspended ? '#10b981' : 'var(--danger)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s'
});





















const attendanceSelectStyle = (status: string): React.CSSProperties => {
  let bg = 'rgba(245, 158, 11, 0.15)';
  let color = '#f59e0b';
  if (status === 'present') {
    bg = 'rgba(16, 185, 129, 0.15)';
    color = '#10b981';
  } else if (status === 'absent') {
    bg = 'rgba(239, 68, 68, 0.15)';
    color = 'var(--danger)';
  }

  return {
    padding: '4px 8px',
    borderRadius: '6px',
    backgroundColor: bg,
    color: color,
    border: 'none',
    fontSize: '0.65rem',
    fontWeight: 800,
    cursor: 'pointer',
    outline: 'none'
  };
};



const rbacRoleBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 4px',
  fontSize: '0.62rem',
  fontWeight: 800,
  borderRadius: '6px',
  cursor: 'pointer',
  border: active ? '1px solid var(--info)' : '1px solid var(--border-light)',
  backgroundColor: active ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-base)',
  color: active ? 'var(--info)' : 'var(--text-secondary)',
  transition: 'all 0.15s'
});








