import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ShieldAlert, Send, Compass } from 'lucide-react';

import { WorkSlotScheduler } from '../../components/WorkSlotScheduler';

export const WarehouseView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'console' | 'schedule'>('console');
  return (
    <div style={{ padding: '0', maxWidth: '1400px', margin: '0 auto', height: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '16px 24px', backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-light)' }}>
        <button 
          onClick={() => setActiveTab('console')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'console' ? 'var(--primary)' : 'var(--bg-surface)', color: activeTab === 'console' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Warehouse Console
        </button>
        <button 
          onClick={() => setActiveTab('schedule')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'schedule' ? 'var(--primary)' : 'var(--bg-surface)', color: activeTab === 'schedule' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          My Schedule
        </button>
      </div>
      <div style={{ height: 'calc(100% - 70px)', overflowY: 'auto' }}>
        {activeTab === 'console' ? <WarehouseConsole /> : <div style={{ padding: '24px' }}><WorkSlotScheduler /></div>}
      </div>
    </div>
  );
};

const WarehouseConsole: React.FC = () => {
  const { 
    products, vendors, procurementOrders, createProcurementOrder, 
    approveProcurementOrder, adjustStock, currentUser 
  } = useApp();

  const [selectedVendorId, setSelectedVendorId] = useState(vendors[0]?.id || '');
  const [procureCost, setProcureCost] = useState('150.00');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Filter low stock items (threshold = 15 units)
  const lowStockItems = products.filter(p => p.stock_quantity < 15);

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const cost = parseFloat(procureCost);
    if (selectedVendorId && !isNaN(cost) && cost > 0) {
      createProcurementOrder(selectedVendorId, [] as any);
      setShowOrderModal(false);
    }
  };

  return (
    <div style={containerStyle}>
      <header style={headerStyle} className="glass-panel">
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>⚡ FlashGO Warehouse Console</h2>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Welcome back, {currentUser?.full_name || 'Warehouse Staff'}</p>
        </div>
        <span style={roleBadgeStyle}>WAREHOUSE INVENTORY</span>
      </header>

      {/* Grid Layout */}
      <div style={gridStyle}>
        {/* Left Column: Inventory Stock Dashboard */}
        <div style={colStyle}>
          <div style={panelHeaderStyle}>Real-time Stock Spreadsheet</div>

          <div style={inventoryTableCardStyle} className="glass-panel">
            <div style={tableScrollStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeaderRowStyle}>
                    <th style={thStyle}>PRODUCT</th>
                    <th style={thStyle}>SKU</th>
                    <th style={thStyle}>RACK</th>
                    <th style={thStyle}>STOCK</th>
                    <th style={thStyle}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const isLow = p.stock_quantity < 15;
                    return (
                      <tr key={p.id} style={tableRowStyle(isLow)}>
                        <td style={tdStyle}>
                          <div style={productCellInfoStyle}>
                            <img src={p.image_url} alt={p.name} style={productThumbStyle} />
                            <span style={{ fontWeight: 700 }}>{p.name}</span>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{p.sku}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{p.warehouse_location}</td>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>
                          {p.stock_quantity} units
                          <button 
                            onClick={() => {
                              const qty = prompt(`Adjust stock for ${p.name} (e.g. +5 or -2):`);
                              if (qty && !isNaN(Number(qty))) {
                                adjustStock(p.id, Number(qty));
                              }
                            }}
                            style={adjustBtnStyle}
                          >
                            ±
                          </button>
                        </td>
                        <td style={tdStyle}>
                          {isLow ? (
                            <span style={lowStockStatusLabelStyle}>⚡ RE-ORDER</span>
                          ) : (
                            <span style={goodStockStatusLabelStyle}>✓ OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Procurements and replenishment */}
        <div style={colStyle}>
          <div style={panelHeaderStyle}>Supplier Replenishment & Procurements</div>

          {/* Low Stock Warning Ticker */}
          {lowStockItems.length > 0 && (
            <div style={warningTickerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} color="var(--danger)" />
                <strong style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>THRESHOLD ALERTS ACTIVE</strong>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {lowStockItems.length} products have fallen below minimum safety stocks of 15 units. Draft a replenishment order.
              </p>
            </div>
          )}

          {/* Procurements list */}
          <div style={procureCardStyle} className="glass-panel">
            <div style={procureHeaderRowStyle}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Procurement Orders</h3>
              <button onClick={() => setShowOrderModal(true)} style={orderDraftButtonStyle}>
                + Draft Order
              </button>
            </div>

            <div style={ordersListWrapperStyle}>
              {procurementOrders.length > 0 ? (
                procurementOrders.map(po => {
                  const isPending = po.status === 'pending';
                  const isApproved = po.status === 'approved';
                  const isDelivered = po.status === 'received' || po.status === 'partially_received';

                  return (
                    <div key={po.id} style={procureRowStyle}>
                      <div>
                        <div style={procureNameStyle}>{po.vendor_name}</div>
                        <div style={procureMetaStyle}>Cost: ₹{Number(po.total_cost).toFixed(2)} | Code: #{po.id.toUpperCase().slice(-6)}</div>
                      </div>

                      <div style={procureActionColStyle}>
                        {isPending && (
                          <>
                            <span style={badgeStyle('rgba(245, 158, 11, 0.15)', 'var(--accent)')}>DRAFTED</span>
                            <button onClick={() => approveProcurementOrder(po.id)} style={actionBtnStyle}>
                              Approve
                            </button>
                          </>
                        )}
                        {isApproved && (
                            <span style={badgeStyle('rgba(59, 130, 246, 0.15)', 'var(--primary)')}>ON TRANSIT</span>
                        )}
                        {isDelivered && (
                          <span style={badgeStyle('rgba(16, 185, 129, 0.15)', '#10b981')}>✓ RECEIVED & STOCKED</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={emptyProcureStyle}>No procurements drafted. All items stocked!</div>
              )}
            </div>
          </div>

          {/* Supplier Directory */}
          <div style={vendorsCardStyle} className="glass-panel">
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '8px' }}>Active Grocery Suppliers</h3>
            {vendors.map(v => (
              <div key={v.id} style={vendorRowStyle}>
                <div>
                  <div style={vendorNameStyle}>{v.name}</div>
                  <div style={vendorDetailsStyle}>Contact: {v.contact_person} | {v.phone}</div>
                </div>
                <Compass size={16} color="var(--text-secondary)" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Procurement Draft Modal Popup */}
      {showOrderModal && (
        <div style={modalOverlayStyle}>
          <form onSubmit={handleCreateOrder} style={modalCardStyle} className="glass-panel animate-slide-up">
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Send size={18} color="var(--primary)" /> Draft Procurement Replenishment
            </h4>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
              Procure grocery supplies. Stocks automatically update when delivery completes and rider is received.
            </p>

            <label style={formLabelStyle}>Select Supplier</label>
            <select 
              value={selectedVendorId} 
              onChange={e => setSelectedVendorId(e.target.value)}
              style={selectFieldStyle}
            >
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>

            <label style={{ ...formLabelStyle, marginTop: '8px' }}>Procurement Cost (₹)</label>
            <input 
              type="number" 
              value={procureCost} 
              onChange={e => setProcureCost(e.target.value)} 
              style={inputFieldStyle}
              required 
            />

            <div style={modalBtnRowStyle}>
              <button type="button" onClick={() => setShowOrderModal(false)} style={cancelButtonStyle}>
                Cancel
              </button>
              <button type="submit" style={submitButtonStyle}>
                Submit Procurement Draft
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// --- Warehouse App STYLING ---
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 24px',
  borderRadius: 'var(--border-radius-md)'
};

const roleBadgeStyle: React.CSSProperties = {
  backgroundColor: 'var(--border-light)',
  color: 'var(--text-secondary)',
  fontSize: '0.65rem',
  fontWeight: 800,
  padding: '4px 10px',
  borderRadius: '10px'
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 1fr',
  gap: '24px',
  alignItems: 'start'
};

const colStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const panelHeaderStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 800,
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '8px'
};

const inventoryTableCardStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: 'var(--bg-surface)',
  borderRadius: 'var(--border-radius-sm)',
};

const tableScrollStyle: React.CSSProperties = {
  overflowX: 'auto',
  maxHeight: '480px',
  overflowY: 'auto'
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left'
};

const tableHeaderRowStyle: React.CSSProperties = {
  borderBottom: '2px solid var(--border-light)',
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '0.65rem',
  fontWeight: 800,
  color: 'var(--text-secondary)',
  letterSpacing: '0.05em'
};

const tableRowStyle = (isLow: boolean): React.CSSProperties => ({
  borderBottom: '1px solid var(--border-light)',
  backgroundColor: isLow ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
});

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '0.75rem',
  color: 'var(--text-primary)',
};

const productCellInfoStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const productThumbStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '4px',
  objectFit: 'cover',
  backgroundColor: '#f1f5f9'
};

const lowStockStatusLabelStyle: React.CSSProperties = {
  color: 'var(--danger)',
  backgroundColor: 'rgba(239, 68, 68, 0.12)',
  fontSize: '0.62rem',
  fontWeight: 800,
  padding: '2px 8px',
  borderRadius: '4px'
};

const goodStockStatusLabelStyle: React.CSSProperties = {
  color: '#10b981',
  backgroundColor: 'rgba(16, 185, 129, 0.12)',
  fontSize: '0.62rem',
  fontWeight: 800,
  padding: '2px 8px',
  borderRadius: '4px'
};

const warningTickerStyle: React.CSSProperties = {
  backgroundColor: 'rgba(239, 68, 68, 0.05)',
  border: '1px solid rgba(239, 68, 68, 0.15)',
  padding: '12px',
  borderRadius: 'var(--border-radius-xs)'
};

const procureCardStyle: React.CSSProperties = {
  padding: '20px',
  backgroundColor: 'var(--bg-surface)'
};

const procureHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '10px',
  marginBottom: '10px'
};

const orderDraftButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  padding: '4px 12px',
  borderRadius: '4px',
  fontSize: '0.7rem',
  fontWeight: 800,
  cursor: 'pointer'
};

const ordersListWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const procureRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px',
  borderBottom: '1px solid var(--border-light)',
  fontSize: '0.72rem'
};

const procureNameStyle: React.CSSProperties = {
  fontWeight: 700
};

const procureMetaStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.68rem',
  marginTop: '1px'
};

const procureActionColStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const badgeStyle = (bgColor: string, color: string): React.CSSProperties => ({
  backgroundColor: bgColor,
  color: color,
  fontSize: '0.6rem',
  fontWeight: 800,
  padding: '2px 8px',
  borderRadius: '10px'
});

const actionBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent)',
  color: '#ffffff',
  border: 'none',
  padding: '3px 10px',
  borderRadius: '4px',
  fontSize: '0.65rem',
  fontWeight: 800,
  cursor: 'pointer'
};

const emptyProcureStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '20px',
  fontSize: '0.7rem',
  color: 'var(--text-muted)'
};

const vendorsCardStyle: React.CSSProperties = {
  padding: '16px',
  backgroundColor: 'var(--bg-surface)'
};

const vendorRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '8px',
  marginBottom: '8px',
  fontSize: '0.72rem'
};

const vendorNameStyle: React.CSSProperties = {
  fontWeight: 700
};

const vendorDetailsStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: 'var(--text-secondary)',
  marginTop: '1px'
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 99999
};

const modalCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '400px',
  padding: '24px',
  backgroundColor: 'var(--bg-surface-elevated)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const formLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--text-secondary)'
};

const selectFieldStyle: React.CSSProperties = {
  height: '38px',
  border: '1px solid var(--border-light)',
  borderRadius: '6px',
  padding: '0 8px',
  fontSize: '0.8rem',
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-base)',
  outline: 'none'
};

const inputFieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-light)',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontSize: '0.9rem',
};

const adjustBtnStyle: React.CSSProperties = {
  marginLeft: '8px',
  padding: '2px 6px',
  borderRadius: '4px',
  border: '1px solid var(--border-light)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: '0.7rem'
};

const modalBtnRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '8px'
};

const cancelButtonStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: '1px solid var(--border-light)',
  color: 'var(--text-secondary)',
  padding: '6px 14px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 600
};

const submitButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  padding: '6px 14px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 700
};
