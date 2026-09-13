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
      
      // Fetch physical locations and placements if on locations tab
      if (activeTab === 'locations') {
        const { data: locs, error: locsErr } = await supabase
          .from('warehouse_locations')
          .select(`
            *,
            warehouse_product_placements (
              quantity,
              placed_at,
              placement_source,
              product:products(name, barcode, sku, manufacturer_barcode, manufacturer_barcode_verified)
            )
          `)
          .eq('warehouse_id', warehouseId)
          .order('location_code', { ascending: true });
        
        if (!locsErr) {
            // we will store locs in state
            setMovements(locs || []); // Using movements state temporarily to hold locs for simplicity
        }
      }

      // Fetch movements if on movement tab
      if (activeTab === 'movement') {
        setLoadingMovements(true);
        const { data: movData, error: movErr } = await supabase
          .from('warehouse_placement_events')
          .select('*, product:products(name, barcode, sku, manufacturer_barcode, manufacturer_barcode_verified), from_loc:warehouse_locations!from_location_id(location_code), to_loc:warehouse_locations!to_location_id(location_code)')
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
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Event Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>From → To</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Qty</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {loadingMovements ? (
                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center' }}>Loading events...</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No placement events found.</td></tr>
              ) : (
                movements.map((m: any) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{new Date(m.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>{m.event_type}</span></td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{m.product?.name} ({m.product?.barcode})</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{m.from_loc?.location_code || 'UNPLACED'} → {m.to_loc?.location_code || 'OUT'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{m.quantity}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{m.source}</td>
                  </tr>
                ))
              )}
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
              <Warehouse size={18} color="var(--primary)" /> Physical Warehouse Locations
            </h3>
          </div>
          
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden', margin: '0 16px 16px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Location Code</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product Code</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Manufacturer Barcode</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Qty</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Used / Capacity</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Free Capacity</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No physical locations mapped.</td></tr>
                ) : (
                  movements.map((l: any) => {
                    const used = l.warehouse_product_placements?.reduce((a:any, b:any) => a + b.quantity, 0) || 0;
                    const free = l.capacity - used;
                    const isFull = used >= l.capacity;
                    return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 800 }}>{l.location_code}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                        {l.warehouse_product_placements?.map((p: any, i: number) => (
                          <div key={i} style={{ fontSize: '0.8rem', padding: '2px 0' }}>
                            {p.product?.name}
                          </div>
                        ))}
                        {(!l.warehouse_product_placements || l.warehouse_product_placements.length === 0) && <span style={{ color: 'var(--text-muted)' }}>Empty</span>}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {l.warehouse_product_placements?.map((p: any, i: number) => (
                          <div key={i} style={{ fontSize: '0.8rem', padding: '2px 0' }}>
                            {p.product?.sku || 'N/A'}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {l.warehouse_product_placements?.map((p: any, i: number) => (
                          <div key={i} style={{ fontSize: '0.8rem', padding: '2px 0' }}>
                            {p.product?.manufacturer_barcode_verified ? (
                              <span style={{ color: '#10b981', fontWeight: 'bold' }}>{p.product?.manufacturer_barcode}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Not verified</span>
                            )}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                        {l.warehouse_product_placements?.map((p: any, i: number) => (
                          <div key={i} style={{ fontSize: '0.8rem', padding: '2px 0' }}>
                            <strong>{p.quantity}</strong>
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{used} / {l.capacity}</span>
                        </div>
                        <div style={{ height: '4px', width: '100%', backgroundColor: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, (used/l.capacity)*100)}%`, backgroundColor: isFull ? '#ef4444' : '#10b981' }}></div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>{free}</td>
                      <td style={{ padding: '12px 16px' }}>
                         <span className={isFull ? 'admin-badge-warning' : 'admin-badge-success'}>
                           {isFull ? 'FULL' : 'AVAILABLE'}
                         </span>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
