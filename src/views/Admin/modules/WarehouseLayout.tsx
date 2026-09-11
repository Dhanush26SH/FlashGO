import React, { useState, useEffect } from 'react';
import { Box, Search, Edit2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { DataTable } from '../../../components/Admin/DataTable';
import { supabase } from '../../../services/api/supabaseClient';

interface WarehouseStock {
  product_id: string;
  warehouse_location: string | null;
  quantity: number;
}

export const WarehouseLayout: React.FC = () => {
  const { addToast, products, darkStores } = useApp();
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockData, setStockData] = useState<Record<string, WarehouseStock>>({});
  
  // Edit Modal State
  const [editProduct, setEditProduct] = useState<any | null>(null);
  const [newLocation, setNewLocation] = useState('');

  // Select first warehouse automatically
  useEffect(() => {
    if (darkStores.length > 0 && !selectedWarehouse) {
      setSelectedWarehouse(darkStores[0].id);
    }
  }, [darkStores, selectedWarehouse]);

  // Fetch warehouse stock for the selected warehouse
  useEffect(() => {
    if (!selectedWarehouse) return;

    const fetchStock = async () => {
      const { data, error } = await supabase
        .from('warehouse_stock')
        .select('product_id, warehouse_location, quantity')
        .eq('warehouse_id', selectedWarehouse);
      
      if (error) {
        addToast('Failed to load warehouse stock: ' + error.message, 'error');
        return;
      }
      
      const map: Record<string, WarehouseStock> = {};
      data.forEach((s: any) => {
        map[s.product_id] = s;
      });
      setStockData(map);
    };

    fetchStock();
  }, [selectedWarehouse]);

  const handleSaveLocation = async () => {
    if (!editProduct || !selectedWarehouse) return;
    try {
      const { error } = await supabase.rpc('admin_set_product_location', {
        p_warehouse_id: selectedWarehouse,
        p_product_id: editProduct.id,
        p_location: newLocation
      });

      if (error) throw error;
      
      addToast('Location updated', 'success');
      setStockData(prev => ({
        ...prev,
        [editProduct.id]: {
          ...prev[editProduct.id],
          warehouse_location: newLocation ? newLocation.toUpperCase().trim() : null
        }
      }));
      setEditProduct(null);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const tableData = products
    .filter(p => !!stockData[p.id]) // Only products provisioned in this warehouse
    .filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .map(p => ({
      ...p,
      currentLocation: stockData[p.id]?.warehouse_location || 'Not Assigned',
      stockQty: stockData[p.id]?.quantity || 0
    }));

  return (
    <div className="admin-module">
      <header className="module-header" style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', 
        marginBottom: '24px', flexWrap: 'wrap', gap: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>Warehouse Product Locations</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>Map physical storage locations for products within specific dark stores.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <select 
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            style={{
              padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.95rem',
              outline: 'none', cursor: 'pointer'
            }}
          >
            {darkStores.map(ds => (
              <option key={ds.id} value={ds.id}>{ds.name}</option>
            ))}
          </select>

          <div style={{ 
            display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-surface)', 
            border: '1px solid var(--border-light)', borderRadius: '12px', padding: '10px 16px',
            gap: '10px', width: '300px'
          }}>
            <Search size={18} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search product or SKU..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </header>

      <div className="glass-panel" style={{ padding: '16px' }}>
        <DataTable
          data={tableData}
          keyExtractor={p => p.id}
          columns={[
            { key: 'sku', header: 'SKU', sortable: true, render: p => <span style={{ fontFamily: 'monospace' }}>{p.sku}</span> },
            { key: 'name', header: 'PRODUCT', sortable: true, render: p => 
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src={p.image_url} alt={p.name} style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                <span>{p.name}</span>
              </div>
            },
            { key: 'stock', header: 'PHYSICAL STOCK', sortable: true, render: p => <span>{p.stockQty} units</span> },
            { key: 'location', header: 'STORAGE LOCATION', sortable: true, render: p => 
              <span className={`admin-badge-${p.currentLocation === 'Not Assigned' ? 'warning' : 'primary'}`}>
                {p.currentLocation}
              </span> 
            },
            { key: 'actions', header: 'ACTIONS', render: p => (
              <button 
                type="button"
                style={{ padding: '6px 12px', background: 'var(--bg-base)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  setEditProduct(p);
                  setNewLocation(p.currentLocation === 'Not Assigned' ? '' : p.currentLocation);
                }}
              >
                <Edit2 size={14} /> Edit
              </button>
            )}
          ]}
        />
      </div>

      {editProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '400px', backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Box size={20} color="var(--primary)" /> Edit Storage Location
            </h3>
            
            <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'var(--bg-base)', borderRadius: '8px' }}>
              <div style={{ fontWeight: 600 }}>{editProduct.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>SKU: {editProduct.sku}</div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Storage Location Code
              </label>
              <input 
                type="text" 
                placeholder="e.g. A1-R2-S3"
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Leave empty to unassign location. Location is specific to the selected warehouse.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                style={{ padding: '8px 16px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} 
                onClick={() => setEditProduct(null)}
              >
                Cancel
              </button>
              <button className="primary-btn" onClick={handleSaveLocation}>
                Save Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
