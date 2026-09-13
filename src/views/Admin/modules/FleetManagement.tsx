import React, { useState, useMemo, useEffect } from 'react';
import { Truck, Search, Filter, Wrench, ShieldCheck, MapPin, X, Plus } from 'lucide-react';
import { DataTable } from '../../../components/Admin/DataTable';
import { useApp } from '../../../context/AppContext';
import { FleetService, type Vehicle, type DriverCompliance } from '../../../services/api/FleetService';
import { supabase } from '../../../services/api/supabaseClient';

export const FleetManagement: React.FC = () => {
  const { addToast, logisticsTrips, profiles, darkStores } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [complianceRecords, setComplianceRecords] = useState<DriverCompliance[]>([]);
  
  const [maintenanceModalData, setMaintenanceModalData] = useState<any | null>(null);
  const [complianceEditMode, setComplianceEditMode] = useState(false);
  const [editBgStatus, setEditBgStatus] = useState<'pending' | 'cleared' | 'failed'>('pending');
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ license_plate: '', vehicle_type: 'Electric Bike', warehouse_id: '', status: 'active' });

  const fetchFleetData = async () => {
    try {
      const v = await FleetService.getVehicles();
      const c = await FleetService.getDriverComplianceRecords();
      setFleet(v);
      setComplianceRecords(c);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, []);

  const handleAddVehicle = async () => {
    try {
      if (!newVehicle.license_plate || !newVehicle.warehouse_id) {
        addToast('Please fill all fields', 'warning');
        return;
      }
      await FleetService.addVehicle(newVehicle as any);
      addToast('Vehicle added', 'success');
      setIsAddVehicleOpen(false);
      setNewVehicle({ license_plate: '', vehicle_type: 'Electric Bike', warehouse_id: '', status: 'active' });
      fetchFleetData();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const enrichedFleet = useMemo(() => {
    return fleet.map(v => {
      let assignedDriver = profiles.find((p: any) => p.current_vehicle_id === v.id);
      
      if (!assignedDriver && v.ownership_type === 'driver_owned' && v.owner_driver_id) {
         assignedDriver = profiles.find((p: any) => p.id === v.owner_driver_id);
      }

      let compliance = 'N/A';
      if (assignedDriver) {
        const comp = complianceRecords.find(c => c.driver_id === assignedDriver?.id);
        if (comp && comp.bg_check_status === 'cleared') {
          compliance = 'Verified';
        } else {
          compliance = 'Pending';
        }
      }

      const activeTrip = assignedDriver ? logisticsTrips.find((t: any) => t.driver_id === assignedDriver.id && t.status === 'in_transit') : null;

      return {
        ...v,
        driverName: assignedDriver ? assignedDriver.full_name : 'Unassigned',
        driverId: assignedDriver ? assignedDriver.id : null,
        activeStatus: v.status === 'pending' ? 'Pending' : (assignedDriver ? (assignedDriver.is_online ? (activeTrip ? 'On Route' : 'Available') : 'Offline') : (v.status === 'active' ? 'Idle' : v.status)),
        compliance,
        assignedDriver
      };
    });
  }, [fleet, profiles, logisticsTrips, complianceRecords]);

  const filteredFleet = useMemo(() => {
    return enrichedFleet.filter(v => 
      v.license_plate.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (v.driverName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.vehicle_type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [enrichedFleet, searchQuery]);

  const totalVehicles = fleet.length;
  const activeVehicles = enrichedFleet.filter(v => v.activeStatus === 'Active').length;
  const pendingVerification = enrichedFleet.filter(v => v.status === 'pending').length;

  return (
    <div className="admin-module">
      <header className="module-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-end', 
        marginBottom: '32px',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>Fleet Management</h2>
          <p style={{ color: 'var(--text-secondary, #64748b)', margin: 0, fontSize: '0.95rem' }}>Monitor active drivers, live tracking, and compliance documents.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            backgroundColor: 'var(--bg-surface, #ffffff)', 
            border: '1px solid var(--border-light, #e2e8f0)', 
            borderRadius: '12px', 
            padding: '10px 16px',
            gap: '10px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
            width: '340px',
            transition: 'all 0.2s ease'
          }}>
            <Search size={18} color="var(--text-muted, #94a3b8)" />
            <input 
              type="text" 
              placeholder="Search vehicle or driver..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                width: '100%',
                fontSize: '0.95rem',
                color: 'var(--text-primary, #0f172a)'
              }}
            />
          </div>
          <button style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: 'var(--primary, #10b981)',
            border: 'none',
            borderRadius: '12px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 600,
            boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
            transition: 'all 0.2s ease'
          }}
          onClick={() => setIsAddVehicleOpen(true)}
          >
            <Plus size={18} /> Add Vehicle
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Total Vehicles</p>
          <h2 style={{ fontSize: '2rem', margin: 0 }}>{totalVehicles}</h2>
        </div>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>On Route</p>
          <h2 style={{ fontSize: '2rem', margin: 0, color: 'var(--primary)' }}>{enrichedFleet.filter(v => v.activeStatus === 'On Route').length}</h2>
        </div>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Pending Verification</p>
          <h2 style={{ fontSize: '2rem', margin: 0, color: 'var(--warning)' }}>{pendingVerification}</h2>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '16px' }}>
        <DataTable
          data={filteredFleet}
          keyExtractor={v => v.id}
          columns={[
            { key: 'id', header: 'VEHICLE ID', sortable: true, render: r => <strong style={{ fontFamily: 'monospace' }}>{r.license_plate}</strong> },
            { key: 'type', header: 'TYPE', sortable: true, render: r => <span>{r.vehicle_type}</span> },
            { key: 'ownership', header: 'OWNERSHIP', sortable: true, render: r => <span>{r.ownership_type === 'driver_owned' ? 'Personal' : 'Company'}</span> },
            { key: 'driver', header: 'DRIVER', sortable: true, render: r => <span>{r.driverName}</span> },
            { key: 'status', header: 'STATUS', render: r => <span className={`admin-badge-${r.activeStatus === 'On Route' ? 'success' : r.activeStatus === 'Available' ? 'primary' : r.activeStatus === 'Offline' ? 'danger' : 'info'}`}>{r.activeStatus}</span> },
            { key: 'compliance', header: 'COMPLIANCE', sortable: true, render: r => <span style={{ color: r.compliance === 'Verified' ? 'var(--primary)' : 'var(--warning)' }}>{r.compliance}</span> },
            { key: 'actions', header: 'ACTIONS', render: (r) => (
              <div style={{ display: 'flex', gap: '8px' }}>
                {r.ownership_type === 'driver_owned' ? (
                  r.status === 'pending' ? (
                    <button 
                      type="button"
                      style={{ padding: '4px 8px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      onClick={async (e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (confirm(`Approve personal vehicle ${r.license_plate} for ${r.driverName}?`)) {
                          try {
                            await FleetService.approveDriverVehicle(r.driverId as string, r.id);
                            addToast('Personal vehicle approved', 'success');
                            fetchFleetData();
                          } catch (e: any) {
                            addToast(e.message, 'error');
                          }
                        }
                      }}
                    >
                      Approve
                    </button>
                  ) : null
                ) : (
                  <button 
                    type="button"
                    style={{ padding: '4px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                    onClick={async (e) => {
                      e.preventDefault(); e.stopPropagation();
                      const newDriverId = prompt('Enter Driver ID to assign (or leave blank to unassign):', r.driverId || '');
                      if (newDriverId !== null) {
                        try {
                          await FleetService.assignVehicle(newDriverId || '00000000-0000-0000-0000-000000000000', newDriverId ? r.id : null);
                          addToast('Vehicle assigned successfully', 'success');
                          fetchFleetData();
                        } catch (e: any) {
                          addToast(e.message, 'error');
                        }
                      }
                    }}
                  >
                    {r.driverId ? 'Reassign' : 'Assign'}
                  </button>
                )}

                <button 
                  type="button"
                  style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }} 
                  title="Compliance & Documents"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMaintenanceModalData(r);
                  }}
                >
                  <ShieldCheck size={16} />
                </button>
              </div>
            )}
          ]}
          exportFilename="fleet_roster"
        />
      </div>


      {/* Compliance Log Modal */}
      {maintenanceModalData && (() => {
        const comp = complianceRecords.find(c => c.driver_id === maintenanceModalData.driverId) || {
          bg_check_status: 'pending' as const,
          dl_number: ''
        };
        const bgColor = (s: string) => s === 'cleared' ? '#10b981' : s === 'failed' ? '#ef4444' : '#f59e0b';
        const bgLabel = (s: string) => s === 'cleared' ? 'Cleared' : s === 'failed' ? 'Failed' : 'Pending';

        const BG_OPTIONS: Array<'pending' | 'cleared' | 'failed'> = ['pending', 'cleared', 'failed'];

        const closeModal = () => {
          setMaintenanceModalData(null);
          setComplianceEditMode(false);
          setEditBgStatus('pending');
        };

        return (
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
            onClick={closeModal}
          >
            <div
              style={{ width: '90%', maxWidth: '600px', backgroundColor: 'var(--bg-surface)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-light)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldCheck color="var(--primary)" size={20} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Compliance &amp; Documents</h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{maintenanceModalData.driverName}</p>
                  </div>
                </div>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} onClick={closeModal}>
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '24px' }}>

                {/* Read-only summary row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ padding: '14px 16px', backgroundColor: 'var(--bg-base)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Vehicle Type</div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{maintenanceModalData.vehicle_type || 'Personal Vehicle'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{maintenanceModalData.license_plate}</div>
                  </div>
                  <div style={{ padding: '14px 16px', backgroundColor: 'var(--bg-base)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Background Check</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: bgColor(complianceEditMode ? editBgStatus : comp.bg_check_status), display: 'inline-block' }} />
                      <span style={{ fontWeight: 700, color: bgColor(complianceEditMode ? editBgStatus : comp.bg_check_status), fontSize: '0.95rem' }}>
                        {bgLabel(complianceEditMode ? editBgStatus : comp.bg_check_status)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* DL Number row */}
                <div style={{ marginBottom: '24px', padding: '14px 16px', backgroundColor: 'var(--bg-base)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>Driving Licence Number</div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{comp.dl_number || '—'}</div>
                </div>

                {/* Edit Mode: BG Check Segmented Control */}
                {complianceEditMode && (
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      Background Check Status
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      {BG_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setEditBgStatus(opt)}
                          style={{
                            padding: '12px 8px',
                            borderRadius: '10px',
                            border: `2px solid ${editBgStatus === opt ? bgColor(opt) : 'var(--border-light)'}`,
                            backgroundColor: editBgStatus === opt ? `${bgColor(opt)}15` : 'var(--bg-base)',
                            color: editBgStatus === opt ? bgColor(opt) : 'var(--text-secondary)',
                            fontWeight: editBgStatus === opt ? 700 : 500,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            textTransform: 'capitalize'
                          }}
                        >
                          {bgLabel(opt)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                {!complianceEditMode ? (
                  <>
                    <button
                      type="button"
                      style={{ padding: '9px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}
                      onClick={() => { setEditBgStatus(comp.bg_check_status as any); setComplianceEditMode(true); }}
                    >
                      Edit Records
                    </button>
                    <button className="primary-btn" style={{ padding: '9px 24px' }} onClick={closeModal}>Close</button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      style={{ padding: '9px 20px', background: 'none', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}
                      disabled={complianceSaving}
                      onClick={() => { setComplianceEditMode(false); setEditBgStatus('pending'); }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      style={{
                        padding: '9px 24px',
                        opacity: (editBgStatus === comp.bg_check_status || complianceSaving) ? 0.5 : 1,
                        cursor: (editBgStatus === comp.bg_check_status || complianceSaving) ? 'not-allowed' : 'pointer',
                        minWidth: '120px'
                      }}
                      disabled={editBgStatus === comp.bg_check_status || complianceSaving}
                      onClick={async () => {
                        if (editBgStatus === comp.bg_check_status || complianceSaving) return;
                        setComplianceSaving(true);
                        try {
                          await FleetService.upsertDriverCompliance({
                            driver_id: maintenanceModalData.driverId,
                            bg_check_status: editBgStatus
                          });
                          addToast(`Background check marked as ${bgLabel(editBgStatus)}`, 'success');
                          await fetchFleetData();
                          setComplianceEditMode(false);
                        } catch (e: any) {
                          addToast(e.message || 'Failed to update compliance', 'error');
                        } finally {
                          setComplianceSaving(false);
                        }
                      }}
                    >
                      {complianceSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Vehicle Modal */}
      {isAddVehicleOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90%', maxWidth: '400px', backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px' }}>
            <h3 style={{ marginBottom: '16px' }}>Add New Vehicle</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>License Plate</label>
              <input type="text" value={newVehicle.license_plate} onChange={e => setNewVehicle({...newVehicle, license_plate: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }} />
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Type</label>
              <input type="text" value={newVehicle.vehicle_type} onChange={e => setNewVehicle({...newVehicle, vehicle_type: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Warehouse</label>
              <select value={newVehicle.warehouse_id} onChange={e => setNewVehicle({...newVehicle, warehouse_id: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
                <option value="">Select Warehouse...</option>
                {darkStores.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button style={{ padding: '8px 16px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => setIsAddVehicleOpen(false)}>Cancel</button>
              <button className="primary-btn" onClick={handleAddVehicle}>Save Vehicle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
