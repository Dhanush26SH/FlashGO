import React, { useState, useEffect } from 'react';
import './InventoryWarehouse.css';
import { useApp } from '../../../context/AppContext';
import { 
  Warehouse, 
  AlertTriangle, 
  Calendar, 
  CheckCircle2, 
  Package,
  Activity
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { DataTable } from '../../../components/Admin/DataTable';
import { AdminService } from '../../../services/api/AdminService';
import { supabase } from '../../../services/api/supabaseClient';

export const InventoryWarehouse: React.FC = () => {
  const { addToast } = useApp();

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  
  const [inventory, setInventory] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'inventory' | 'batches' | 'locations' | 'movement'>('inventory');
  
  // Stock Movement History state
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

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

  const fetchInventoryData = async (warehouseId: string) => {
    try {
      setIsLoading(true);
      const [invData, ledgerData, batchData] = await Promise.all([
        AdminService.getWarehouseInventory(warehouseId),
        AdminService.getStockLedgers(warehouseId),
        AdminService.getProductBatches(warehouseId)
      ]);
      setInventory(invData || []);
      setLedgers(ledgerData || []);
      setBatches(batchData || []);
      
      // Fetch movements if on movement tab
      if (activeTab === 'movement') {
        setLoadingMovements(true);
        const { data: movData, error: movErr } = await supabase
          .from('stock_ledgers')
          .select('*, product:products(name)')
          .eq('warehouse_id', warehouseId)
          .order('created_at', { ascending: false })
          .limit(200);
        
        if (movErr) throw movErr;
        setMovements(movData || []);
        setLoadingMovements(false);
      }
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouseId) {
      fetchInventoryData(selectedWarehouseId);
    }
  }, [selectedWarehouseId, activeTab]);

  useEffect(() => {
    if (!supabase || !selectedWarehouseId) return;

    const channel = supabase.channel(`inventory_updates_${selectedWarehouseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock', filter: `warehouse_id=eq.${selectedWarehouseId}` }, () => fetchInventoryData(selectedWarehouseId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_reservations', filter: `warehouse_id=eq.${selectedWarehouseId}` }, () => fetchInventoryData(selectedWarehouseId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_ledgers', filter: `warehouse_id=eq.${selectedWarehouseId}` }, () => fetchInventoryData(selectedWarehouseId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_batches', filter: `warehouse_id=eq.${selectedWarehouseId}` }, () => fetchInventoryData(selectedWarehouseId))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedWarehouseId]);

  const activeTabStyle = { padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' };
  const inactiveTabStyle = { padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' };

  const lowStockProducts = inventory.filter(p => p.is_low_stock);
  const expiryBatches = batches.filter(b => b.days_left <= 30 && b.status === 'active');
  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

  return (
    <div className="container">
        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid var(--border-light)', marginBottom: '24px' }}>
          <button style={activeTab === 'inventory' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('inventory')}>Inventory Stock</button>
          <button style={activeTab === 'batches' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('batches')}>Batch Expiry Management</button>
          <button style={activeTab === 'locations' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('locations')}>Warehouse Locations</button>
          <button style={activeTab === 'movement' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('movement')}>Stock Movement History</button>
        </div>

      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
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
        {isLoading && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Syncing telemetry...</span>}
      </div>

      {activeTab === 'movement' && (
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Timestamp</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Reason</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Qty Change</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Admin ID</th>
              </tr>
            </thead>
            <tbody>
              {loadingMovements ? (
                <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center' }}>Loading movements...</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center' }}>No stock movements found</td></tr>
              ) : movements.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 16px' }}>{new Date(m.created_at).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>{m.product?.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className="status-badge" style={{ backgroundColor: 'var(--primary-transparent)', color: 'var(--primary)' }}>
                      {m.reason}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: m.quantity_change > 0 ? '#10b981' : m.quantity_change < 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 700 }}>
                    {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{m.actor_email?.slice(0,8) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="glass-panel">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 16px 0 16px' }}>
            <Package size={18} color="var(--primary)" /> Authoritative Current Stock
          </h3>
          <DataTable
            data={inventory}
            keyExtractor={p => p.product_id}
            columns={[
              { key: 'sku', header: 'SKU', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.sku}</span> },
              { key: 'name', header: 'PRODUCT', sortable: true, render: (r) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img src={r.image_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px' }} />
                  <span style={{ fontWeight: 700 }}>{r.name}</span>
                </div>
              )},
              { key: 'physical_stock', header: 'PHYSICAL STOCK', sortable: true, render: (r) => (
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{r.physical_stock}</span>
              )},
              { key: 'reserved_stock', header: 'RESERVED', sortable: true, render: (r) => (
                <span style={{ fontWeight: 700, color: r.reserved_stock > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{r.reserved_stock}</span>
              )},
              { key: 'sellable_stock', header: 'SELLABLE (LIVE)', sortable: true, render: (r) => (
                <span className={r.is_low_stock ? 'admin-badge-warning' : 'admin-badge-success'}>
                  {r.sellable_stock} Units
                </span>
              )},
            ]}
          />
        </div>
      )}

      {activeTab === 'batches' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="glass-panel">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 16px 0 16px' }}>
            <Calendar size={18} color="var(--primary)" /> Product Batches (FEFO)
          </h3>
          <DataTable
            data={batches}
            keyExtractor={b => b.batch_id}
            columns={[
              { key: 'batch_number', header: 'BATCH NO', sortable: true, render: (b) => <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{b.batch_number}</span> },
              { key: 'product_name', header: 'PRODUCT', sortable: true, render: (b) => <span style={{ fontWeight: 600 }}>{b.product_name}</span> },
              { key: 'received_quantity', header: 'RECEIVED', sortable: true, render: (b) => <span style={{ color: 'var(--text-muted)' }}>{b.received_quantity}</span> },
              { key: 'available_quantity', header: 'AVAILABLE', sortable: true, render: (b) => <span style={{ fontWeight: 700 }}>{b.available_quantity}</span> },
              { key: 'damaged_quantity', header: 'DAMAGED', sortable: true, render: (b) => <span style={{ color: b.damaged_quantity > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{b.damaged_quantity}</span> },
              { key: 'expired_quantity', header: 'EXPIRED', sortable: true, render: (b) => <span style={{ color: b.expired_quantity > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{b.expired_quantity}</span> },
              { key: 'expiry_date', header: 'EXPIRY', sortable: true, render: (b) => (
                <span style={{ color: b.days_left <= 0 ? 'var(--danger)' : b.days_left <= 30 ? 'var(--accent)' : 'var(--text-primary)', fontWeight: 600 }}>
                  {new Date(b.expiry_date).toLocaleDateString()}
                </span>
              )},
              { key: 'status', header: 'STATUS', sortable: true, render: (b) => (
                <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, backgroundColor: b.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: b.status === 'active' ? '#10b981' : 'var(--danger)' }}>
                  {b.status.toUpperCase()}
                </span>
              )}
            ]}
          />
        </div>
      )}

      {activeTab === 'locations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 0 16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Warehouse size={18} color="var(--primary)" /> Operational Warehouses
            </h3>
          </div>
          
          <div style={{ height: '300px', width: '100%', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', border: '1px solid var(--border-light)', margin: '16px 0', padding: '0 16px' }}>
            <MapContainer 
              center={[13.3427, 74.7472]} 
              zoom={11} 
              scrollWheelZoom={false} 
              style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {warehouses.map((ds: any) => (
                <Circle
                  key={ds.id}
                  center={[ds.lat, ds.lng]}
                  radius={(ds.service_radius_km || 5) * 1000}
                  pathOptions={{
                    color: ds.is_active ? '#10b981' : 'var(--danger)',
                    fillColor: ds.is_active ? '#10b981' : 'var(--danger)',
                    fillOpacity: 0.2
                  }}
                >
                  <Popup>
                    <div style={{ color: '#000' }}>
                      <strong>{ds.name}</strong><br/>
                      Code: {ds.code}
                    </div>
                  </Popup>
                </Circle>
              ))}
            </MapContainer>
          </div>

          <DataTable
            data={warehouses}
            keyExtractor={(w: any) => w.id}
            columns={[
              { key: 'code', header: 'CODE', render: (w: any) => <span style={{ fontWeight: 800 }}>{w.code}</span> },
              { key: 'name', header: 'NAME', render: (w: any) => w.name },
              { key: 'address', header: 'ADDRESS', render: (w: any) => w.address || 'N/A' },
              { key: 'radius', header: 'SERVICE RADIUS', render: (w: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 800 }}>{w.service_radius_km || 5} km</span>
                  <button 
                    onClick={async () => {
                      const rad = prompt('Enter new service radius (km) for ' + w.name, w.service_radius_km || '5');
                      if (rad && !isNaN(Number(rad))) {
                        try {
                          await AdminService.updateWarehouseServiceability(w.id, Number(rad));
                          addToast('Serviceability radius updated', 'success');
                          fetchWarehouses();
                        } catch (e: any) {
                          addToast(e.message, 'error');
                        }
                      }
                    }}
                    style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-light)', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Edit
                  </button>
                </div>
              )},
              { key: 'active', header: 'STATUS', render: (w: any) => (
                <span className={w.is_active ? 'admin-badge-success' : 'admin-badge-warning'}>
                  {w.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              )},
              { key: 'actions', header: '', render: (w: any) => (
                <button 
                  onClick={async () => {
                    try {
                      await AdminService.updateWarehouse(w.id, { is_active: !w.is_active });
                      addToast(`Warehouse ${!w.is_active ? 'activated' : 'deactivated'}`, 'success');
                      fetchWarehouses();
                    } catch (e: any) {
                      addToast(e.message, 'error');
                    }
                  }}
                  style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', cursor: 'pointer', color: w.is_active ? 'var(--danger)' : 'var(--primary)' }}
                >
                  {w.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            ]}
          />
        </div>
      )}

    </div>
  );
};
