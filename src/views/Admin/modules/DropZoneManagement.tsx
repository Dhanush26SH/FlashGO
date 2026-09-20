import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { 
  Package,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { AdminService } from '../../../services/api/AdminService';
import { supabase } from '../../../services/api/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';

export interface DropZoneAllocation {
  id: string;
  order_id: string;
  trip_id: string;
  warehouse_id: string;
  drop_zone_id: string;
  picker_id: string;
  status: 'allocated' | 'placed' | 'driver_assigned' | 'picked_up' | 'voided';
  placed_at?: string;
  driver_id?: string;
  driver_assigned_at?: string;
  picked_up_at?: string;
  created_at: string;
  orders?: { id: string; order_number: string } | null;
  picker?: { full_name: string; employee_id: string } | null;
  driver?: { full_name: string; employee_id: string } | null;
}

export const DropZoneManagement: React.FC = () => {
  const { addToast } = useApp();

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  
  const [dropZones, setDropZones] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Record<string, DropZoneAllocation>>({});
  
  const [newZoneCode, setNewZoneCode] = useState('');
  const [selectedDropZoneForQr, setSelectedDropZoneForQr] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allocationsError, setAllocationsError] = useState<string | null>(null);

  const fetchWarehouses = async () => {
    try {
      const data = await AdminService.getWarehouses();
      setWarehouses(data);
      if (data.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(data[0].id);
      }
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const fetchDropZonesData = async (warehouseId: string) => {
    try {
      setIsLoading(true);
      setAllocationsError(null);
      
      const { data: dzData, error: dzErr } = await supabase
        .from('drop_zones')
        .select('*')
        .eq('warehouse_id', warehouseId)
        .order('zone_code', { ascending: true });
      
      if (dzErr) throw dzErr;
      setDropZones(dzData || []);

      const { data: allocData, error: allocErr } = await supabase
        .from('drop_zone_allocations')
        .select(`
          *,
          orders(id, order_number),
          picker:profiles!picker_id(full_name, employee_id),
          driver:profiles!driver_id(full_name, employee_id)
        `)
        .eq('warehouse_id', warehouseId)
        .in('status', ['allocated', 'placed', 'driver_assigned']);
        
      if (allocErr) throw allocErr;
      
      const allocMap: Record<string, DropZoneAllocation> = {};
      (allocData as DropZoneAllocation[] || []).forEach((a) => {
        allocMap[a.drop_zone_id] = a;
      });
      setAllocations(allocMap);

    } catch (e: any) {
      addToast(e.message, 'error');
      setAllocationsError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const createDropZone = async () => {
    if (!newZoneCode.trim()) return;
    try {
      const { error } = await supabase
        .from('drop_zones')
        .insert({
          warehouse_id: selectedWarehouseId,
          zone_code: newZoneCode.toUpperCase().trim()
        });
      if (error) throw error;
      setNewZoneCode('');
      addToast('Drop zone created successfully', 'success');
      fetchDropZonesData(selectedWarehouseId);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const toggleDropZoneStatus = async (zoneId: string, currentStatus: boolean, isOccupied: boolean) => {
    if (currentStatus && isOccupied) {
      addToast('Zone cannot be disabled while an order is assigned.', 'error');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('drop_zones')
        .update({ is_active: !currentStatus })
        .eq('id', zoneId);
      if (error) throw error;
      addToast(`Drop zone ${!currentStatus ? 'enabled' : 'disabled'}`, 'success');
      fetchDropZonesData(selectedWarehouseId);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouseId) {
      fetchDropZonesData(selectedWarehouseId);
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!supabase || !selectedWarehouseId) return;

    const channel = supabase.channel(`drop_zones_updates_${selectedWarehouseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drop_zones', filter: `warehouse_id=eq.${selectedWarehouseId}` }, () => fetchDropZonesData(selectedWarehouseId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drop_zone_allocations', filter: `warehouse_id=eq.${selectedWarehouseId}` }, () => fetchDropZonesData(selectedWarehouseId))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedWarehouseId]);

  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

  const formatDuration = (startStr: string) => {
    const ms = Date.now() - new Date(startStr).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', color: 'var(--text-primary)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 8px 0' }}>Drop Zone Management</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Manage staging zones and track physical order handovers.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select 
            value={selectedWarehouseId} 
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Drop Zones</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Zone Code (e.g., G1)"
              value={newZoneCode}
              onChange={(e) => setNewZoneCode(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
            />
            <button 
              onClick={createDropZone}
              style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              Create Zone
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Zone Code</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Operational Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Occupancy Details</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Config</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dropZones.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No drop zones found for this warehouse.</td></tr>
              ) : allocationsError ? (
                <tr>
                  <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#ef4444' }}>
                    <AlertTriangle size={24} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.8 }} />
                    Failed to load operational status. Zone occupancies cannot be verified.
                  </td>
                </tr>
              ) : (
                dropZones.map((z: any) => {
                  const allocation = allocations[z.id];
                  const isOccupied = !!allocation;
                  
                  let statusBadge = <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(156, 163, 175, 0.1)', color: 'var(--text-secondary)' }}>EMPTY</span>;
                  if (allocation) {
                    if (allocation.status === 'allocated') {
                      statusBadge = <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>RESERVED</span>;
                    } else if (allocation.status === 'placed') {
                      statusBadge = <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>ORDER WAITING</span>;
                    } else if (allocation.status === 'driver_assigned') {
                      statusBadge = <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>DRIVER ASSIGNED</span>;
                    }
                  }

                  return (
                    <tr key={z.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 'bold' }}>{z.zone_code}</td>
                      <td style={{ padding: '12px 16px' }}>{statusBadge}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {isOccupied ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Order #{allocation.orders?.order_number?.split('-')[2] || allocation.orders?.order_number || allocation.order_id?.split('-')[0]}</div>
                            <div style={{ fontSize: '0.8rem' }}>Picker: {allocation.picker?.full_name} ({allocation.picker?.employee_id})</div>
                            {allocation.driver && <div style={{ fontSize: '0.8rem' }}>Driver: {allocation.driver?.full_name} ({allocation.driver?.employee_id})</div>}
                            {allocation.placed_at && (
                              <div style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                                <Clock size={12} /> Placed: {new Date(allocation.placed_at).toLocaleTimeString()} ({formatDuration(allocation.placed_at)})
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>--</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ 
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                          backgroundColor: z.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: z.is_active ? '#10b981' : '#ef4444'
                        }}>
                          {z.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button 
                          onClick={() => setSelectedDropZoneForQr(z)}
                          style={{ padding: '6px 12px', marginRight: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          View QR
                        </button>
                        <button 
                          onClick={() => toggleDropZoneStatus(z.id, z.is_active, isOccupied)}
                          style={{ 
                            padding: '6px 12px', 
                            borderRadius: '6px', 
                            border: '1px solid var(--border-light)', 
                            backgroundColor: 'transparent', 
                            color: z.is_active && isOccupied ? 'var(--text-muted)' : 'var(--text-primary)', 
                            cursor: z.is_active && isOccupied ? 'not-allowed' : 'pointer'
                          }}
                          title={z.is_active && isOccupied ? "Zone cannot be disabled while an order is assigned" : ""}
                        >
                          {z.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedDropZoneForQr && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', padding: '32px', borderRadius: '16px', width: '400px', maxWidth: '90%', border: '1px solid var(--border-light)' }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package color="var(--primary)" />
              Drop Zone QR Identity
            </h3>
            
            <div style={{ marginBottom: '24px', backgroundColor: 'var(--bg-base)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                <strong>Warehouse:</strong> 
                <span style={{ color: 'var(--text-primary)' }}>{selectedWarehouse?.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <strong>Zone Code:</strong> 
                <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.1rem' }}>{selectedDropZoneForQr.zone_code}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px', backgroundColor: '#fff', padding: '16px', borderRadius: '12px' }}>
              <QRCodeSVG 
                value={`DROPZONE:${selectedDropZoneForQr.warehouse_id}:${selectedDropZoneForQr.qr_token}`}
                size={240}
                level="M"
              />
            </div>

            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '24px', lineHeight: 1.5 }}>
              Scan this QR to verify placement or pickup from <strong style={{ color: 'var(--text-primary)' }}>{selectedDropZoneForQr.zone_code}</strong>.<br/>
              Ensure the label is securely placed in the staging area.
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setSelectedDropZoneForQr(null)}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
              <button 
                onClick={() => {
                  window.print();
                }}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                Print Label
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
