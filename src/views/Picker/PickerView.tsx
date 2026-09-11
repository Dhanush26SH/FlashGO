import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ShoppingBag, Search, CheckCircle, Package, AlertCircle, Phone, Navigation, Barcode, Camera } from 'lucide-react';
import { supabase } from '../../services/api/supabaseClient';
import { NotificationCenter } from '../../components/NotificationCenter';
import './PickerView.css';

import { WorkSlotScheduler } from '../../components/WorkSlotScheduler';

export const PickerView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'console' | 'schedule'>('console');
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button 
          onClick={() => setActiveTab('console')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'console' ? 'var(--primary)' : 'var(--bg-surface)', color: activeTab === 'console' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Picking Console
        </button>
        <button 
          onClick={() => setActiveTab('schedule')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'schedule' ? 'var(--primary)' : 'var(--bg-surface)', color: activeTab === 'schedule' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          My Schedule
        </button>
      </div>
      {activeTab === 'console' ? <PickerConsole /> : <WorkSlotScheduler />}
    </div>
  );
};

const PickerConsole: React.FC = () => {
  const { orders, currentUser, assignPicker, pickItem, completePicking, proposeSubstitution, substitutions, products, addToast } = useApp();
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  
  // Barcode Scanner Simulator visual controllers
  const [scanningItemId, setScanningItemId] = useState<string | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scanError, setScanError] = useState('');

  // Substitution state
  const [proposingSubItemId, setProposingSubItemId] = useState<string | null>(null);
  const [subTimer, setSubTimer] = useState<number | null>(null);
  
  // Loading state
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Filter orders that are either placed (unassigned) or currently being picked by this picker
  const unassignedOrders = orders.filter(o => o.status === 'placed');
  const myAssignedOrders = orders.filter(o => o.picker_id === currentUser?.id && (o.status === 'picking' || o.status === 'placed'));
  
  const activeOrder = orders.find(o => o.id === activeOrderId);

  React.useEffect(() => {
    let interval: any;
    if (subTimer !== null && subTimer > 0) {
      interval = setInterval(() => {
        setSubTimer(t => (t !== null && t > 1 ? t - 1 : null));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [subTimer]);

  // --- Assign Order to Self ---
  const handleClaimOrder = async (orderId: string) => {
    if (currentUser) {
      setIsActionLoading(true);
      try {
        await assignPicker(orderId, currentUser.id);
        setActiveOrderId(orderId);
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  // --- Barcode Scanner Simulation Beep ---
  const handleOpenScanner = (itemId: string) => {
    setScanningItemId(itemId);
    setScannedBarcode('');
    setScanError('');
  };

  const handleSimulateScan = async (expectedBarcode: string, quantity: number, itemId: string) => {
    if (scannedBarcode === expectedBarcode) {
      // Success! Pick the item
      setIsActionLoading(true);
      try {
        const { supabase } = await import('../../services/api/supabaseClient');
        if (supabase && activeOrderId && currentUser) {
          const { OrdersService } = await import('../../services/api/OrdersService');
          const warehouseId = currentUser.warehouse_id;
          if (!warehouseId) {
            throw new Error('No warehouse assigned to your profile');
          }
          await OrdersService.pickFefoItem(warehouseId, itemId, quantity, activeOrderId, currentUser.id);
        }
        await pickItem(activeOrderId!, itemId, quantity, false);
        setScanningItemId(null);
      } catch (err: any) {
        console.error(err);
        addToast(err.message || 'Failed to consume FEFO stock. Insufficient inventory?', 'error');
      } finally {
        setIsActionLoading(false);
      }
    } else {
      setScanError(`Barcode mismatch. Expected: ${expectedBarcode}`);
    }
  };

  const handleOpenSubModal = (itemId: string) => {
    setProposingSubItemId(itemId);
  };



  return (
    <div className="picker-container">
      <header className="picker-header glass-panel">
        <div>
          <h2 className="text-primary font-bold">⚡ FlashGO Picker Console</h2>
          <p className="text-secondary text-sm">Welcome back, {currentUser?.full_name || 'Picker'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <NotificationCenter />
          <span className="role-badge">STORE STAFF</span>
        </div>
      </header>

      <div className="picker-grid">
        {/* Left Column: Job Queue */}
        <div className="picker-col">
          <div className="panel-header">Assigned & Placed Orders</div>

          {myAssignedOrders.length > 0 && (
            <div className="task-section">
              <div className="section-title">Your Active Tasks</div>
              {myAssignedOrders.map(o => (
                <div 
                  key={o.id} 
                  onClick={() => setActiveOrderId(o.id)}
                  className={`task-card assigned ${o.id === activeOrderId ? 'active' : ''}`}
                >
                  <div className="task-header">
                    <span className="task-title">Order #{o.id.toUpperCase().slice(-6)}</span>
                    <span className="active-badge">PICKING</span>
                  </div>
                  <div className="task-meta">Address: {o.delivery_address}</div>
                  <div className="task-footer">
                    <span>{(o.items || []).length} items</span>
                    <span className="text-primary font-bold">Open Checklist →</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="task-section">
            <div className="section-title">Unassigned Job Board (FIFO)</div>
            {unassignedOrders.length > 0 ? (
              unassignedOrders.map(o => (
                <div key={o.id} className="task-card">
                  <div className="task-header">
                    <span className="task-title">Order #{o.id.toUpperCase().slice(-6)}</span>
                    <span className="pending-badge">UNCLAIMED</span>
                  </div>
                  <div className="task-meta">Address: {o.delivery_address}</div>
                  <div className="task-footer">
                    <span>{(o.items || []).length} items • ₹{Number(o.total_amount).toFixed(2)}</span>
                    <button 
                      onClick={() => handleClaimOrder(o.id)}
                      className="claim-btn"
                    >
                      Accept Job
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-jobs">
                <Package size={28} color="var(--text-muted)" />
                <div>No pending orders. All baskets picked!</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Picking Checklist & Actions */}
        <div className="picker-col">
          <div className="panel-header">Checklist & Barcode Operations</div>

          {activeOrder ? (
            <div className="checklist-card glass-panel">
              <div className="checklist-header">
                <div>
                  <h3 className="text-primary font-bold">Checklist for Order #{activeOrder.id.toUpperCase().slice(-6)}</h3>
                  <div className="checklist-sub">Match inventory SKUs, scan barcodes, and bag securely.</div>
                </div>
                {activeOrder.status === 'picking' && (
                  <button 
                    onClick={async () => {
                      setIsActionLoading(true);
                      try {
                        await completePicking(activeOrder.id, currentUser!.id);
                        setActiveOrderId(null);
                        addToast('Order picking completed and sent to packing!', 'success');
                      } catch (err: any) {
                        addToast(err.message || 'Failed to complete picking', 'error');
                      } finally {
                        setIsActionLoading(false);
                      }
                    }}
                    className={`pack-trigger-btn ${(activeOrder.items || []).every(i => i.status !== 'pending') ? 'all-done' : ''}`}
                    disabled={!(activeOrder.items || []).every(i => i.status !== 'pending')}
                  >
                    Complete Picking
                  </button>
                )}
              </div>

              {/* Items List (Walkpath Sorted) */}
              <div className="items-container">
                {(() => {
                  const sortedItems = [...(activeOrder.items || [])].sort((a, b) => {
                    const locA = a.product?.warehouse_location || '';
                    const locB = b.product?.warehouse_location || '';
                    return locA.localeCompare(locB);
                  });

                  return sortedItems.map(item => {
                    const isPending = item.status === 'pending';
                    const isPicked = item.status === 'picked';
                    const isOos = item.status === 'out_of_stock';
                    const itemSub = substitutions.find(s => s.order_id === activeOrder.id && s.original_item_id === item.id);

                    return (
                      <div key={item.id} className={`item-row ${isPicked ? 'picked' : ''} ${isOos ? 'oos' : ''}`}>
                        <div className="flex flex-col gap-1 flex-grow">
                          <div className={`item-name ${isPicked ? 'picked' : ''} ${isOos ? 'oos' : ''}`}>{item.product?.name || 'Loading product...'}</div>
                          <div className="item-details">
                            <span>SKU: {item.product?.sku}</span> | 
                            <span className="text-accent font-bold"> Aisle-Shelf: {item.product?.warehouse_location}</span>
                          </div>
                          <div className="text-muted text-xs">Qty Required: {item.quantity}</div>
                          {itemSub && itemSub.customer_action === 'pending' && (
                            <div className="text-accent font-bold text-xs">
                              ⏳ Pending client approval for substitute: {itemSub.suggested_product?.name}
                            </div>
                          )}
                        </div>

                        <div className="action-col">
                          {isPending && (
                            <button 
                              onClick={() => handleOpenScanner(item.id)}
                              className="scan-trigger-btn"
                            >
                              <Barcode size={14} /> Scan Barcode
                            </button>
                          )}
                          {isPicked && (
                            <span className="status-label success">✓ PICKED ({item.picked_quantity})</span>
                          )}
                          {isOos && (
                            <span className="status-label danger">⚡ OUT OF STOCK</span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Barcode scanner simulator overlay */}
              {scanningItemId && (
                <div className="scanner-overlay">
                  <div className="scanner-card glass-panel animate-slide-up">
                    <div className="scanner-header">
                      <h4 className="flex items-center gap-2">
                        <Camera size={16} color="var(--primary)" /> Barcode Verification Laser
                      </h4>
                      <button onClick={() => setScanningItemId(null)} className="close-scan-btn">✕</button>
                    </div>

                    {(() => {
                      const item = (activeOrder.items || []).find(i => i.id === scanningItemId);
                      if (!item || !item.product) return null;

                      return (
                        <div className="scanner-content">
                          <div className="scanned-prompt">
                            Scan the SKU barcode for: <strong className="text-primary">{item.product.name}</strong>
                          </div>
                          <div className="scanner-details-box">
                            <div>EXPECTED CODE: {item.product.barcode}</div>
                            <div>LOCATION: {item.product.warehouse_location}</div>
                          </div>

                          <div className="scan-input-group">
                            <input
                              type="text"
                              placeholder="Point laser or type code..."
                              value={scannedBarcode}
                              onChange={e => setScannedBarcode(e.target.value)}
                              className="scan-input-field"
                            />
                            <button
                              onClick={() => handleSimulateScan(item.product!.barcode, item.quantity, item.id)}
                              className="beep-btn"
                            >
                              BEEP
                            </button>
                          </div>
                          {scanError && <div className="scan-error">{scanError}</div>}

                          <div className="oos-divider">- OR -</div>

                          <button 
                            onClick={() => handleOpenSubModal(item.id)}
                            className="oos-btn"
                          >
                            Suggest Substitution Alternative
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Substitution Suggestion Modal overlay */}
              {proposingSubItemId && (
                <div className="scanner-overlay">
                  <div className="scanner-card glass-panel animate-slide-up">
                    <div className="scanner-header">
                      <h4 className="text-lg font-bold">Suggest Substitution Alternative</h4>
                      <button onClick={() => setProposingSubItemId(null)} className="close-scan-btn">✕</button>
                    </div>

                    {(() => {
                      const originalItem = (activeOrder.items || []).find(i => i.id === proposingSubItemId);
                      if (!originalItem || !originalItem.product) return null;

                      // Suggest products in the same category
                      const suggestions = products.filter(
                        p => p.category_id === originalItem.product?.category_id && p.id !== originalItem.product_id
                      );

                      return (
                        <div className="scanner-content">
                          <div className="text-secondary text-sm">
                            Select replacement for: <strong>{originalItem.product.name}</strong>
                          </div>

                          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                            {suggestions.length === 0 ? (
                              <div className="text-muted text-sm">No alternative products found in this category.</div>
                            ) : (
                              suggestions.map(p => (
                                <button
                                  key={p.id}
                                  onClick={async () => {
                                    setIsActionLoading(true);
                                    try {
                                      await proposeSubstitution(
                                        activeOrder.id, 
                                        originalItem.product_id, 
                                        p.id, 
                                        Math.max(1, originalItem.quantity - originalItem.picked_quantity), 
                                        originalItem.id
                                      );
                                      setProposingSubItemId(null);
                                      setScanningItemId(null);
                                      setSubTimer(60);
                                    } finally {
                                      setIsActionLoading(false);
                                    }
                                  }}
                                  disabled={isActionLoading}
                                  className={`flex justify-between p-2 bg-base border border-light rounded text-primary text-sm cursor-pointer ${isActionLoading ? 'opacity-50' : ''}`}
                                >
                                  <span>{p.name}</span>
                                  <span className="font-bold">₹{p.price.toFixed(2)}</span>
                                </button>
                              ))
                            )}
                          </div>

                          <button
                            onClick={() => {
                              pickItem(activeOrder.id, originalItem.id, 0, true);
                              setProposingSubItemId(null);
                              setScanningItemId(null);
                            }}
                            className="oos-btn"
                          >
                            No substitute (Auto-Refund)
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}


            </div>
          ) : (
            <div className="no-checklist glass-panel">
              <Package size={48} color="var(--text-muted)" />
              <h4>No Checklist Selected</h4>
              <p>Claim an order from the FIFQ Job Queue or click on an assigned active order to initiate picking.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

