const bannerItemStyle: any = {}; const addBannerBtnStyle: any = {}; const tableContainerStyle: any = {}; const panelHeaderStyle: any = {}; const formGroupStyle: any = {}; const btnSubmitStyle: any = {}; const staffItemStyle: any = {}; const panelCardStyle: any = {}; const custCardStyle: any = {}; const emptyStateStyle: any = {};
import React, { useState, useEffect } from 'react';
import './OrderManagement.css';
import { useApp } from '../../../context/AppContext';
import type { Order } from '../../../services/db';
import { UsersService } from '../../../services/api/UsersService';
import { OrdersService } from '../../../services/api/OrdersService';
import { supabase } from '../../../services/api/supabaseClient';
import type { Profile } from '../../../types';
import { Search, Filter, User, Truck, XCircle, RefreshCw, FileText, CheckCircle, MapPin, ShieldAlert, ChevronDown } from 'lucide-react';
import { DataTable } from '../../../components/Admin/DataTable';

export const OrderManagement: React.FC = () => {
  const { orders, refreshData, addToast, isLoadingData, dataLoadError, profiles, substitutions, logisticsTrips } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  
  // Inner Tab Navigation
  const [activeTab, setActiveTab] = useState<'orders' | 'returns'>('orders');

  // Realtime updates
  useEffect(() => {
    const channel = supabase.channel('admin-orders-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          refreshData();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshData]);

  // Invoice generation display state
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);

  // Substitutions state
  const pendingSubs = substitutions.filter(s => s.customer_action === 'pending');

  const handleSubstitutionAction = async (subId: string, action: 'approved' | 'rejected' | 'auto_refund') => {
    try {
      await OrdersService.respondToSubstitution(subId, action);
      refreshData();
      addToast(`Substitution ${action} successfully.`, action === 'approved' ? 'success' : 'info');
    } catch (e: any) {
      addToast(`Failed to update substitution: ${e.message}`, 'error');
    }
  };

  const pickersList = profiles.filter(p => p.role === 'picker');
  const driversList = profiles.filter(p => p.role === 'driver');

  // Computed orders list
  const filteredOrders = orders.filter(o => {
    const idMatch = o.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    o.id.toUpperCase().slice(-6).includes(searchQuery.toUpperCase());
    const nameMatch = o.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const phoneMatch = o.customer_phone?.includes(searchQuery);
    const matchesSearch = idMatch || nameMatch || phoneMatch;

    const matchesFilter = statusFilter === 'all' ? true : o.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  const handleManualAssignPicker = async (orderId: string, pickerId: string) => {
    try {
      await OrdersService.adminAssignPicker(orderId, pickerId);
      refreshData();
      addToast('Picker assigned successfully!', 'success');
    } catch (e: any) {
      addToast(e.message || 'Failed to assign picker', 'error');
    }
  };

  const [isAssigningDriver, setIsAssigningDriver] = useState(false);

  const handleManualAssignDriver = async (orderId: string, driverId: string) => {
    if (isAssigningDriver) return;
    setIsAssigningDriver(true);
    try {
      const { LogisticsService } = await import('../../../services/api/LogisticsService');
      const order = orders.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');
      
      if (order.trip_id) {
        await LogisticsService.reassignTrip(order.trip_id, driverId);
      } else {
        const warehouseId = order.warehouse_id || profiles.find(p => p.role === 'admin')?.warehouse_id || 'wh-1';
        const newTripId = await LogisticsService.createLogisticsTrip(warehouseId, [orderId]);
        await LogisticsService.reassignTrip(newTripId, driverId);
      }
      refreshData();
      addToast('Delivery rider assigned via logistics trip!', 'success');
    } catch (e: any) {
      addToast(e.message || 'Failed to assign driver', 'error');
    } finally {
      setIsAssigningDriver(false);
    }
  };

  const handleCancelAndRefund = async (orderId: string) => {
    if (!window.confirm('Are you sure you want to CANCEL this order and refund the entire payment to the customer wallet?')) return;
    
    const found = orders.find(o => o.id === orderId);
    if (found && found.status !== 'cancelled') {
      try {
        await OrdersService.adminCancelOrder(orderId, 'Admin explicit cancellation');
        refreshData();
        setSelectedOrderId(null);
        addToast(`Order #${orderId.slice(-6).toUpperCase()} cancelled securely.`, 'success');
      } catch (e: any) {
        console.error(e);
        addToast(e.message || 'Error processing cancellation and refund', 'error');
      }
    }
  };

  return (
    <div className="container">
      {isLoadingData && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-base)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw className="spin" size={32} style={{ marginBottom: '16px', color: 'var(--primary)' }} />
          <h3 style={{ color: 'var(--text-primary)' }}>Loading Orders...</h3>
        </div>
      )}
      {dataLoadError && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-base)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldAlert size={48} style={{ marginBottom: '16px', color: 'var(--accent-red)' }} />
          <h3 style={{ color: 'var(--accent-red)' }}>Connection Error</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{dataLoadError}</p>
          <button onClick={refreshData} style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent-red)', color: 'white', cursor: 'pointer' }}>Retry</button>
        </div>
      )}
      {/* Module Inner Navigation */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', padding: '4px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)', width: 'max-content' }}>
        <button 
          onClick={() => setActiveTab('orders')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'orders' ? 'var(--primary)' : 'transparent', color: activeTab === 'orders' ? '#fff' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          Active Orders
        </button>
      </div>

      {activeTab === 'orders' && (
        <>
          <div className="header-action-row">
            {/* Search controls */}
        {/* Search and Filters are handled by DataTable */}
      </div>

      {pendingSubs.length > 0 && (
        <div style={{...tableContainerStyle, borderColor: 'var(--accent-red)'}} className="glass-panel">
          <div style={{...panelHeaderStyle, color: 'var(--accent-red)'}}>
            <ShieldAlert size={18} /> Exception Handling: Pending Customer Substitutions ({pendingSubs.length})
          </div>
          <div style={{ marginTop: '16px' }}>
            <DataTable
              data={pendingSubs}
              keyExtractor={s => s.id}
              columns={[
                { key: 'order_id', header: 'ORDER REF', sortable: true, render: r => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{r.order_id.slice(-6).toUpperCase()}</span> },
                { key: 'original_item_id', header: 'ORIGINAL ITEM ID', sortable: true },
                { key: 'suggested_product', header: 'SUGGESTED REPLACEMENT', render: r => (
                  r.suggested_product ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img src={r.suggested_product.image_url} alt="" style={{width: '24px', height: '24px', borderRadius: '4px'}} />
                      <span>{r.suggested_product.name} (₹{r.suggested_product.price})</span>
                    </div>
                  ) : <span>Unknown Product</span>
                )},
                { key: 'status', header: 'STATUS', render: () => (
                  <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 900, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    WAITING FOR SMS
                  </span>
                )},
                { key: 'actions', header: 'SIMULATE CUSTOMER RESPONSE', render: r => (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleSubstitutionAction(r.id, 'approved')} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', backgroundColor: '#10b981', color: 'white', border: 'none'}}>Approve Swap</button>
                    <button onClick={() => handleSubstitutionAction(r.id, 'rejected')} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', backgroundColor: 'var(--accent-red)', color: 'white', border: 'none'}}>Reject (Refund)</button>
                  </div>
                )}
              ]}
            />
          </div>
        </div>
      )}

      <div className="order-layout-grid">
        
        {/* Orders List Table Card */}
        <div style={{ flex: '1.2' }}>
          <DataTable
            data={orders}
            exportable={false}
            dateFilterMode="single"
            filterableColumns={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { label: 'Pending', value: 'placed' },
                  { label: 'Confirmed', value: 'confirmed' },
                  { label: 'Picking', value: 'picking' },
                  { label: 'Packing', value: 'packed' },
                  { label: 'Ready for Dispatch', value: 'ready' },
                  { label: 'Out for Delivery', value: 'out_for_delivery' },
                  { label: 'Delivered', value: 'delivered' },
                  { label: 'Cancelled', value: 'cancelled' },
                  { label: 'Returned', value: 'returned' }
                ]
              }
            ]}
            searchPlaceholder="Search orders by ID, name, or phone..."
            keyExtractor={o => o.id}
            onRowClick={o => setSelectedOrderId(o.id)}
            selectedRowId={selectedOrderId || undefined}
            columns={[
              { key: 'id', header: 'ORDER ID', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{r.id.toUpperCase().slice(-6)}</span> },
              { key: 'customer_name', header: 'CUSTOMER', sortable: true, render: (r) => <div><div style={{ fontWeight: 700 }}>{r.customer_name}</div><div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{r.customer_phone}</div></div> },
              { key: 'total_amount', header: 'TOTAL', sortable: true, render: (r) => <span style={{ fontWeight: 800 }}>₹{Number(r.total_amount).toFixed(2)}</span> },
              { key: 'staff', header: 'STAFF HANDLERS', render: (r) => <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}><div>Picker: {r.picker_name || 'Unassigned'}</div><div>Rider: {r.driver_name || 'Unassigned'}</div></div> },
              { key: 'payment', header: 'PAYMENT TYPE', render: () => <span className="admin-badge-success">ONLINE PAY</span> },
              { key: 'status', header: 'STATUS', sortable: true, render: (r) => <span className={`admin-badge-${r.status === 'delivered' ? 'success' : 'info'}`}>{r.status.toUpperCase()}</span> }
            ]}
          />
        </div>

        {/* Detailed Side Action Panel / Inspection Drawer */}
        <div className="inspection-container">
          {selectedOrder ? (
            <div className=" ">
              <div className="drawer-header">
                <div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Order ID: #{selectedOrder.id.toUpperCase().slice(-6)}
                    {selectedOrder.status === 'delivered' ? (
                      <span className="status-badge status-active" style={{ fontSize: '0.65rem' }}>OTP Verified</span>
                    ) : selectedOrder.status === 'out_for_delivery' ? (
                      <span className="status-badge status-pending" style={{ fontSize: '0.65rem' }}>OTP Pending</span>
                    ) : null}
                  </h3>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    Received at: {new Date(selectedOrder.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <button onClick={() => setInvoiceOrder(selectedOrder)} className="invoice-btn" title="Generate PDF Invoice">
                  <FileText size={14} /> Invoice
                </button>
              </div>

              {/* Order Timeline Visual Flow */}
              <div className="timeline-container">
                <div className="timeline-header">Event Lifecycle Timeline</div>
                <div className="timeline-track" style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                  {selectedOrder.events && selectedOrder.events.length > 0 ? (
                    selectedOrder.events.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((evt: any, idx: number) => (
                      <div key={idx} className="timeline-step" style={{ minWidth: '80px', flexShrink: 0 }}>
                        <div style={stepCircleStyle(true)}>{idx + 1}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '4px' }}>
                          <span style={stepLabelStyle(true)}>{evt.event_type.replace(/_/g, ' ').toUpperCase()}</span>
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{new Date(evt.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', padding: '12px 0' }}>No lifecycle events available.</div>
                  )}
                </div>
              </div>

              {/* Items Summary list */}
              <div className="items-list-card">
                <div className="timeline-header">Items Snapshot Checklist</div>
                <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="item-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {item.product_image_snapshot && (
                          <img src={item.product_image_snapshot} alt="product" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.product_name_snapshot || item.product?.name || 'Unknown product'}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                            SKU: {item.sku_snapshot || item.product?.sku}
                            {item.manufacturer_barcode_snapshot && ` | EAN: ${item.manufacturer_barcode_snapshot}`}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800 }}>₹{(Number(item.price) * item.quantity).toFixed(2)}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                          Qty: {item.quantity} {item.status === 'picked' ? '✓' : item.status === 'out_of_stock' ? '✕' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Panels: picker allocation & driver allocation */}
              {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'payment_failed' && (
                <div className="allocation-row">
                  {/* Picker assignment */}
                  <div className="action-block">
                    <label className="action-label"><User size={12} /> Assign Picker</label>
                    <select 
                      value={selectedOrder.picker_id || ''}
                      onChange={e => handleManualAssignPicker(selectedOrder.id, e.target.value)}
                      className="select-action-field"
                      disabled={selectedOrder.status !== 'placed'}
                    >
                      <option value="">Choose Store Picker</option>
                      {pickersList.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Rider assignment */}
                  <div className="action-block">
                    <label className="action-label"><Truck size={12} /> Assign Delivery Rider</label>
                    <select 
                      value={selectedOrder.driver_id || ''}
                      onChange={e => handleManualAssignDriver(selectedOrder.id, e.target.value)}
                      className="select-action-field"
                      disabled={selectedOrder.status !== 'packed'}
                    >
                      <option value="">Choose Courier Rider</option>
                      {driversList.map(d => (
                        <option key={d.id} value={d.id}>{d.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Cancel dispute buttons row */}
              <div className="footer-btn-row">
                <button onClick={() => handleCancelAndRefund(selectedOrder.id)} className="cancel-order-btn">
                  <XCircle size={14} /> Cancel & Refund Wallet
                </button>
              </div>
            </div>
          ) : (
            <div className=" ">
              <Search size={32} color="var(--text-muted)" />
              <h4>Order Dispatch Desk</h4>
              <p>Select any active order from the general control board to allocate riders, reassign dark stores, or manage timelines.</p>
            </div>
          )}
        </div>

      </div>

      {/* Visual PDF Invoice Generator Modal */}
      {invoiceOrder && (
        <div className="invoice-modal-overlay">
          <div className=" ">
            <div className="invoice-modal-header">
              <h3>FLASHGO RETAIL INVOICE</h3>
              <button onClick={() => setInvoiceOrder(null)} className="close-invoice-btn">✕ CLOSE</button>
            </div>

            <div className="invoice-body">
              <div className="invoice-row-split">
                <div>
                  <strong>Billed To:</strong>
                  <div>{invoiceOrder.customer_name}</div>
                  <div>Phone: {invoiceOrder.customer_phone}</div>
                  <div>Address: {invoiceOrder.delivery_address}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>Invoice Details:</strong>
                  <div>ID: #{invoiceOrder.id.toUpperCase().slice(-8)}</div>
                  <div>Date: {new Date(invoiceOrder.created_at).toLocaleDateString()}</div>
                  <div>Payment: online (credit_wallet)</div>
                </div>
              </div>

              <hr className="invoice-divider" />

              <table className="invoice-table">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <th className="inv-th">GROCERY ITEM</th>
                    <th className="inv-th">PRICE</th>
                    <th className="inv-th">QTY</th>
                    <th className=" ">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceOrder.items?.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td className="inv-td">{item.product?.name}</td>
                      <td className="inv-td">₹{Number(item.price).toFixed(2)}</td>
                      <td className="inv-td">{item.quantity}</td>
                      <td className=" ">₹{(Number(item.price) * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="invoice-sum">
                <div className="invoice-sum-row">
                  <span>Subtotal:</span>
                  <span>₹{(Number(invoiceOrder.total_amount) - invoiceOrder.delivery_fee + invoiceOrder.discount_amount).toFixed(2)}</span>
                </div>
                <div className="invoice-sum-row">
                  <span>Delivery Fee:</span>
                  <span>₹{Number(invoiceOrder.delivery_fee).toFixed(2)}</span>
                </div>
                <div className="invoice-sum-row">
                  <span>Voucher Discount:</span>
                  <span style={{ color: 'var(--danger)' }}>-₹{Number(invoiceOrder.discount_amount).toFixed(2)}</span>
                </div>
                <div className="invoice-total-row">
                  <span>TOTAL Billed:</span>
                  <span>₹{Number(invoiceOrder.total_amount).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <button onClick={() => window.print()} className="print-invoice-btn">
              Print Invoice Receipt Slip
            </button>
          </div>
        </div>
      )}
      </>
      )}


    </div>
  );
};

// --- STYLING SPECIFICATIONS ---


























const tableRowStyle = (selected: boolean): React.CSSProperties => ({
  borderBottom: '1px solid var(--border-light)',
  cursor: 'pointer',
  backgroundColor: selected ? 'var(--primary-glow)' : 'transparent',
  transition: 'background-color var(--transition-fast)',
});





const statusBadgeStyle = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; text: string }> = {
    placed: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--accent)' },
    picking: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--primary)' },
    packed: { bg: 'rgba(124, 58, 237, 0.15)', text: 'hsl(262, 70%, 54%)' },
    out_for_delivery: { bg: 'rgba(239, 68, 68, 0.15)', text: 'var(--danger)' },
    delivered: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
    cancelled: { bg: 'var(--border-light)', text: 'var(--text-muted)' },
  };
  const c = colors[status] || { bg: 'var(--border-light)', text: 'var(--text-secondary)' };
  return {
    backgroundColor: c.bg,
    color: c.text,
    fontSize: '0.62rem',
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: '4px',
  };
};



















const stepCircleStyle = (active: boolean): React.CSSProperties => ({
  width: '20px',
  height: '20px',
  borderRadius: '50%',
  backgroundColor: active ? 'var(--primary)' : 'var(--border-light)',
  color: active ? '#ffffff' : 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.62rem',
  fontWeight: 800,
  transition: 'all var(--transition-fast)',
});

const stepLabelStyle = (active: boolean): React.CSSProperties => ({
  fontSize: '0.58rem',
  fontWeight: 800,
  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
});

















const overrideBtnStyle = (color: string): React.CSSProperties => ({
  backgroundColor: color + '15',
  color: color,
  border: `1px solid ${color}`,
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '0.72rem',
  fontWeight: 750,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flex: 1,
  justifyContent: 'center',
});






































