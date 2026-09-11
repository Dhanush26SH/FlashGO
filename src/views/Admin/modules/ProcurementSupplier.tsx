const bannerItemStyle: any = {}; const addBannerBtnStyle: any = {}; const tableContainerStyle: any = {}; const panelHeaderStyle: any = {}; const formGroupStyle: any = {}; const btnSubmitStyle: any = {}; const staffItemStyle: any = {}; const panelCardStyle: any = {}; const custCardStyle: any = {}; const emptyStateStyle: any = {};
import React, { useState, useEffect } from 'react';
import './ProcurementSupplier.css';
import { useApp } from '../../../context/AppContext';
import type { Vendor, ProcurementOrder, Product } from '../../../services/db';
import { ProductsService } from '../../../services/api/ProductsService';
import { ProcurementService } from '../../../services/api/ProcurementService';
import { VendorsService } from '../../../services/api/VendorsService';
import { AdminService } from '../../../services/api/AdminService';
import { supabase } from '../../../services/api/supabaseClient';
import { Plus, CheckCircle, Package, Trash, AlertCircle } from 'lucide-react';
import { DataTable } from '../../../components/Admin/DataTable';

export const ProcurementSupplier: React.FC = () => {
  const { addToast, currentUser } = useApp();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorData, setNewVendorData] = useState({ name: '', contact_person: '', email: '', phone: '', address: 'N/A' });
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState<'suppliers_po' | 'traceability' | 'qc' | 'contracts'>('suppliers_po');
  
  const [showNewPO, setShowNewPO] = useState(false);
  const [poVendor, setPoVendor] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receivingPO, setReceivingPO] = useState<ProcurementOrder | null>(null);
  const [batchInputs, setBatchInputs] = useState<Record<string, { batch_number: string, expiry_date: string, accepted_quantity: number, rejected_quantity: number }>>({});
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [vendorProducts, setVendorProducts] = useState<any[]>([]); // New state for mapped products
  const [vendorSearch, setVendorSearch] = useState('');
  const [traceSearch, setTraceSearch] = useState('');
  
  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(vendorSearch.toLowerCase()) || 
    v.email.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    v.phone.includes(vendorSearch)
  );
  
  const loadData = () => {
    ProductsService.getProducts().then(setProducts).catch(console.error);
    VendorsService.getVendors().then(setVendors).catch(console.error);
    ProcurementService.getProcurementOrders().then(setOrders).catch(console.error);
    if (currentUser?.role === 'admin') {
      AdminService.getWarehouses().then(setWarehouses).catch(console.error);
    }
    if (currentUser?.role === 'admin' || currentUser?.warehouse_id) {
      ProcurementService.getBatchTraceability(currentUser?.warehouse_id).then(setBatches).catch(console.error);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to procurement_orders changes
    const subscription = supabase
      .channel('procurement_orders_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'procurement_orders' }, () => {
        ProcurementService.getProcurementOrders().then(setOrders).catch(console.error);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const [poItems, setPoItems] = useState<{ product_id: string; quantity: number; cost_per_unit: number; product_name?: string }[]>([]);
  
  // Fetch vendor mapped products when poVendor changes
  useEffect(() => {
    if (poVendor) {
      ProcurementService.getVendorProducts(poVendor).then(setVendorProducts).catch(console.error);
    } else {
      setVendorProducts([]);
    }
    // Also clear PO items when vendor changes to prevent invalid cross-vendor lists
    setPoItems([]);
    setSelectedProduct('');
    setBarcodeInput('');
    setItemQuantity('');
    setItemCost('');
  }, [poVendor]);

  const [selectedProduct, setSelectedProduct] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemCost, setItemCost] = useState('');

  // Auto-select product if barcode matches
  // eslint-disable-next-line react-compiler/react-compiler
  React.useEffect(() => {
    if (barcodeInput.trim().length >= 5 && poVendor) {
      const match = products.find(p => p.barcode === barcodeInput.trim() || p.sku === barcodeInput.trim());
      if (match) {
        setSelectedProduct(match.id);
        setItemCost((match.price * 0.70).toFixed(2));
      }
    }
  }, [barcodeInput, products, poVendor]);

  // Return ONLY active products mapped to the selected vendor
  const getFilteredProducts = () => {
    if (!poVendor) return [];
    // Only return products that exist in vendorProducts and are active
    const mappedIds = new Set(vendorProducts.map(vp => vp.product_id));
    return products.filter(p => p.is_active && mappedIds.has(p.id));
  };
  const filteredProducts = getFilteredProducts();

  const handleAddItem = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedProduct || !itemQuantity || !itemCost) return;
    const p = products.find(prod => prod.id === selectedProduct);
    if (!p) return;
    
    setPoItems(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      quantity: Number(itemQuantity),
      cost_per_unit: Number(itemCost)
    }]);
    
    setSelectedProduct('');
    setItemQuantity('');
    setItemCost('');
    setBarcodeInput('');
  };
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);

  const handleRemoveItem = (index: number) => {
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poVendor || poItems.length === 0) {
      addToast('Please select a vendor and add at least one item', 'error');
      return;
    }
    
    const targetWarehouse = currentUser?.warehouse_id || selectedWarehouse;
    if (!targetWarehouse) {
      addToast('Please select a receiving warehouse', 'error');
      return;
    }
    
    setConfirmModal({
      isOpen: true,
      title: 'Generate Purchase Order',
      message: 'Are you sure you want to generate a PO for this vendor?',
      onConfirm: async () => {
        setConfirmModal(null);
        setIsSubmitting(true);
        try {
          const totalCost = poItems.reduce((sum, i) => sum + i.quantity * i.cost_per_unit, 0);
          if (!targetWarehouse) throw new Error('No warehouse selected.');
          await ProcurementService.createProcurementOrder(poVendor, totalCost, targetWarehouse, poItems);
          const updated = await ProcurementService.getProcurementOrders();
          setOrders(updated);
          
          // Clear form on success
          setShowNewPO(false);
          setPoVendor('');
          setPoItems([]);
          addToast('Purchase Order generated successfully', 'success');
        } catch (e: any) {
          addToast(`Failed to create PO: ${e.message}`, 'error');
          return;
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  const handleApprovePO = async (id: string) => {
    try {
      await ProcurementService.approveProcurementOrder(id);
      const updated = await ProcurementService.getProcurementOrders();
      setOrders(updated);
      addToast('PO Approved and sent to vendor', 'success');
    } catch (e: any) {
      addToast(`Failed to approve PO: ${e.message}`, 'error');
    }
  };


  const promptReceiveStock = (po: ProcurementOrder) => {
    setReceivingPO(po);
    const inputs: Record<string, { batch_number: string, expiry_date: string, accepted_quantity: number, rejected_quantity: number }> = {};
    if (po.items) {
      po.items.forEach(i => {
        const remaining = i.quantity - (i.received_quantity || 0);
        inputs[i.product_id] = {
          batch_number: '',
          expiry_date: '',
          accepted_quantity: remaining > 0 ? remaining : 0,
          rejected_quantity: 0
        };
      });
    }
    setBatchInputs(inputs);
    setReceiptNumber(`GRN-${Date.now().toString().slice(-6)}`);
    setReceiptNotes('');
  };

  const confirmReceiveStock = async () => {
    if (!receivingPO) return;
    if (!receiptNumber) {
      addToast('Receipt Number is required', 'error');
      return;
    }
    
    // Validate inputs
    const batches: any[] = [];
    if (receivingPO.items) {
      for (const item of receivingPO.items) {
        const input = batchInputs[item.product_id];
        if (!input) continue;
        
        const totalReceived = input.accepted_quantity + input.rejected_quantity;
        if (totalReceived > 0) {
          if (input.accepted_quantity > 0 && (!input.batch_number || !input.expiry_date)) {
            addToast('Please fill batch details for accepted items', 'error');
            return;
          }
          const remaining = item.quantity - (item.received_quantity || 0);
          if (totalReceived > remaining) {
            addToast(`Cannot receive more than remaining ordered quantity for product ${item.product_id}`, 'error');
            return;
          }
          batches.push({
            procurement_order_item_id: item.id,
            product_id: item.product_id,
            batch_number: input.batch_number,
            expiry_date: input.expiry_date || null,
            accepted_quantity: input.accepted_quantity,
            rejected_quantity: input.rejected_quantity,
            unit_cost: item.cost_per_unit
          });
        }
      }
    }

    if (batches.length === 0) {
      addToast('Please receive at least one item', 'error');
      return;
    }

    try {
      if (!currentUser) throw new Error('Not authenticated.');
      
      await ProcurementService.receiveProcurementOrder(receivingPO.id, (receivingPO as any).warehouse_id, currentUser.id, receiptNumber, receiptNotes, batches);
      const updated = await ProcurementService.getProcurementOrders();
      setOrders(updated);
      addToast('Stock inwarded to inventory successfully', 'success');
      setReceivingPO(null);
    } catch (err: any) {
      addToast(`Failed to receive stock: ${err.message}`, 'error');
    }
  };

  const handleCancelPO = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Purchase Order',
      message: 'Are you sure you want to cancel this Purchase Order?',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await ProcurementService.cancelProcurementOrder(id);
          const updated = await ProcurementService.getProcurementOrders();
          setOrders(updated);
          addToast('Purchase Order cancelled successfully', 'success');
        } catch (e: any) {
          addToast(`Failed to cancel PO: ${e.message}`, 'error');
        }
      }
    });
  };

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorData.name || !newVendorData.email) {
      addToast('Name and Email are required', 'error');
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Register Vendor',
      message: `Are you sure you want to register vendor ${newVendorData.name}?`,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsSubmitting(true);
        try {
          await VendorsService.createVendor(newVendorData);
          const updated = await VendorsService.getVendors();
          setVendors(updated);
        } catch (e: any) {
          addToast(`Failed to register vendor: ${e.message}`, 'error');
          setIsSubmitting(false);
          return;
        } finally {
          setIsSubmitting(false);
          setShowNewVendor(false);
          setNewVendorData({ name: '', contact_person: '', email: '', phone: '', address: 'N/A' });
          addToast('Vendor registered successfully', 'success');
        }
      }
    });
  };

  return (
    <div className="container">
      <div className=" ">
        <div>
          <h2 className="title">B2B Procurement & Suppliers</h2>
          <p className="subtitle">Manage vendor catalogs, issue purchase orders, and process inward warehouse stock.</p>
        </div>
        <Package size={36} color="var(--primary)" />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', padding: '4px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)', width: 'max-content', overflowX: 'auto' }}>
        {[
          { id: 'suppliers_po', label: 'Suppliers & Purchase Orders' },
          { id: 'traceability', label: 'Batch Traceability' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === tab.id ? 'var(--primary)' : 'transparent', color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'suppliers_po' && (
      <div className="grid">
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header" style={{ flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <h3 className="panel-title" style={{ whiteSpace: 'nowrap', fontSize: '1.1rem', margin: 0 }}>Vendor Directory</h3>
            <button onClick={() => setShowNewVendor(!showNewVendor)} className="btn-primary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Plus size={14} /> New Vendor
            </button>
          </div>

          {showNewVendor && (
            <div style={{flexDirection: 'column', alignItems: 'stretch', marginBottom: '16px'}}>
              <form onSubmit={handleCreateVendor} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">Vendor Name</label>
                  <input className="input" value={newVendorData.name} onChange={e => setNewVendorData({...newVendorData, name: e.target.value})} placeholder="e.g. Parle Products" required />
                </div>
                <div className="form-group">
                  <label className="label">Contact Person</label>
                  <input className="input" value={newVendorData.contact_person} onChange={e => setNewVendorData({...newVendorData, contact_person: e.target.value})} placeholder="e.g. Rahul Sharma" required />
                </div>
                <div className="form-group">
                  <label className="label">Email</label>
                  <input type="email" className="input" value={newVendorData.email} onChange={e => setNewVendorData({...newVendorData, email: e.target.value})} placeholder="e.g. sales@parle.com" required />
                </div>
                <div className="form-group">
                  <label className="label">Phone</label>
                  <input className="input" value={newVendorData.phone} onChange={e => setNewVendorData({...newVendorData, phone: e.target.value})} placeholder="e.g. +91 9876543210" required />
                </div>
                <button type="submit" className="btn-submit" disabled={isSubmitting}>{isSubmitting ? 'Adding...' : 'Add Vendor'}</button>
              </form>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Search by name, email, or phone..." 
              value={vendorSearch} 
              onChange={e => setVendorSearch(e.target.value)} 
            />
          </div>

          <div className="vendor-list" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>
            {filteredVendors.map(v => (
              <div key={v.id} className="vendor-card">
                <div className="vendor-header">
                  <div className="vendor-name">{v.name}</div>
                  <span className="vendor-badge">VERIFIED</span>
                </div>
                <div className="vendor-detail">Contact: {v.contact_person}</div>
                <div className="vendor-detail">Email: {v.email}</div>
                <div className="vendor-detail">Phone: {v.phone}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <h3 className="panel-title">Purchase Orders (POs)</h3>
            <button onClick={() => setShowNewPO(!showNewPO)} className="btn-primary">
              <Plus size={14} /> New PO
            </button>
          </div>

          {showNewPO && (
            <div style={{flexDirection: 'column', alignItems: 'stretch'}}>
              <form onSubmit={handleCreatePO} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label className="label">Select Vendor</label>
                  <select 
                    value={poVendor} 
                    onChange={e => {
                      setPoVendor(e.target.value);
                      setSelectedProduct(''); // Clear selected product when vendor changes
                    }} 
                    className="input" 
                    required
                  >
                    <option value="">-- Choose Vendor --</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>

                {currentUser?.role === 'admin' && (
                  <div className="form-group">
                    <label className="label">Receiving Warehouse</label>
                    <select 
                      value={selectedWarehouse} 
                      onChange={e => setSelectedWarehouse(e.target.value)} 
                      className="input" 
                      required
                    >
                      <option value="">-- Choose Warehouse --</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', padding: '12px', backgroundColor: 'var(--bg-surface)', borderRadius: '6px', border: '1px dashed var(--border-light)', flexWrap: 'wrap' }}>
                  <div style={{...formGroupStyle, flex: '1 1 100%'}}>
                    <label className="label">Scan Barcode / SKU</label>
                    <input 
                      type="text" 
                      value={barcodeInput} 
                      onChange={e => setBarcodeInput(e.target.value)} 
                      className="input" 
                      placeholder="Scan or type barcode to auto-select..." 
                      disabled={!poVendor}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Product</label>
                    <select 
                      value={selectedProduct} 
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedProduct(val);
                        setItemCost(''); // Requires explicit entry
                      }} 
                      className="input" 
                      disabled={!poVendor}
                    >
                      <option value="">{poVendor ? '-- Select Product --' : '-- Select Vendor First --'}</option>
                      {filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{...formGroupStyle, flex: 0.5}}>
                    <label className="label">Quantity</label>
                    <input type="number" min="1" value={itemQuantity} onChange={e => setItemQuantity(e.target.value)} className="input" placeholder="Qty" />
                  </div>
                  <div style={{...formGroupStyle, flex: 0.5}}>
                    <label className="label">Unit Cost (₹)</label>
                    <input type="number" step="0.01" min="0" value={itemCost} onChange={e => setItemCost(e.target.value)} className="input" placeholder="₹" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '80px', alignItems: 'flex-end' }}>
                    {itemQuantity && itemCost && !isNaN(Number(itemQuantity)) && !isNaN(Number(itemCost)) ? (
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800 }}>
                        = ₹{(Number(itemQuantity) * Number(itemCost)).toFixed(2)}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.65rem', color: 'transparent' }}>-</div>
                    )}
                    <button type="button" onClick={handleAddItem} style={{...btnSubmitStyle, backgroundColor: 'var(--bg-base)', color: 'var(--primary)', border: '1px solid var(--primary)', width: '100%'}}>Add</button>
                  </div>
                </div>

                {poItems.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>Order Items:</div>
                    {poItems.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', fontSize: '0.75rem' }}>
                        <div>{item.quantity}x {item.product_name} (@ ₹{item.cost_per_unit.toFixed(2)})</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontWeight: 800 }}>₹{(item.quantity * item.cost_per_unit).toFixed(2)}</span>
                          <button type="button" onClick={() => handleRemoveItem(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash size={14}/></button>
                        </div>
                      </div>
                    ))}
                    <div style={{ textAlign: 'right', fontSize: '0.9rem', fontWeight: 900, marginTop: '8px' }}>
                      Total: ₹{poItems.reduce((sum, item) => sum + (item.quantity * item.cost_per_unit), 0).toFixed(2)}
                    </div>
                  </div>
                )}

                <button type="submit" className="btn-submit">Generate Purchase Order</button>
              </form>
            </div>
          )}

          <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px', marginTop: '16px' }}>
            <DataTable
              data={orders}
              keyExtractor={o => o.id}
              columns={[
                { key: 'id', header: 'PO NUMBER', sortable: true, render: r => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{r.id.slice(-6).toUpperCase()}</span> },
                { key: 'vendor_name', header: 'VENDOR', sortable: true, render: r => <span style={{ fontWeight: 700 }}>{r.vendor_name}</span> },
                { key: 'items', header: 'ITEMS', render: r => {
                  const totalOrdered = r.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0;
                  const totalReceived = r.items?.reduce((sum: number, i: any) => sum + (i.received_quantity || 0), 0) || 0;
                  return (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <div>{r.items?.length || 0} Products</div>
                      <div style={{ fontWeight: 600 }}>{totalReceived} / {totalOrdered} Units Recv</div>
                    </div>
                  );
                }},
                { key: 'total_cost', header: 'TOTAL COST', sortable: true, render: r => <span style={{ fontWeight: 800 }}>₹{r.total_cost.toFixed(2)}</span> },
                { key: 'status', header: 'STATUS', sortable: true, render: r => {
                  let badge = 'warning';
                  if (r.status === 'approved') badge = 'primary';
                  if (r.status === 'partially_received') badge = 'primary';
                  if (r.status === 'received') badge = 'success';
                  if (r.status === 'cancelled') badge = 'danger';
                  return (
                    <span className={`admin-badge-${badge}`}>
                      {r.status.toUpperCase().replace('_', ' ')}
                    </span>
                  );
                }},
                { key: 'actions', header: 'ACTIONS', render: r => (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {r.status === 'pending' && (
                      <button onClick={() => handleApprovePO(r.id)} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Approve PO</button>
                    )}
                    {(r.status === 'approved' || r.status === 'partially_received') && (
                      <button onClick={() => promptReceiveStock(r as any)} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={12}/> Inward</button>
                    )}
                    {(r.status === 'pending' || r.status === 'approved') && (
                      <button onClick={() => handleCancelPO(r.id)} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--danger, #ef4444)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><Trash size={12}/> Cancel</button>
                    )}
                  </div>
                )}
              ]}
            />
          </div>
        </div>
      </div>
      )}


      {activeTab === 'traceability' && (
      <div className="grid">
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <h3 className="panel-title">Batch Traceability</h3>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Search by product name, SKU, batch, GRN, or vendor..." 
              value={traceSearch} 
              onChange={e => setTraceSearch(e.target.value)} 
            />
          </div>

          <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>
            <DataTable
              data={batches.filter(b => 
                b.batch_number.toLowerCase().includes(traceSearch.toLowerCase()) || 
                b.product?.name.toLowerCase().includes(traceSearch.toLowerCase()) ||
                b.product?.sku.toLowerCase().includes(traceSearch.toLowerCase()) ||
                b.goods_receipt_item?.receipt?.receipt_number.toLowerCase().includes(traceSearch.toLowerCase()) ||
                b.goods_receipt_item?.receipt?.vendor?.name.toLowerCase().includes(traceSearch.toLowerCase())
              )}
              keyExtractor={b => b.id}
              columns={[
                { key: 'product', header: 'PRODUCT', sortable: true, render: r => (
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.product?.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{r.product?.sku}</div>
                  </div>
                )},
                { key: 'batch_number', header: 'BATCH / EXPIRY', sortable: true, render: r => (
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{r.batch_number}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Exp: {r.expiry_date}</div>
                  </div>
                )},
                { key: 'quantity', header: 'QTY (AVL/RECV)', render: r => (
                  <div>
                    <span style={{ fontWeight: 800 }}>{r.available_quantity}</span> / {r.received_quantity}
                  </div>
                )},
                { key: 'provenance', header: 'PROVENANCE (GRN/PO/VENDOR)', render: r => {
                  const item = r.goods_receipt_item;
                  if (!item) {
                    return <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Opening inventory / historical source unavailable</span>;
                  }
                  const poId = item.receipt?.procurement_order_id ? item.receipt.procurement_order_id.slice(-6).toUpperCase() : 'N/A';
                  return (
                    <div style={{ fontSize: '0.75rem' }}>
                      <div style={{ fontWeight: 700 }}>{item.receipt?.vendor?.name}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>GRN: {item.receipt?.receipt_number}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>PO: #{poId}</div>
                    </div>
                  );
                }},
                { key: 'status', header: 'STATUS', sortable: true, render: r => (
                  <span className={`admin-badge-${r.status === 'active' ? 'success' : 'danger'}`}>
                    {r.status.toUpperCase()}
                  </span>
                )}
              ]}
            />
          </div>
        </div>
      </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="glass-panel" style={{
            padding: '32px', borderRadius: '16px', maxWidth: '420px', width: '90%',
            backgroundColor: 'var(--bg-base)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-light)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-primary)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={20} color="var(--primary)" />
              {confirmModal.title}
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: '1.6', fontSize: '0.95rem' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setConfirmModal(null)} 
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receiving Modal */}
      {receivingPO && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="glass-panel" style={{
            padding: '32px', borderRadius: '16px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto',
            backgroundColor: 'var(--bg-base)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-light)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-primary)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={20} color="var(--primary)" />
              Inward Stock (PO #{receivingPO.id.slice(-6).toUpperCase()})
            </h3>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label">GRN / Receipt Number</label>
                <input className="input" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} required />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="label">Notes</label>
                <input className="input" value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} placeholder="Optional receiving notes..." />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              {receivingPO.items?.map((item, idx) => {
                const prod = products.find(p => p.id === item.product_id);
                const input = batchInputs[item.product_id] || { accepted_quantity: 0, rejected_quantity: 0, batch_number: '', expiry_date: '' };
                const remaining = item.quantity - (item.received_quantity || 0);
                
                return (
                  <div key={idx} style={{ padding: '12px', border: '1px solid var(--border-light)', borderRadius: '8px', backgroundColor: 'var(--bg-surface)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{prod?.name || item.product_id}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pending: {remaining} of {item.quantity}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                        <label className="label">Batch Number</label>
                        <input className="input" value={input.batch_number} onChange={e => setBatchInputs({...batchInputs, [item.product_id]: {...input, batch_number: e.target.value}})} placeholder="e.g. BAT-001" />
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                        <label className="label">Expiry Date</label>
                        <input className="input" type="date" value={input.expiry_date} onChange={e => setBatchInputs({...batchInputs, [item.product_id]: {...input, expiry_date: e.target.value}})} />
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: '100px' }}>
                        <label className="label" style={{ color: 'var(--success)' }}>Accepted Qty</label>
                        <input className="input" type="number" max={remaining - input.rejected_quantity} min={0} value={input.accepted_quantity} onChange={e => setBatchInputs({...batchInputs, [item.product_id]: {...input, accepted_quantity: Number(e.target.value)}})} required />
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: '100px' }}>
                        <label className="label" style={{ color: 'var(--danger)' }}>Rejected Qty</label>
                        <input className="input" type="number" max={remaining - input.accepted_quantity} min={0} value={input.rejected_quantity} onChange={e => setBatchInputs({...batchInputs, [item.product_id]: {...input, rejected_quantity: Number(e.target.value)}})} required />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn-secondary" onClick={() => setReceivingPO(null)}>Cancel</button>
              <button className="btn-primary" onClick={confirmReceiveStock}>Confirm Inward</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Styles




























const statusBadgeStyle = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--accent)' },
    approved: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--primary)' },
    received: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
    partially_received: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--primary)' }
  };
  const c = colors[status] || { bg: 'var(--border-light)', text: 'var(--text-secondary)' };
  return { backgroundColor: c.bg, color: c.text, fontSize: '0.62rem', fontWeight: 800, padding: '4px 8px', borderRadius: '4px' };
};

const actionBtnStyle = (color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', backgroundColor: `${color}15`, color: color, border: `1px solid ${color}`, borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' });
