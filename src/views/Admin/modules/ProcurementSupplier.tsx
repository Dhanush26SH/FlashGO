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
import { Plus, CheckCircle, Package, Trash, AlertCircle, X } from 'lucide-react';
import { DataTable } from '../../../components/Admin/DataTable';

export const ProcurementSupplier: React.FC = () => {
  const { addToast, currentUser } = useApp();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorData, setNewVendorData] = useState({ name: '', contact_person: '', email: '', phone: '', address: 'N/A' });
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState<'replenishment' | 'suppliers_po' | 'traceability'>('replenishment');
  
  const [showNewPO, setShowNewPO] = useState(false);
  const [poVendor, setPoVendor] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispatchingPO, setDispatchingPO] = useState<ProcurementOrder | null>(null);
  const [dispatchInputs, setDispatchInputs] = useState<Record<string, { batch_number: string, expiry_date: string, dispatched_quantity: number }[]>>({});
  const [existingDispatches, setExistingDispatches] = useState<any[]>([]);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [vendorProducts, setVendorProducts] = useState<any[]>([]); // New state for mapped products
  const [vendorSearch, setVendorSearch] = useState('');
  const [traceSearch, setTraceSearch] = useState('');
  
  // Replenishment state
  const [replenishments, setReplenishments] = useState<any[]>([]);
  const [replenishmentWarehouse, setReplenishmentWarehouse] = useState('');
  const [updatingReplenishment, setUpdatingReplenishment] = useState<string | null>(null);
  const [poRestrictedSuppliers, setPoRestrictedSuppliers] = useState<any[] | null>(null);
  const [replenishmentContext, setReplenishmentContext] = useState<any | null>(null);

  const [catalogVendor, setCatalogVendor] = useState<any | null>(null);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogForm, setCatalogForm] = useState({ product_id: '', vendor_sku: '', purchase_price: '', minimum_order_quantity: '1', is_active: true });
  const [editMappingForm, setEditMappingForm] = useState<any | null>(null);

  const filteredVendors = vendors.filter(v => {
    const term = vendorSearch.toLowerCase();
    return (
      (v.name && v.name.toLowerCase().includes(term)) || 
      (v.email && v.email.toLowerCase().includes(term)) ||
      (v.phone && v.phone.toLowerCase().includes(term))
    );
  });
  
  const loadData = () => {
    ProductsService.getProducts().then(setProducts).catch(console.error);
    VendorsService.getVendors().then(setVendors).catch(console.error);
    ProcurementService.getProcurementOrders().then(setOrders).catch(console.error);
    if (currentUser?.role === 'admin') {
      AdminService.getWarehouses().then(setWarehouses).catch(console.error);
    }
    if (currentUser?.role === 'admin' || currentUser?.warehouse_id) {
      ProcurementService.getBatchTraceability(currentUser?.warehouse_id).then(setBatches).catch(console.error);
      setReplenishmentWarehouse(currentUser?.warehouse_id || '');
    }
  };

  useEffect(() => {
    if (replenishmentWarehouse) {
      ProcurementService.getReplenishmentRequirements(replenishmentWarehouse).then(setReplenishments).catch(console.error);
    } else {
      setReplenishments([]);
    }
  }, [replenishmentWarehouse]);

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
  }, [poVendor]);

  const [selectedProduct, setSelectedProduct] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemCost, setItemCost] = useState('');
  const [selectedVendorSku, setSelectedVendorSku] = useState('');
  const [selectedMoq, setSelectedMoq] = useState(1);

  // Auto-select product if barcode matches
  // eslint-disable-next-line react-compiler/react-compiler
  React.useEffect(() => {
    if (barcodeInput.trim().length >= 5 && poVendor) {
      const match = products.find(p => p.barcode === barcodeInput.trim() || p.sku === barcodeInput.trim());
      if (match) {
        setSelectedProduct(match.id);
        const vp = vendorProducts.find(vp => vp.product_id === match.id);
        if (vp && vp.purchase_price != null && vp.purchase_price > 0) {
          setItemCost(vp.purchase_price.toString());
        } else {
          setItemCost('');
          addToast('PURCHASE PRICE NOT CONFIGURED for this vendor mapping. Please configure it or enter manually.', 'warning');
        }
        if (vp && vp.minimum_order_quantity != null && vp.minimum_order_quantity > 1) {
          setItemQuantity(vp.minimum_order_quantity.toString());
          setSelectedMoq(vp.minimum_order_quantity);
        } else {
          setItemQuantity('');
          setSelectedMoq(1);
        }
        setSelectedVendorSku(vp?.vendor_sku || '');
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
    
    if (Number(itemQuantity) < selectedMoq) {
      addToast(`Quantity must be at least the supplier's MOQ of ${selectedMoq}`, 'error');
      return;
    }

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
    setSelectedVendorSku('');
    setSelectedMoq(1);
  };
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);

  const handleRemoveItem = (index: number) => {
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  const handleStartReplenishmentPO = async (req: any) => {
    try {
      const suppliers = await ProcurementService.getSuppliersForProduct(req.product_id);
      if (suppliers.length === 0) {
        addToast('NO SUPPLIER CONFIGURED FOR THIS PRODUCT. Please configure in the vendor catalog first.', 'error');
        return;
      }
      
      setPoRestrictedSuppliers(suppliers);
      setReplenishmentContext(req);
      setSelectedWarehouse(replenishmentWarehouse);
      setPoVendor('');
      setPoItems([{ 
        product_id: req.product_id, 
        quantity: req.suggested_reorder_quantity > 0 ? req.suggested_reorder_quantity : 1, 
        cost_per_unit: 0, 
        product_name: req.product_name 
      }]);
      setActiveTab('suppliers_po');
      setShowNewPO(true);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleUpdateReplenishment = async (req: any, thresholdStr: string, targetStr: string) => {
    setUpdatingReplenishment(req.product_id);
    try {
      const threshold = thresholdStr === '' ? null : Number(thresholdStr);
      const target = targetStr === '' ? null : Number(targetStr);
      await ProcurementService.updateReplenishmentSettings(replenishmentWarehouse, req.product_id, threshold, target);
      // Reload replenishments
      const updated = await ProcurementService.getReplenishmentRequirements(replenishmentWarehouse);
      setReplenishments(updated);
      addToast('Replenishment settings updated', 'success');
    } catch (err: any) {
      addToast(`Update failed: ${err.message}`, 'error');
    } finally {
      setUpdatingReplenishment(null);
    }
  };

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poVendor || poItems.length === 0) {
      addToast('Please select a vendor and add at least one item', 'error');
      return;
    }
    
    const invalidItems = poItems.filter(item => item.cost_per_unit <= 0);
    if (invalidItems.length > 0) {
      addToast(`PURCHASE PRICE NOT CONFIGURED for ${invalidItems[0].product_name}. Please set a valid cost per unit > 0.`, 'error');
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
          
          setPoItems([]);
          setPoVendor('');
          setBarcodeInput('');
          setShowNewPO(false);
          setPoRestrictedSuppliers(null);
          setReplenishmentContext(null);
          addToast('Purchase order created successfully', 'success');
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


  
  const promptDispatchDetails = async (po: ProcurementOrder) => {
    setDispatchingPO(po);
    const inputs: Record<string, { batch_number: string, expiry_date: string, dispatched_quantity: number }[]> = {};
    if (po.items) {
      po.items.forEach(i => {
        inputs[i.product_id] = [];
      });
    }
    
    try {
      const existing = await ProcurementService.getSupplierDispatchBatches(po.id);
      setExistingDispatches(existing);
    } catch (e: any) {
      addToast('Failed to load existing dispatches', 'error');
      setExistingDispatches([]);
    }
    setDispatchInputs(inputs);
  };

  const confirmDispatchDetails = async () => {
    if (!dispatchingPO) return;
    
    const submissions: any[] = [];
    if (dispatchingPO.items) {
      for (const item of dispatchingPO.items) {
        const itemInputs = dispatchInputs[item.product_id] || [];
        for (const input of itemInputs) {
          if (!input.batch_number || !input.dispatched_quantity || input.dispatched_quantity <= 0) {
            addToast('Batch number and valid dispatched quantity are required for all entries', 'error');
            return;
          }
          submissions.push({
            poItemId: item.id,
            productId: item.product_id,
            batchNumber: input.batch_number,
            expiryDate: input.expiry_date || null,
            dispatchedQuantity: input.dispatched_quantity
          });
        }
      }
    }

    if (submissions.length === 0) {
      addToast('Please add at least one dispatch batch', 'error');
      return;
    }

    try {
      for (const sub of submissions) {
        await ProcurementService.adminRecordSupplierDispatch(
          dispatchingPO.id,
          sub.poItemId,
          sub.productId,
          sub.batchNumber,
          sub.dispatchedQuantity,
          sub.expiryDate
        );
      }
      addToast('Supplier dispatch recorded successfully', 'success');
      setDispatchingPO(null);
    } catch (err: any) {
      addToast(`Failed to record dispatch: ${err.message}`, 'error');
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

  const handleManageCatalog = async (vendor: any) => {
    setCatalogVendor(vendor);
    setIsCatalogLoading(true);
    try {
      const items = await VendorsService.getVendorCatalog(vendor.id);
      setCatalogItems(items);
    } catch (e: any) {
      addToast(`Failed to load catalog: ${e.message}`, 'error');
    } finally {
      setIsCatalogLoading(false);
    }
  };

  const handleUpsertCatalogItem = async (e?: React.FormEvent, itemData?: any) => {
    if (e) e.preventDefault();
    if (!catalogVendor) return;

    const targetData = itemData || catalogForm;
    
    if (!targetData.product_id) {
      addToast('Please select a product', 'error');
      return;
    }
    
    const price = Number(targetData.purchase_price);
    const moq = Number(targetData.minimum_order_quantity);
    
    if (targetData.is_active) {
      if (isNaN(price) || price <= 0) {
        addToast('Active mapping requires purchase price > 0', 'error');
        return;
      }
      if (isNaN(moq) || moq < 1) {
        addToast('Active mapping requires minimum order quantity >= 1', 'error');
        return;
      }
    }

    try {
      await VendorsService.upsertVendorProduct(
        catalogVendor.id,
        targetData.product_id,
        targetData.vendor_sku || null,
        isNaN(price) ? null : price,
        isNaN(moq) ? null : moq,
        targetData.is_active
      );
      
      const items = await VendorsService.getVendorCatalog(catalogVendor.id);
      setCatalogItems(items);
      addToast(itemData ? 'Catalog item updated' : 'Product added to catalog', 'success');
      
      if (!itemData) {
        setCatalogForm({ product_id: '', vendor_sku: '', purchase_price: '', minimum_order_quantity: '1', is_active: true });
      }
    } catch (err: any) {
      addToast(`Failed to update catalog: ${err.message}`, 'error');
    }
  };

  return (
    <div className="container">
      <div className=" ">
        <div>
          <h2 className="title">Procurement & Replenishment</h2>
          <p className="subtitle">Manage vendor catalogs, issue purchase orders, and process inward warehouse stock.</p>
        </div>
        <Package size={36} color="var(--primary)" />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', padding: '4px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)', width: 'max-content', overflowX: 'auto' }}>
        {[
          { id: 'replenishment', label: 'Replenishment Required' },
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

      {activeTab === 'replenishment' && (
      <div className="grid">
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <h3 className="panel-title">Replenishment Required</h3>
            {currentUser?.role === 'admin' && (
              <select 
                value={replenishmentWarehouse} 
                onChange={e => setReplenishmentWarehouse(e.target.value)} 
                className="input" 
                style={{ width: '250px' }}
              >
                <option value="">-- Choose Warehouse --</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
          </div>
          
          {!replenishmentWarehouse ? (
            <div className="empty-state">Please select a warehouse to view replenishment needs.</div>
          ) : (
            <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>
              <DataTable
                data={replenishments}
                keyExtractor={r => r.product_id}
                columns={[
                  { key: 'product', header: 'PRODUCT', sortable: true, render: r => (
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.product_name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>SKU: {r.sku}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Barcode: {r.internal_barcode}</div>
                    </div>
                  )},
                  { key: 'inventory', header: 'INVENTORY', render: r => (
                    <div style={{ fontSize: '0.8rem' }}>
                      <div>Physical: <strong>{r.physical_quantity}</strong></div>
                      <div style={{ color: 'var(--danger)' }}>Reserved: {r.reserved_quantity}</div>
                      <div style={{ color: 'var(--success)' }}>Available: <strong>{r.available_to_sell}</strong></div>
                    </div>
                  )},
                  { key: 'settings', header: 'REPLENISHMENT CONFIG', render: r => {
                    const isConfigured = r.reorder_threshold !== null && r.target_stock_level !== null;
                    return (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input 
                            type="number" 
                            className="input" 
                            style={{ padding: '4px 8px', width: '80px', fontSize: '0.8rem' }}
                            placeholder="Thresh"
                            defaultValue={r.reorder_threshold ?? ''}
                            onBlur={(e) => handleUpdateReplenishment(r, e.target.value, (e.target.nextElementSibling as HTMLInputElement).value)}
                            disabled={updatingReplenishment === r.product_id}
                          />
                          <input 
                            type="number" 
                            className="input" 
                            style={{ padding: '4px 8px', width: '80px', fontSize: '0.8rem' }}
                            placeholder="Target"
                            defaultValue={r.target_stock_level ?? ''}
                            onBlur={(e) => handleUpdateReplenishment(r, (e.target.previousElementSibling as HTMLInputElement).value, e.target.value)}
                            disabled={updatingReplenishment === r.product_id}
                          />
                        </div>
                        {!isConfigured && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Not Configured</div>}
                      </div>
                    );
                  }},
                  { key: 'status', header: 'STATUS', sortable: true, render: r => {
                    let colorClass = 'admin-badge-warning';
                    if (r.replenishment_status === 'OK') colorClass = 'admin-badge-success';
                    if (r.replenishment_status === 'OUT OF STOCK') colorClass = 'admin-badge-danger';
                    if (r.replenishment_status === 'NOT CONFIGURED') colorClass = 'admin-badge-neutral';
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className={colorClass}>{r.replenishment_status}</span>
                        {r.suggested_reorder_quantity > 0 && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>Sugg: {r.suggested_reorder_quantity}</span>
                        )}
                      </div>
                    );
                  }},
                  { key: 'actions', header: 'ACTIONS', render: r => (
                    r.replenishment_status !== 'NOT CONFIGURED' && r.replenishment_status !== 'OK' && (
                      <button 
                        onClick={() => handleStartReplenishmentPO(r)}
                        className="btn-primary" 
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      >
                        Create PO
                      </button>
                    )
                  )}
                ]}
              />
            </div>
          )}
        </div>
      </div>
      )}

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
                <div style={{ marginTop: '12px' }}>
                  <button className="btn-primary" onClick={() => handleManageCatalog(v)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                    <Package size={14} /> Manage Catalog
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <h3 className="panel-title">Purchase Orders (POs)</h3>
            <button onClick={() => {
              setShowNewPO(!showNewPO);
              if (!showNewPO) {
                setPoRestrictedSuppliers(null);
                setReplenishmentContext(null);
              }
            }} className="btn-primary">
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
                      const newVendorId = e.target.value;
                      setPoVendor(newVendorId);
                      
                      if (replenishmentContext && poRestrictedSuppliers && poItems.length > 0) {
                        const supplier = poRestrictedSuppliers.find(s => s.vendor_id === newVendorId);
                        if (supplier) {
                          const suggestedQty = replenishmentContext.suggested_reorder_quantity > 0 ? replenishmentContext.suggested_reorder_quantity : 1;
                          const finalQty = Math.max(suggestedQty, supplier.minimum_order_quantity || 1);
                          const price = supplier.purchase_price;
                          
                          if (price === null || price <= 0) {
                            addToast('PURCHASE PRICE NOT CONFIGURED for this supplier. Please manually enter a valid cost per unit.', 'warning');
                          }
                          
                          if (supplier.minimum_order_quantity > suggestedQty) {
                            addToast(`Suggested requirement: ${suggestedQty}, Supplier MOQ: ${supplier.minimum_order_quantity}. Quantity adjusted to MOQ.`, 'warning');
                          }

                          setPoItems([{
                            ...poItems[0],
                            quantity: finalQty,
                            cost_per_unit: price !== null && price > 0 ? price : 0
                          }]);
                        }
                      } else {
                        // Clear items if standard flow vendor is changed to prevent cross-vendor POs
                        setPoItems([]);
                        setSelectedProduct('');
                        setBarcodeInput('');
                        setItemQuantity('');
                        setItemCost('');
                        setSelectedVendorSku('');
                        setSelectedMoq(1);
                      }
                    }} 
                    className="input" 
                    required
                  >
                    <option value="">-- Choose Vendor --</option>
                    {(poRestrictedSuppliers || vendors).map(v => (
                      <option key={v.vendor_id || v.id} value={v.vendor_id || v.id}>
                        {v.vendor?.name || v.name}
                      </option>
                    ))}
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
                    <label className="label">
                      Product
                      {selectedVendorSku && <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>(Vendor SKU: {selectedVendorSku})</span>}
                    </label>
                    <select 
                      value={selectedProduct} 
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedProduct(val);
                        if (val) {
                          const vp = vendorProducts.find(vp => vp.product_id === val);
                          if (vp && vp.purchase_price != null && vp.purchase_price > 0) {
                            setItemCost(vp.purchase_price.toString());
                          } else {
                            setItemCost('');
                            addToast('PURCHASE PRICE NOT CONFIGURED for this vendor mapping. Please configure it or enter manually.', 'warning');
                          }
                          if (vp && vp.minimum_order_quantity != null && vp.minimum_order_quantity > 1) {
                            setItemQuantity(vp.minimum_order_quantity.toString());
                            setSelectedMoq(vp.minimum_order_quantity);
                          } else {
                            setItemQuantity('');
                            setSelectedMoq(1);
                          }
                          setSelectedVendorSku(vp?.vendor_sku || '');
                        } else {
                          setItemCost('');
                          setItemQuantity('');
                          setSelectedVendorSku('');
                          setSelectedMoq(1);
                        }
                      }} 
                      className="input" 
                      disabled={!poVendor}
                    >
                      <option value="">{poVendor ? '-- Select Product --' : '-- Select Vendor First --'}</option>
                      {filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{...formGroupStyle, flex: 0.5}}>
                    <label className="label">
                      Quantity
                      {selectedMoq > 1 && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', marginLeft: '4px' }}>(MOQ: {selectedMoq})</span>}
                    </label>
                    <input type="number" min={selectedMoq || 1} value={itemQuantity} onChange={e => setItemQuantity(e.target.value)} className="input" placeholder="Qty" />
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
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            type="number" 
                            className="input" 
                            style={{ width: '60px', padding: '4px', fontSize: '0.75rem' }} 
                            value={item.quantity} 
                            onChange={e => {
                              const newItems = [...poItems];
                              newItems[idx].quantity = Number(e.target.value);
                              setPoItems(newItems);
                            }}
                            min="1"
                          />
                          <span>x {item.product_name} (@ ₹</span>
                          <input 
                            type="number" 
                            className="input" 
                            style={{ width: '70px', padding: '4px', fontSize: '0.75rem' }} 
                            value={item.cost_per_unit || ''} 
                            onChange={e => {
                              const newItems = [...poItems];
                              newItems[idx].cost_per_unit = Number(e.target.value);
                              setPoItems(newItems);
                            }}
                            min="0.01"
                            step="0.01"
                          />
                          <span>)</span>
                        </div>
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
                      <button onClick={() => promptDispatchDetails(r as any)} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><Package size={12}/> Dispatch Details</button>
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
                { key: 'unit_cost', header: 'UNIT COST', render: r => {
                  const cost = r.goods_receipt_item?.unit_cost;
                  return cost != null 
                    ? <div style={{ fontFamily: 'monospace' }}>₹{Number(cost).toFixed(2)}</div>
                    : <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>N/A</span>;
                }},
                { key: 'total_cost', header: 'TOTAL COST', render: r => {
                  const cost = r.goods_receipt_item?.unit_cost;
                  return cost != null 
                    ? <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>₹{(Number(cost) * r.received_quantity).toFixed(2)}</div>
                    : <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>N/A</span>;
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

      
      {/* Dispatch Details Modal */}
      {dispatchingPO && (() => {
        const autoGenerateDemoDetails = () => {
          if (!dispatchingPO || !dispatchingPO.items) return;
          
          const newDispatchInputs: Record<string, { batch_number: string, expiry_date: string, dispatched_quantity: number }[]> = {};
          const todayStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 180);
          const expiryDateStr = expiryDate.toISOString().slice(0,10);
          
          for (const item of dispatchingPO.items) {
            const existingForItem = existingDispatches.filter(d => d.procurement_order_item_id === item.id);
            const alreadyDispatched = existingForItem.reduce((sum, d) => sum + d.dispatched_quantity, 0);
            const remaining = item.quantity - alreadyDispatched;
            
            if (remaining > 0) {
              const randomHex = Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0');
              newDispatchInputs[item.product_id] = [{
                batch_number: `FG-BATCH-${todayStr}-${randomHex}`,
                expiry_date: expiryDateStr,
                dispatched_quantity: remaining
              }];
            } else {
              newDispatchInputs[item.product_id] = [];
            }
          }
          
          setDispatchInputs(newDispatchInputs);
        };

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(3px)'
          }}>
            <div className="glass-panel" style={{
              padding: '32px', borderRadius: '16px', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflowY: 'auto',
              backgroundColor: 'var(--bg-base)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
              border: '1px solid var(--border-light)',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={20} color="var(--primary)" />
                  Dispatch Details (PO #{dispatchingPO.id.slice(-6).toUpperCase()})
                </h3>
                <button className="btn-secondary" onClick={autoGenerateDemoDetails} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                  <Activity size={14} /> Auto Generate Demo Details
                </button>
              </div>
              
              <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={16} /> Demo-generated batch details — for academic/testing use. Manual entry remains fully supported for genuine supplier details.
              </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
              {dispatchingPO.items?.map((item, idx) => {
                const prod = products.find(p => p.id === item.product_id);
                const inputs = dispatchInputs[item.product_id] || [];
                
                // Calculate already dispatched from existing
                const existingForItem = existingDispatches.filter(d => d.procurement_order_item_id === item.id);
                const alreadyDispatched = existingForItem.reduce((sum, d) => sum + d.dispatched_quantity, 0);
                const remaining = item.quantity - alreadyDispatched;

                return (
                  <div key={idx} style={{ padding: '16px', border: '1px solid var(--border-light)', borderRadius: '8px', backgroundColor: 'var(--bg-surface)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{prod?.name || item.product_id}</span>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                        <span>Ordered: <strong>{item.quantity}</strong></span>
                        <span>Already Dispatched: <strong style={{ color: 'var(--primary)' }}>{alreadyDispatched}</strong></span>
                        <span>Remaining: <strong style={{ color: remaining > 0 ? 'var(--warning)' : 'var(--success)' }}>{remaining}</strong></span>
                      </div>
                    </div>
                    
                    {existingForItem.length > 0 && (
                      <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Previously Recorded Batches:</div>
                        {existingForItem.map(d => (
                          <div key={d.id} style={{ display: 'flex', gap: '16px', padding: '4px 0' }}>
                            <span style={{ fontFamily: 'monospace' }}>{d.batch_number}</span>
                            <span>Qty: {d.dispatched_quantity}</span>
                            <span>Exp: {d.expiry_date || 'N/A'}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {remaining > 0 ? (
                      <div>
                        {inputs.map((input, i) => (
                          <div key={i} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                              <label className="label">Batch Number</label>
                              <input className="input" value={input.batch_number} onChange={e => {
                                const newInputs = [...inputs];
                                newInputs[i].batch_number = e.target.value;
                                setDispatchInputs({...dispatchInputs, [item.product_id]: newInputs});
                              }} placeholder="e.g. BAT-001" />
                            </div>
                            <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                              <label className="label">Expiry Date</label>
                              <input className="input" type="date" value={input.expiry_date} onChange={e => {
                                const newInputs = [...inputs];
                                newInputs[i].expiry_date = e.target.value;
                                setDispatchInputs({...dispatchInputs, [item.product_id]: newInputs});
                              }} />
                            </div>
                            <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                              <label className="label" style={{ color: 'var(--primary)' }}>Dispatch Qty</label>
                              <input className="input" type="number" min={1} max={remaining} value={input.dispatched_quantity || ''} onChange={e => {
                                const newInputs = [...inputs];
                                newInputs[i].dispatched_quantity = Number(e.target.value);
                                setDispatchInputs({...dispatchInputs, [item.product_id]: newInputs});
                              }} required />
                            </div>
                            <button className="btn-secondary" style={{ padding: '8px 12px', height: '42px' }} onClick={() => {
                              const newInputs = inputs.filter((_, idx) => idx !== i);
                              setDispatchInputs({...dispatchInputs, [item.product_id]: newInputs});
                            }}><Trash size={16} /></button>
                          </div>
                        ))}
                        
                        <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px', marginTop: '8px' }} onClick={() => {
                          setDispatchInputs({...dispatchInputs, [item.product_id]: [...inputs, { batch_number: '', expiry_date: '', dispatched_quantity: 0 }]});
                        }}>+ Add Another Batch</button>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>
                        Fully dispatched.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn-secondary" onClick={() => setDispatchingPO(null)}>Cancel</button>
              <button className="btn-primary" onClick={confirmDispatchDetails}>Record Dispatch Details</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Catalog Modal */}
      {catalogVendor && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="glass-panel" style={{
            padding: '32px', borderRadius: '16px', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflowY: 'auto',
            backgroundColor: 'var(--bg-base)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-light)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{catalogVendor.name} - Product Catalog</h2>
              <button onClick={() => {
                setCatalogVendor(null);
                setEditMappingForm(null);
              }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20}/></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>Add Product to Catalog</h4>
                <form onSubmit={handleUpsertCatalogItem} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '2 1 200px', margin: 0 }}>
                    <label className="label">FlashGO Product</label>
                    <select className="input" value={catalogForm.product_id} onChange={e => setCatalogForm({...catalogForm, product_id: e.target.value})} required>
                      <option value="">-- Select Product --</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '1 1 100px', margin: 0 }}>
                    <label className="label">Vendor SKU</label>
                    <input type="text" className="input" placeholder="Optional" value={catalogForm.vendor_sku} onChange={e => setCatalogForm({...catalogForm, vendor_sku: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 80px', margin: 0 }}>
                    <label className="label">Price (₹)</label>
                    <input type="number" step="0.01" min="0.01" className="input" value={catalogForm.purchase_price} onChange={e => setCatalogForm({...catalogForm, purchase_price: e.target.value})} required={catalogForm.is_active} />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 80px', margin: 0 }}>
                    <label className="label">MOQ</label>
                    <input type="number" min="1" className="input" value={catalogForm.minimum_order_quantity} onChange={e => setCatalogForm({...catalogForm, minimum_order_quantity: e.target.value})} required={catalogForm.is_active} />
                  </div>
                  <button type="submit" className="btn-primary" style={{ padding: '10px 16px', height: '42px' }}>Add Mapping</button>
                </form>
              </div>

              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>Existing Mappings</h4>
                {isCatalogLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading catalog...</div>
                ) : catalogItems.length === 0 ? (
                  <div className="empty-state">No products mapped to this vendor.</div>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-base)', borderBottom: '2px solid var(--border-light)' }}>
                        <tr>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Product</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Vendor SKU</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Price (₹)</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>MOQ</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalogItems.map(item => {
                          const isEditing = editMappingForm?.product_id === item.product_id;
                          return (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)', opacity: item.is_active ? 1 : 0.6 }}>
                            <td style={{ padding: '8px', fontWeight: 600 }}>{item.product?.name} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>{item.product?.sku}</span></td>
                            <td style={{ padding: '8px' }}>
                              {isEditing ? (
                                <input type="text" className="input" value={editMappingForm.vendor_sku} onChange={e => setEditMappingForm({...editMappingForm, vendor_sku: e.target.value})} style={{ padding: '4px', fontSize: '0.7rem', width: '80px' }} />
                              ) : (
                                item.vendor_sku || '-'
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                              {isEditing ? (
                                <input type="number" step="0.01" min="0.01" className="input" value={editMappingForm.purchase_price} onChange={e => setEditMappingForm({...editMappingForm, purchase_price: e.target.value})} required={item.is_active} style={{ padding: '4px', fontSize: '0.7rem', width: '60px', textAlign: 'right' }} />
                              ) : (
                                item.purchase_price != null ? item.purchase_price.toFixed(2) : '-'
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {isEditing ? (
                                <input type="number" min="1" className="input" value={editMappingForm.minimum_order_quantity} onChange={e => setEditMappingForm({...editMappingForm, minimum_order_quantity: e.target.value})} required={item.is_active} style={{ padding: '4px', fontSize: '0.7rem', width: '60px', textAlign: 'right' }} />
                              ) : (
                                item.minimum_order_quantity || '-'
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <span className={item.is_active ? 'admin-badge-success' : 'admin-badge-neutral'} style={{ fontSize: '0.65rem' }}>
                                {item.is_active ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                  <button onClick={async () => {
                                    await handleUpsertCatalogItem(undefined, {
                                      ...item,
                                      vendor_sku: editMappingForm.vendor_sku,
                                      purchase_price: editMappingForm.purchase_price,
                                      minimum_order_quantity: editMappingForm.minimum_order_quantity
                                    });
                                    setEditMappingForm(null);
                                  }} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                                  <button onClick={() => setEditMappingForm(null)} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                  <button onClick={() => setEditMappingForm({
                                    product_id: item.product_id,
                                    vendor_sku: item.vendor_sku || '',
                                    purchase_price: item.purchase_price?.toString() || '',
                                    minimum_order_quantity: item.minimum_order_quantity?.toString() || '1'
                                  })} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--bg-surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
                                  {item.is_active ? (
                                    <button onClick={() => handleUpsertCatalogItem(undefined, { ...item, is_active: false })} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Deactivate</button>
                                  ) : (
                                    <button onClick={() => {
                                      // Pre-fill form to encourage fixing price/MOQ before reactivating if missing
                                      if (!item.purchase_price || item.purchase_price <= 0 || !item.minimum_order_quantity || item.minimum_order_quantity < 1) {
                                        setCatalogForm({
                                          product_id: item.product_id,
                                          vendor_sku: item.vendor_sku || '',
                                          purchase_price: item.purchase_price?.toString() || '',
                                          minimum_order_quantity: item.minimum_order_quantity?.toString() || '1',
                                          is_active: true
                                        });
                                        addToast('Please enter a valid Price and MOQ to reactivate.', 'warning');
                                      } else {
                                        handleUpsertCatalogItem(undefined, { ...item, is_active: true });
                                      }
                                    }} style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--success)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reactivate</button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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
