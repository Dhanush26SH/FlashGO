import React, { useState, useEffect } from 'react';
import './InventoryWarehouse.css';
import { useApp } from '../../../context/AppContext';
import { 
  Warehouse, 
  AlertTriangle, 
  Calendar, 
  CheckCircle2, 
  Package,
  Activity,
  Search,
  X
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { DataTable } from '../../../components/Admin/DataTable';
import { AdminService } from '../../../services/api/AdminService';
import { supabase } from '../../../services/api/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';

export const InventoryWarehouse: React.FC = () => {
  const { addToast } = useApp();

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  
  const [inventory, setInventory] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'inventory' | 'batches' | 'locations' | 'movement' | 'audits'>('inventory');
  
  // Stock Movement History state
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // Popup state
  const [selectedLocationForQr, setSelectedLocationForQr] = useState<any>(null);

  // Search state
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  
  // Expanded multi-product location state
  const [expandedLocationIds, setExpandedLocationIds] = useState<Set<string>>(new Set());

  const toggleLocationExpanded = (locId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedLocationIds(prev => {
      const next = new Set(prev);
      if (next.has(locId)) {
        next.delete(locId);
      } else {
        next.clear(); // only one expanded at a time
        next.add(locId);
      }
      return next;
    });
  };
  
  // Audits state
  const [audits, setAudits] = useState<any[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [auditProductId, setAuditProductId] = useState('');
  const [auditLocationId, setAuditLocationId] = useState('');
  const [auditNote, setAuditNote] = useState('');
  const [auditMappedLocations, setAuditMappedLocations] = useState<any[]>([]);

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
      
      if (activeTab === 'locations') {
        let allLocs: any[] = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: locs, error: locsErr } = await supabase
            .from('warehouse_locations')
            .select(`
              *,
              warehouse_product_placements (
                quantity,
                placed_at,
                placement_source,
                product:products(name, barcode, sku, manufacturer_barcode, manufacturer_barcode_verified, internal_barcode)
              )
            `)
            .eq('warehouse_id', warehouseId)
            .order('location_code', { ascending: true })
            .range(from, from + limit - 1);
          
          if (locsErr) {
            console.error('Error fetching locations:', locsErr);
            break;
          }
          
          if (locs && locs.length > 0) {
            allLocs = [...allLocs, ...locs];
            if (locs.length < limit) {
              hasMore = false;
            } else {
              from += limit;
            }
          } else {
            hasMore = false;
          }
        }
        
        setMovements(allLocs); // Using movements state temporarily to hold locs for simplicity
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
      // Fetch audits if on audits tab
      if (activeTab === 'audits') {
        setLoadingAudits(true);
        const { data: auditData, error: auditErr } = await supabase
          .from('cycle_counts')
          .select('*, product:products(name, sku, internal_barcode), location:warehouse_locations(location_code), counter:profiles!counter_id(full_name)')
          .eq('warehouse_id', warehouseId)
          .order('created_at', { ascending: false });
        
        if (auditErr) throw auditErr;
        setAudits(auditData || []);
        setLoadingAudits(false);
      }
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAudit = async () => {
    if (!auditProductId || !auditLocationId) {
      addToast('Product and Location are required', 'error');
      return;
    }
    try {
      const { error } = await supabase.rpc('admin_create_warehouse_audit', {
        p_warehouse_id: selectedWarehouseId,
        p_product_id: auditProductId,
        p_location_id: auditLocationId,
        p_note: auditNote || null
      });
      if (error) throw error;
      addToast('Audit task created successfully', 'success');
      setAuditProductId('');
      setAuditLocationId('');
      setAuditNote('');
      fetchInventoryData(selectedWarehouseId);
    } catch (err: any) {
      addToast(err.message || 'Failed to create audit', 'error');
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

  // Filter locations
  const filteredLocations = movements.filter(l => {
    if (!locationSearchQuery) return true;
    const q = locationSearchQuery.toLowerCase().trim();
    if (l.location_code?.toLowerCase().includes(q)) return true;
    
    if (l.warehouse_product_placements) {
      for (const p of l.warehouse_product_placements) {
        if (p.product?.name?.toLowerCase().includes(q)) return true;
        if (p.product?.sku?.toLowerCase().includes(q)) return true;
        if (p.product?.internal_barcode?.toLowerCase().includes(q)) return true;
      }
    }
    return false;
  });

  useEffect(() => {
    if (!auditProductId || !selectedWarehouseId) {
      setAuditMappedLocations([]);
      return;
    }
    
    const fetchMappedLocations = async () => {
      const { data, error } = await supabase
        .from('warehouse_product_placements')
        .select(`
          location_id,
          quantity,
          location:warehouse_locations ( location_code )
        `)
        .eq('product_id', auditProductId)
        .eq('warehouse_id', selectedWarehouseId);
        
      if (!error && data) {
        setAuditMappedLocations(data);
      } else {
        setAuditMappedLocations([]);
      }
    };
    
    fetchMappedLocations();
  }, [auditProductId, selectedWarehouseId]);

  return (
    <div className="container">
        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid var(--border-light)', marginBottom: '24px', overflowX: 'auto' }}>
          <button style={activeTab === 'inventory' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('inventory')}>Inventory Stock</button>
          <button style={activeTab === 'batches' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('batches')}>Batch Expiry Management</button>
          <button style={activeTab === 'locations' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('locations')}>Warehouse Locations</button>
          <button style={activeTab === 'movement' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('movement')}>Stock Movement History</button>
          <button style={activeTab === 'audits' ? activeTabStyle : inactiveTabStyle} onClick={() => setActiveTab('audits')}>Inventory Audits</button>
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

      {activeTab === 'audits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>Create Audit Task</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Product</label>
                <select 
                  value={auditProductId} 
                  onChange={(e) => {
                    setAuditProductId(e.target.value);
                    setAuditLocationId('');
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)' }}
                >
                  <option value="">Select a product...</option>
                  {inventory.map(inv => (
                    <option key={inv.product_id} value={inv.product_id}>{inv.name} ({inv.sku})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Target Location (Mapped only)</label>
                <select 
                  value={auditLocationId} 
                  onChange={(e) => setAuditLocationId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)' }}
                  disabled={!auditProductId}
                >
                  <option value="">Select mapped location...</option>
                  {auditMappedLocations.map((p: any) => (
                    <option key={p.location_id} value={p.location_id}>{p.location?.location_code} (Qty: {p.quantity})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Note (Optional)</label>
                <input 
                  type="text" 
                  value={auditNote} 
                  onChange={(e) => setAuditNote(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)' }}
                  placeholder="Reason for count..."
                />
              </div>
              <button 
                onClick={handleCreateAudit}
                style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 24px', fontWeight: 600, cursor: 'pointer', height: '42px' }}
                disabled={!auditProductId || !auditLocationId}
              >
                Create Task
              </button>
            </div>
          </div>
          
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>Audit Tasks</h3>
            {loadingAudits ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading audits...</p>
            ) : audits.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No audit tasks found for this warehouse.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Created</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Product</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Location</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>System Qty</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>Counted</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>Variance</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Auditor</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{new Date(a.created_at).toLocaleString()}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
                          backgroundColor: a.status === 'open' ? '#fef3c7' : a.status === 'counting' ? '#e0f2fe' : a.status === 'submitted' ? '#f3e8ff' : '#f1f5f9',
                          color: a.status === 'open' ? '#d97706' : a.status === 'counting' ? '#0284c7' : a.status === 'submitted' ? '#9333ea' : '#475569'
                        }}>
                          {a.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{a.product?.name} ({a.product?.sku})</td>
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{a.location?.location_code}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{a.status === 'open' || a.status === 'counting' ? '-' : a.system_quantity}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{a.counted_quantity ?? '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: a.variance < 0 ? '#ef4444' : a.variance > 0 ? '#10b981' : 'var(--text-primary)' }}>
                        {a.variance !== null ? (a.variance > 0 ? `+${a.variance}` : a.variance) : '-'}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{a.counter?.full_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
              { key: 'placed', header: 'PLACED / SELLABLE', sortable: true, render: (r) => (
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.physical_stock}</span>
              )},
              { key: 'staging', header: 'RECEIVING / STAGING', sortable: true, render: (r) => (
                <span style={{ fontWeight: 700, color: r.staging_quantity > 0 ? '#10b981' : 'var(--text-muted)' }}>{r.staging_quantity || 0}</span>
              )},
              { key: 'reserved', header: 'RESERVED', sortable: true, render: (r) => (
                <span style={{ fontWeight: 700, color: r.reserved_stock > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{r.reserved_stock}</span>
              )},
              { key: 'available', header: 'AVAILABLE (LIVE)', sortable: true, render: (r) => {
                const available = r.physical_stock - r.reserved_stock;
                return (
                  <span className={available < 20 ? 'admin-badge-warning' : 'admin-badge-success'}>
                    {available}
                  </span>
                )
              }},
              { key: 'total', header: 'PHYSICAL TOTAL', sortable: true, render: (r) => (
                <span style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{r.physical_stock + (r.staging_quantity || 0)}</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 16px 16px', flexWrap: 'wrap', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Warehouse size={18} color="var(--primary)" /> Physical Warehouse Locations
            </h3>

            <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <Search size={16} color="var(--text-muted)" />
              </div>
              <input 
                type="text" 
                placeholder="Search product, location, product code or FLH barcode..." 
                value={locationSearchQuery}
                onChange={e => setLocationSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 36px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
              {locationSearchQuery && (
                <button 
                  onClick={() => setLocationSearchQuery('')}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                >
                  <X size={16} color="var(--text-muted)" />
                </button>
              )}
            </div>
          </div>
          
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto', margin: '0 16px 16px 16px' }}>
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
                {filteredLocations.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No warehouse locations found.</td></tr>
                ) : (
                  filteredLocations.map((l: any) => {
                    const placements = l.warehouse_product_placements || [];
                    const used = placements.reduce((a:any, b:any) => a + b.quantity, 0);
                    const free = l.capacity - used;
                    const isFull = used >= l.capacity;
                    const isMulti = placements.length > 1;
                    const isExpanded = expandedLocationIds.has(l.id);

                    return (
                      <React.Fragment key={l.id}>
                        <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-light)' }}>
                          <td 
                            style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer' }}
                            onClick={() => setSelectedLocationForQr(l)}
                            title="Click to view details and print QR"
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.textDecoration = 'underline'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.textDecoration = 'none'; }}
                          >
                            {l.location_code}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                            {placements.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Empty</span>}
                            {placements.length === 1 && (
                              <div style={{ fontSize: '0.85rem' }}>
                                {placements[0].product?.name}
                              </div>
                            )}
                            {isMulti && (
                              <div 
                                onClick={(e) => toggleLocationExpanded(l.id, e)}
                                style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                {placements.length} Products {isExpanded ? '▴' : '▾'}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                            {placements.length === 1 && (
                              <div style={{ fontSize: '0.85rem' }}>{placements[0].product?.sku || 'N/A'}</div>
                            )}
                            {isMulti && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>-</div>}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                            {placements.length === 1 && (
                              <div style={{ fontSize: '0.85rem' }}>
                                {placements[0].product?.manufacturer_barcode_verified ? (
                                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>{placements[0].product?.manufacturer_barcode}</span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>Not verified</span>
                                )}
                              </div>
                            )}
                            {isMulti && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>-</div>}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                            <div style={{ fontSize: '0.85rem' }}>
                              <strong>{used}</strong>
                              {isMulti && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>(Total)</span>}
                            </div>
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
                        
                        {isExpanded && isMulti && (
                          <tr style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
                            <td colSpan={8} style={{ padding: '16px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                {placements.map((p: any, i: number) => (
                                  <div key={i} style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{p.product?.name}</h4>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                      <span style={{ color: 'var(--text-muted)' }}>Product Code:</span> {p.product?.sku || 'N/A'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                      <span style={{ color: 'var(--text-muted)' }}>Manufacturer Barcode:</span>{' '}
                                      {p.product?.manufacturer_barcode_verified ? (
                                        <span style={{ color: '#10b981', fontWeight: 'bold' }}>{p.product?.manufacturer_barcode}</span>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>Not verified</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                      <span style={{ color: 'var(--text-muted)' }}>Qty:</span> <strong>{p.quantity}</strong>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'locations' && selectedLocationForQr && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--bg-base)', padding: '32px', borderRadius: '16px', width: '350px', border: '1px solid var(--border-light)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 800 }}>Location Details</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <strong>Location Code:</strong> 
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedLocationForQr.location_code}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <strong>Zone:</strong> 
                <span style={{ color: 'var(--text-primary)' }}>{selectedLocationForQr.zone}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <strong>Rack:</strong> 
                <span style={{ color: 'var(--text-primary)' }}>{selectedLocationForQr.rack}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <strong>Shelf:</strong> 
                <span style={{ color: 'var(--text-primary)' }}>{selectedLocationForQr.shelf_level}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <strong>Position:</strong> 
                <span style={{ color: 'var(--text-primary)' }}>{selectedLocationForQr.position}</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px', backgroundColor: '#fff', padding: '16px', borderRadius: '12px' }}>
              <QRCodeSVG value={selectedLocationForQr.barcode} size={180} />
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 700 }}
                onClick={() => setSelectedLocationForQr(null)}
              >
                Close
              </button>
              <button 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                onClick={() => {
                  window.print();
                }}
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
