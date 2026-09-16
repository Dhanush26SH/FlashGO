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


export const DriverApprovals: React.FC = () => {
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

  // Removed RBAC Simulator state as it was moved to PlatformSettings

  const [activeTab, setActiveTab] = useState<'directory' | 'shifts'>('directory');
  const [selectedProfile, setSelectedProfile] = useState<ExtendedProfile | null>(null);

  // Form states
  const [newShiftStaffId, setNewShiftStaffId] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('');
  const [newShiftEnd, setNewShiftEnd] = useState('');
  
  // Edit Shift State
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Get active staff and filter by search query
  const staffMembers = profiles
    .filter(p => p.role !== 'customer')
    .filter(p => (p.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()));

  const [pendingWarehouseAssignments, setPendingWarehouseAssignments] = useState<Record<string, string>>({});
  const [pendingRoleAssignments, setPendingRoleAssignments] = useState<Record<string, string>>({});

  // Get pending staff
  const pendingStaff = profiles
    .filter(p => (p as any).is_pending_staff === true);

    const handleApproveStaff = async (staffId: string, name: string) => {
    try {
      // FIX: Use requested_role as fallback, NOT current role (which is usually 'customer')
      const targetStaff = pendingStaff.find(p => p.id === staffId);
      const selectedRole = pendingRoleAssignments[staffId] || (targetStaff as any)?.requested_role || 'picker';
      const selectedWarehouseId = pendingWarehouseAssignments[staffId];

      console.log("[DEV] STAFF_APPROVAL_REQUEST", {
        staffId,
        selectedRole,
        selectedWarehouseId,
        name
      });

      if (!selectedWarehouseId) {
        addToast('Please assign a warehouse before approving', 'error');
        return;
      }

      const cleanName = name;
      
      if (supabase) {
        console.log("[DEV] STAFF_APPROVAL_PAYLOAD", { p_user_id: staffId, p_role: selectedRole, p_clean_name: cleanName, p_warehouse_id: selectedWarehouseId });
        await UsersService.approveStaffRole(staffId, selectedRole, cleanName, selectedWarehouseId);
        console.log("[DEV] STAFF_APPROVAL_RESULT: Success");
        loadData(); // Re-fetch to get the server-generated employee_id
      }
      
      addToast(`Approved ${cleanName}`, 'success');
    } catch (err: any) {
      console.error("[DEV] STAFF_APPROVAL_ERROR", err);
      // Show backend error message directly so it's not swallowed by generic toast
      addToast(`Failed to approve: ${err.message || 'Unknown error'}`, 'error');
    }
  };

  const handleRejectStaff = async (staffId: string) => {
    try {
      if (supabase) {
        await UsersService.rejectStaffAccess(staffId);
      }
      setProfiles(prev => prev.map(p => p.id === staffId ? { ...p, is_pending_staff: false, requested_role: null } as any : p));
      addToast('Rejected staff request', 'info');
    } catch (err) {
      console.error("Failed to reject staff:", err);
      addToast('Failed to reject staff member', 'error');
    }
  };

  const toggleSuspension = async (staffId: string, name: string, isSuspended: boolean) => {
    try {
      if (isSuspended) {
        await UsersService.unsuspendProfile(staffId);
        addToast(`Access privileges restored for ${name}`, 'success');
      } else {
        await UsersService.suspendProfile(staffId, 'Suspended by admin');
        addToast(`Staff member ${name} suspended from system`, 'warning');
      }
      loadData();
    } catch (e: any) {
      addToast('Failed to change suspension status: ' + e.message, 'error');
    }
  };

  return (
    <div className="container">
      {/* Header Banner */}
      <div className=" ">
        <div>
          <h2 className="title">Driver Approvals</h2>
          <p className="subtitle">Review and approve pending driver and staff registration requests</p>
        </div>
        <Users size={36} color="var(--primary)" />
      </div>

      {/* Roster & Stats Grid */}
      <div>
        
        {/* Left Hand: Staff List & suspension controls */}
        <div className=" ">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <h3 className="panel-title">Active Logistics & Fulfillment Staff</h3>
              <p className="panel-desc">Oversee system access, suspend bad actors, and monitor individual productivity</p>
            </div>
            
            <div style={{ position: 'relative', width: '300px' }}>
              <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Search staff by name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
          </div>

          {pendingStaff.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ color: 'var(--warning)', fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} /> Pending Approvals ({pendingStaff.length})
              </h4>
              <div className="staff-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pendingStaff.map(staff => {
                  const reqRole = ((staff as any).requested_role || 'UNKNOWN').toUpperCase();
                  const displayName = staff.full_name || 'No Name';
                  
                  const activeSelectedRole = pendingRoleAssignments[staff.id] || (staff as any).requested_role || 'picker';

                  return (
                    <div key={staff.id} style={{ ...staffItemStyle, border: '1px solid var(--warning)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div className="staff-avatar-wrapper">
                            <div style={staffAvatarStyle('customer')}>{(displayName || '?').charAt(0)}</div>
                          </div>
                          <h4 className="staff-name" style={{ margin: 0, minWidth: '160px' }}>{displayName}</h4>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--warning)', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(234, 179, 8, 0.1)' }}>
                            REQUESTED: {reqRole.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', backgroundColor: 'var(--bg-base)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 'bold' }}>Assign Role</label>
                          <select 
                            value={activeSelectedRole}
                            onChange={(e) => setPendingRoleAssignments({...pendingRoleAssignments, [staff.id]: e.target.value})}
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                          >
                            <option value="picker">Warehouse Picker</option>
                            <option value="driver">Delivery Rider</option>
                            <option value="warehouse_staff">Warehouse Staff</option>
                          </select>
                        </div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 'bold' }}>Assign Warehouse (Required)</label>
                          <select 
                            value={pendingWarehouseAssignments[staff.id] || ''}
                            onChange={(e) => setPendingWarehouseAssignments({...pendingWarehouseAssignments, [staff.id]: e.target.value})}
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                          >
                            <option value="">-- Select Warehouse --</option>
                            {warehouses.map(w => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                          <button onClick={() => handleApproveStaff(staff.id, staff.full_name)} style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', height: '35px' }}>Approve</button>
                          <button onClick={() => handleRejectStaff(staff.id)} style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', height: '35px' }}>Reject</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="staff-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {staffMembers.map(staff => {
              const isSuspended = (staff as any).is_suspended;
              
              return (
                <div key={staff.id} style={{ ...staffItemStyle, cursor: 'pointer', border: isSuspended ? '1px dashed var(--danger)' : '1px solid var(--border-light)' }} onClick={() => setSelectedProfile(staff)}>
                  <div className="staff-avatar-wrapper">
                    <div style={staffAvatarStyle(staff.role)}>{(staff.full_name || '?').charAt(0)}</div>
                    {isSuspended && <div className="suspended-dot" />}
                  </div>

                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <h4 className="staff-name" style={{ margin: 0, minWidth: '160px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {staff.full_name}
                        {staff.employee_id && (
                          <span style={{ fontSize: '0.65rem', padding: '2px 6px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-light)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                            {staff.employee_id}
                          </span>
                        )}
                      </h4>
                      <span style={roleBadgeStyle(staff.role)}>{(staff.role || '').replace('_', ' ').toUpperCase()}</span>
                      
                      {/* Gig Worker vs Warehouse Status Indicator */}
                      {(staff.role === 'picker' || staff.role === 'driver') ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 800, color: staff.is_online ? '#10b981' : 'var(--text-secondary)', minWidth: '70px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: staff.is_online ? '#10b981' : 'var(--text-secondary)' }} />
                          {staff.is_online ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--info)', minWidth: '70px' }}>DAY SHIFT</span>
                      )}
                    </div>
                    
                    </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleSuspension(staff.id, staff.full_name, (staff as any).is_suspended); }}
                    style={suspendBtnStyle(isSuspended)}
                  >
                    {isSuspended ? (
                      <><UserCheck size={14} /> Restore</>
                    ) : (
                      <><UserX size={14} /> Suspend</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>




      {/* Staff Profile Modal Overlay */}
      {selectedProfile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '500px', backgroundColor: 'var(--bg-base)', padding: '24px', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ ...staffAvatarStyle(selectedProfile.role), width: '64px', height: '64px', fontSize: '2rem' }}>
                  {(selectedProfile.full_name || '?').charAt(0)}
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {selectedProfile.full_name}
                    {selectedProfile.employee_id && (
                      <span style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {selectedProfile.employee_id}
                      </span>
                    )}
                  </h2>
                  <span style={{ ...roleBadgeStyle(selectedProfile.role), display: 'inline-block', marginTop: '6px' }}>{(selectedProfile.role || '').replace('_', ' ').toUpperCase()}</span>
                </div>
              </div>
              <button onClick={() => setSelectedProfile(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>EMAIL</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selectedProfile.email}</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>PHONE</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selectedProfile.phone}</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>WALLET BALANCE</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>₹{(selectedProfile.wallet_balance ?? 0).toFixed(2)}</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>JOINED DATE</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{new Date(selectedProfile.created_at).toLocaleDateString()}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginBottom: '16px' }}>
               <h4 style={{ fontSize: '0.85rem', marginBottom: '12px' }}>Warehouse Assignment</h4>
               <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                 <select
                   value={selectedProfile.warehouse_id || ''}
                   onChange={async (e) => {
                     const wid = e.target.value;
                     if (!wid) return;
                     try {
                       if (supabase) {
                         await UsersService.updateStaffWarehouse(selectedProfile.id, wid);
                       }
                       setSelectedProfile({ ...selectedProfile, warehouse_id: wid });
                       setProfiles(prev => prev.map(p => p.id === selectedProfile.id ? { ...p, warehouse_id: wid } as any : p));
                       addToast('Warehouse assigned successfully', 'success');
                     } catch (err: any) {
                       addToast('Failed to assign warehouse: ' + err.message, 'error');
                     }
                   }}
                   className="dropdown"
                   style={{ flex: 1 }}
                 >
                   <option value="">No Warehouse Assigned</option>
                   {warehouses.map(w => (
                     <option key={w.id} value={w.id}>{w.name}</option>
                   ))}
                 </select>
               </div>
            </div>


          </div>
        </div>
      )}



    </div>
  );
};

// --- STYLING SPECIFICATIONS ---




























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








