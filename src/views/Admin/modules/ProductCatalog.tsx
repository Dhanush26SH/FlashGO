import React, { useState, useCallback } from 'react';
import './ProductCatalog.css';
import { DataTable } from '../../../components/Admin/DataTable';
import { useApp } from '../../../context/AppContext';
import type { Category } from '../../../types';
import { ProductsService } from '../../../services/api/ProductsService';
import ReactBarcode from 'react-barcode';
import {
  Plus, Check, Tag, AlertCircle, Edit2, Search,
  RefreshCw, ShieldAlert, X, FileSpreadsheet, Barcode,
  Trash2, ChevronDown, Eye, EyeOff, ToggleLeft, ToggleRight, Info
} from 'lucide-react';

// ─── Utility: Custom Dropdown ─────────────────────────────────────────────────

const CustomDropdown = ({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
  placeholder: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label || placeholder;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="admin-input"
        style={{
          height: '42px', borderRadius: '8px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-light)', padding: '0 12px'
        }}
      >
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {selectedLabel}
        </span>
        <ChevronDown size={16} color="var(--text-secondary)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)',
          borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          zIndex: 100, maxHeight: '200px', overflowY: 'auto'
        }}>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              style={{
                padding: '12px 16px', cursor: 'pointer', fontSize: '0.9rem',
                backgroundColor: value === opt.value ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                color: value === opt.value ? 'var(--primary)' : 'var(--text-primary)',
                borderBottom: '1px solid var(--border-light)'
              }}
              onMouseEnter={(e) => { if (value !== opt.value) e.currentTarget.style.backgroundColor = 'var(--bg-base)'; }}
              onMouseLeave={(e) => { if (value !== opt.value) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
          onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ProductCatalog: React.FC = () => {
  const { products, categories, refreshData, addToast, isLoadingData, dataLoadError } = useApp();

  // Sub-tab state
  const [catalogSubTab, setCatalogSubTab] = useState<'products' | 'categories'>('products');
  const [showAddForm, setShowAddForm] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 50;

  // Add Product form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDiscountPrice, setNewDiscountPrice] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newImage, setNewImage] = useState('https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80');
  const [newIsActive, setNewIsActive] = useState(true);

  // New fields
  const [newPackQuantity, setNewPackQuantity] = useState('');
  const [newPackUnit, setNewPackUnit] = useState('');
  const [newSupplierId, setNewSupplierId] = useState('');
  const [newPurchasePrice, setNewPurchasePrice] = useState('');
  const [newMoq, setNewMoq] = useState('1');
  const [newVendorSku, setNewVendorSku] = useState('');

  const [vendors, setVendors] = useState<any[]>([]);

  React.useEffect(() => {
    import('../../../services/api/VendorsService').then(m => {
      m.VendorsService.getVendors().then(setVendors).catch(console.error);
    });
  }, []);

  // Update default category when categories load
  React.useEffect(() => {
    if (categories.length > 0 && !newCategory) {
      setNewCategory(categories[0].id);
    }
  }, [categories, newCategory]);

  // Inline edit states (catalog metadata only — no stock/location)
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDiscountPrice, setEditDiscountPrice] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editPackQuantity, setEditPackQuantity] = useState('');
  const [editPackUnit, setEditPackUnit] = useState('');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editPurchasePrice, setEditPurchasePrice] = useState('');
  const [editMoq, setEditMoq] = useState('1');
  const [editVendorSku, setEditVendorSku] = useState('');

  // Filter state
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; title: string; message: string; onConfirm: () => void;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingCSV, setIsDraggingCSV] = useState(false);

  // ── Derived filtered products ────────────────────────────────────────────
  const filteredProducts = products.filter(p => {
    if (filterActive === 'active') return p.is_active !== false;
    if (filterActive === 'inactive') return p.is_active === false;
    return true;
  });

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const pagedProducts = filteredProducts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // ── ACTIONS ───────────────────────────────────────────────────────────────

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) { addToast('Product name is required', 'error'); return; }
    if (!newCategory) { addToast('Please select a category', 'error'); return; }
    if (!newPrice || parseFloat(newPrice) < 0) { addToast('Please enter a valid price', 'error'); return; }
    if (newDiscountPrice && parseFloat(newDiscountPrice) > parseFloat(newPrice)) {
      addToast('Discount price cannot exceed base price', 'error'); return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Add to Catalog',
      message: `Add "${newName}" to the product catalog?`,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsSubmitting(true);
        try {
          await ProductsService.createProduct({
            category_id: newCategory,
            name: newName,
            description: newDesc || undefined,
            price: parseFloat(newPrice),
            discount_price: newDiscountPrice ? parseFloat(newDiscountPrice) : null,
            sku: newSku || undefined,
            barcode: newBarcode || undefined,
            image_url: newImage || undefined,
            is_active: newIsActive,
            pack_quantity: newPackQuantity ? parseFloat(newPackQuantity) : null,
            pack_unit: newPackUnit || null,
            supplier_id: newSupplierId || null,
            purchase_price: newPurchasePrice ? parseFloat(newPurchasePrice) : null,
            minimum_order_quantity: newMoq ? parseInt(newMoq, 10) : null,
            vendor_sku: newVendorSku || null
          });
          await refreshData();
          // Reset form
          setNewName(''); setNewDesc(''); setNewPrice(''); setNewDiscountPrice('');
          setNewSku(''); setNewBarcode(''); setNewPackQuantity(''); setNewPackUnit('');
          setNewSupplierId(''); setNewPurchasePrice(''); setNewMoq('1'); setNewVendorSku('');
          setShowAddForm(false);
          addToast(`Product "${newName}" added to catalog!`, 'success');
        } catch (err: any) {
          addToast(`Error adding product: ${err.message}`, 'error');
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  const handleStartEdit = async (p: any) => {
    setEditingProductId(p.id);
    setEditName(p.name);
    setEditPrice(p.price.toString());
    setEditDiscountPrice(p.discount_price != null ? p.discount_price.toString() : '');
    setEditCategory(p.category_id);
    setEditSku(p.sku || '');
    setEditBarcode(p.barcode || '');
    setEditImageUrl(p.image_url || '');
    setEditPackQuantity(p.pack_quantity != null ? p.pack_quantity.toString() : '');
    setEditPackUnit(p.pack_unit || '');
    
    setEditSupplierId('');
    setEditPurchasePrice('');
    setEditMoq('1');
    setEditVendorSku('');

    try {
      const { supabase } = await import('../../../services/api/supabaseClient');
      const { data } = await supabase.from('vendor_products').select('*').eq('product_id', p.id).eq('is_active', true).limit(1);
      if (data && data.length > 0) {
        const vp = data[0];
        setEditSupplierId(vp.vendor_id);
        setEditPurchasePrice(vp.purchase_price != null ? vp.purchase_price.toString() : '');
        setEditMoq(vp.minimum_order_quantity != null ? vp.minimum_order_quantity.toString() : '1');
        setEditVendorSku(vp.vendor_sku || '');
      }
    } catch (e) {
      console.error('Error fetching product supplier mapping:', e);
    }
  };

  const isValidEAN13 = (ean: string): boolean => {
    if (!/^\d{13}$/.test(ean)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(ean[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(ean[12], 10);
  };

  const handleSaveProductEdit = async (productId: string) => {
    const updates: Record<string, any> = {};
    const original = products.find(p => p.id === productId);
    if (!original) return;

    if (editName && editName !== original.name) updates.name = editName;
    if (editCategory && editCategory !== original.category_id) updates.category_id = editCategory;
    if (editPrice && parseFloat(editPrice) !== original.price) updates.price = parseFloat(editPrice);
    if (editDiscountPrice !== (original.discount_price?.toString() ?? '')) {
      updates.discount_price = editDiscountPrice ? parseFloat(editDiscountPrice) : -1; // -1 = clear
    }
    if (editSku && editSku !== original.sku) updates.sku = editSku;
    if (editBarcode && editBarcode !== original.barcode) updates.barcode = editBarcode;
    if (editImageUrl !== (original.image_url || '')) updates.image_url = editImageUrl;
    if (editPackQuantity !== (original.pack_quantity?.toString() ?? '')) {
      updates.pack_quantity = editPackQuantity ? parseFloat(editPackQuantity) : null;
    }
    if (editPackUnit !== (original.pack_unit ?? '')) {
      updates.pack_unit = editPackUnit || null;
    }

    if (editSupplierId) {
      updates.supplier_id = editSupplierId;
      updates.purchase_price = editPurchasePrice ? parseFloat(editPurchasePrice) : null;
      updates.minimum_order_quantity = editMoq ? parseInt(editMoq, 10) : 1;
      updates.vendor_sku = editVendorSku || null;
    }

    if (Object.keys(updates).length === 0) {
      setEditingProductId(null);
      return;
    }


    // Client-side validation
    if (updates.price !== undefined && updates.price < 0) {
      addToast('Price cannot be negative', 'error'); return;
    }
    if (updates.discount_price !== undefined && updates.discount_price !== -1) {
      const basePrice = updates.price ?? original.price;
      if (updates.discount_price > basePrice) {
        addToast('Discount price cannot exceed base price', 'error'); return;
      }
    }

    try {
      await ProductsService.updateProduct(productId, updates);
      await refreshData();
      setEditingProductId(null);
      addToast('Product updated successfully!', 'success');
    } catch (err: any) {
      addToast(`Error updating product: ${err.message}`, 'error');
    }
  };

  // Soft-deactivate (not hard delete — product stays in DB for order history)
  const handleDeactivateProduct = (productId: string, productName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Deactivate Product',
      message: `Deactivate "${productName}"? It will be hidden from the customer catalog and cannot be added to new orders. You can reactivate it later. This does NOT delete the product.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await ProductsService.deactivateProduct(productId);
          await refreshData();
          addToast(`"${productName}" deactivated. Reactivate it from the Inactive filter.`, 'info');
        } catch (err: any) {
          addToast(`Error deactivating product: ${err.message}`, 'error');
        }
      }
    });
  };

  const handleReactivateProduct = async (productId: string, productName: string) => {
    try {
      await ProductsService.reactivateProduct(productId);
      await refreshData();
      addToast(`"${productName}" is now active and visible in the customer catalog.`, 'success');
    } catch (err: any) {
      addToast(`Error reactivating product: ${err.message}`, 'error');
    }
  };

  const handleFileSelect = (e: any) => {
    e.preventDefault();
    setIsDraggingCSV(false);
    
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
      addToast('Please upload a valid .csv file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      const rows = text.split('\n').filter(r => r.trim());
      if (rows.length <= 1) {
        addToast('CSV is empty or only contains headers', 'error');
        return;
      }
      
      const dataRows = rows.slice(1);
      let imported = 0;
      let skipped = 0;
      setIsSubmitting(true);
      
      const existingSkus = new Set(products.map(p => p.sku).filter(Boolean));
      
      try {
        for (const row of dataRows) {
           // Safely split by comma, ignoring commas inside double quotes
           const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));
           
           // Expected: name,description,category_name,brand,sku,barcode,unit_size,mrp,selling_price,image_url,is_active
           if (cols.length < 11) continue;
           
           const name = cols[0];
           const description = cols[1];
           const categoryName = cols[2];
           const brand = cols[3];
           const sku = cols[4];
           const barcode = cols[5];
           const unit_size = cols[6];
           const mrp = cols[7];
           const selling_price = cols[8];
           const image_url = cols[9];
           const is_active = cols[10].toLowerCase() === 'true';

           if (sku && existingSkus.has(sku)) {
             skipped++;
             continue; // Skip duplicate SKUs (both existing in DB and internal to this CSV)
           }

           const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
           if (!category) {
             console.warn(`Category ${categoryName} not found for product ${name}`);
           }
           
           let basePrice = parseFloat(mrp);
           let sellPrice = parseFloat(selling_price);
           
           if (isNaN(basePrice) || basePrice === 0) {
             basePrice = sellPrice || 0;
           }
           
           let finalDiscount: number | null = null;
           if (!isNaN(sellPrice) && sellPrice < basePrice) {
             finalDiscount = sellPrice;
           }
           
           await ProductsService.createProduct({
              category_id: category?.id || categories[0]?.id || '',
              name,
              description,
              price: basePrice,
              discount_price: finalDiscount,
              sku: sku || undefined,
              barcode: barcode || undefined,
              image_url: image_url || undefined,
              is_active
           });
           
           if (sku) existingSkus.add(sku); // Prevent duplicate internal inserts
           imported++;
        }
        await refreshData();
        addToast(`Imported ${imported} products! ${skipped > 0 ? `(Skipped ${skipped} duplicates)` : ''}`, 'success');
      } catch (err: any) {
         addToast(`Error importing: ${err.message}`, 'error');
      } finally {
         setIsSubmitting(false);
         if (e.target && e.target.value) e.target.value = ''; // Reset input
      }
    };
    reader.readAsText(file);
  };

  // Category hide/show — wires to admin_set_category_active RPC (persisted in DB)
  const handleCategoryToggle = async (cat: Category) => {
    const newActive = !cat.active;
    try {
      await ProductsService.setCategoryActive(cat.id, newActive);
      await refreshData();
      addToast(`Category "${cat.name}" ${newActive ? 'shown' : 'hidden'} for customers.`, 'success');
    } catch (err: any) {
      addToast(`Error updating category: ${err.message}`, 'error');
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="container" style={{ position: 'relative' }}>

      {/* Loading overlay */}
      {isLoadingData && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-base)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw className="spin" size={32} style={{ marginBottom: '16px', color: 'var(--primary)' }} />
          <h3 style={{ color: 'var(--text-primary)' }}>Loading Catalog...</h3>
        </div>
      )}

      {/* Error overlay */}
      {dataLoadError && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-base)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldAlert size={48} style={{ marginBottom: '16px', color: 'var(--accent-red)' }} />
          <h3 style={{ color: 'var(--accent-red)' }}>Connection Error</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{dataLoadError}</p>
          <button onClick={refreshData} style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent-red)', color: 'white', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="catalog-tab-bar glass-panel">
        <button onClick={() => setCatalogSubTab('products')} style={catalogTabBtnStyle(catalogSubTab === 'products')}>
          📦 Manage Products Catalog
        </button>
        <button onClick={() => setCatalogSubTab('categories')} style={catalogTabBtnStyle(catalogSubTab === 'categories')}>
          📁 Categories
        </button>
      </div>

      {/* ── PRODUCTS TAB ─────────────────────────────────────────────────── */}
      {catalogSubTab === 'products' && (
        <div className="catalog-grid">
          <div className="catalog-table-card glass-panel animate-slide-up">

            {/* Header row */}
            <div className="card-header-row" style={{ flexWrap: 'wrap', gap: '12px', borderBottom: 'none', alignItems: 'flex-start' }}>
              <div className="card-title" style={{ whiteSpace: 'nowrap', fontSize: '1.1rem', paddingTop: '10px' }}>
                Catalog Registry
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '8px' }}>
                  {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
                  {filteredProducts.length >= 200 && (
                    <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>
                      · Showing first 200 — use search/filter to narrow results
                    </span>
                  )}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                {/* Active filter */}
                <select
                  value={filterActive}
                  onChange={e => { setFilterActive(e.target.value as any); setCurrentPage(0); }}
                  className="admin-input"
                  style={{ height: '38px', borderRadius: '8px', fontSize: '0.82rem', padding: '0 10px' }}
                >
                  <option value="all">All Products ({products.length})</option>
                  <option value="active">Active ({products.filter(p => p.is_active !== false).length})</option>
                  <option value="inactive">Inactive ({products.filter(p => p.is_active === false).length})</option>
                </select>

                {/* Add Product */}
                <button
                  className="secondary-btn"
                  onClick={() => setShowAddForm(true)}
                  style={{ height: '38px', borderRadius: '8px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', fontSize: '0.82rem' }}
                >
                  <Plus size={14} /> Add Product
                </button>
              </div>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setIsDraggingCSV(true); }}
              onDragLeave={() => setIsDraggingCSV(false)}
              onDrop={handleFileSelect}
              onClick={() => document.getElementById('csv-upload')?.click()}
              style={csvDropZoneStyle(isDraggingCSV)}
            >
              <FileSpreadsheet size={18} color="var(--primary)" />
              <span>Drag &amp; drop a CSV file here or click to browse</span>
              <input type="file" id="csv-upload" accept=".csv" style={{ display: 'none' }} onChange={handleFileSelect} />
            </div>

            {/* Product table */}
            <div className="scroll-wrapper">
              <DataTable
                data={pagedProducts}
                keyExtractor={p => p.id}
                searchPlaceholder="Search by product name, SKU, or barcode..."
                filterableColumns={[
                  {
                    key: 'category_id',
                    label: 'Category',
                    options: [
                      { label: 'All Categories', value: '' },
                      ...categories.map(c => ({ label: c.name, value: c.id }))
                    ]
                  }
                ]}
                columns={[
                  {
                    key: 'image', header: 'IMG',
                    render: p => editingProductId === p.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <img 
                          src={editImageUrl} 
                          alt="Preview" 
                          style={{ width: '48px', height: '48px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #e5e7eb' }} 
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/48?text=Error';
                          }}
                        />
                        <input 
                          type="text" 
                          value={editImageUrl} 
                          onChange={e => setEditImageUrl(e.target.value)}
                          className="small-input-field" 
                          placeholder="Image URL" 
                          style={{ padding: '4px', width: '120px' }} 
                        />
                      </div>
                    ) : (
                      <div 
                        style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBarcodeProduct(p);
                        }}
                      >
                        <img src={p.image_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', opacity: p.is_active === false ? 0.4 : 1 }} />
                        {p.is_active === false && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <EyeOff size={12} color="var(--accent-red)" />
                          </div>
                        )}
                      </div>
                    )
                  },
                  {
                    key: 'name', header: 'PRODUCT', sortable: true,
                    render: p => editingProductId === p.id
                      ? (
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                          className="small-input-field" style={{ padding: '4px', width: '130px' }} />
                      ) : (
                        <div>
                          <div style={{ fontWeight: 700, color: p.is_active === false ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                            {p.name}
                          </div>
                          {p.is_active === false && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--accent-red)', fontWeight: 600 }}>INACTIVE</span>
                          )}
                        </div>
                      )
                  },
                  {
                    key: 'sku', header: 'PRODUCT CODE / SKU', sortable: true,
                    render: p => editingProductId === p.id
                      ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input type="text" value={editSku} onChange={e => setEditSku(e.target.value)}
                            className="small-input-field" placeholder="Product Code (e.g. FG-ARD-008)" style={{ padding: '4px', width: '200px' }} />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '32px' }}>
                          <div>
                            <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem' }}>{p.sku || 'N/A'}</div>
                          </div>
                        </div>
                      )
                  },
                  {
                    key: 'price', header: 'BASE / DISCOUNT', sortable: true,
                    render: p => editingProductId === p.id
                      ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input type="number" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                            className="small-input-field" placeholder="Base ₹" />
                          <input type="number" step="0.01" value={editDiscountPrice} onChange={e => setEditDiscountPrice(e.target.value)}
                            className="small-input-field" placeholder="Disc ₹ (blank=clear)" style={{ borderColor: 'var(--primary)' }} />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 800 }}>₹{p.price.toFixed(2)}</span>
                          {p.discount_price != null && (
                            <span className="disc-price-label">₹{p.discount_price.toFixed(2)} sale</span>
                          )}
                        </div>
                      )
                  },
                  {
                    key: 'pack_and_supplier', header: 'PACK / SUPPLIER',
                    render: p => editingProductId === p.id
                      ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input type="number" step="0.01" value={editPackQuantity} onChange={e => setEditPackQuantity(e.target.value)}
                              className="small-input-field" placeholder="Qty" style={{ width: '60px' }} />
                            <select value={editPackUnit} onChange={e => setEditPackUnit(e.target.value)} className="small-input-field" style={{ flex: 1 }}>
                              <option value="">-Unit-</option>
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                              <option value="ml">ml</option>
                              <option value="L">L</option>
                              <option value="pcs">pcs</option>
                            </select>
                          </div>
                          <select value={editSupplierId} onChange={e => setEditSupplierId(e.target.value)} className="small-input-field">
                            <option value="">-- No Supplier --</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                          {editSupplierId && (
                            <>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <input type="number" step="0.01" value={editPurchasePrice} onChange={e => setEditPurchasePrice(e.target.value)}
                                  className="small-input-field" placeholder="Cost ₹" style={{ flex: 1 }} />
                                <input type="number" step="1" value={editMoq} onChange={e => setEditMoq(e.target.value)}
                                  className="small-input-field" placeholder="MOQ" style={{ width: '50px' }} />
                              </div>
                              <input type="text" value={editVendorSku} onChange={e => setEditVendorSku(e.target.value)}
                                className="small-input-field" placeholder="Vendor SKU" />
                            </>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: 600 }}>{p.pack_quantity ? `${p.pack_quantity}${p.pack_unit}` : 'No Pack'}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>Check details</span>
                        </div>
                      )
                  },
                  {
                    key: 'status', header: 'STATUS',
                    render: p => (
                      <span className={p.is_active !== false ? 'admin-badge-success' : 'admin-badge-warning'}>
                        {p.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    )
                  },
                  {
                    key: 'actions', header: 'ACTIONS',
                    render: p => editingProductId === p.id
                      ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => handleSaveProductEdit(p.id)} className="small-save-btn">
                            <Check size={12} />
                          </button>
                          <button onClick={() => setEditingProductId(null)} className="small-cancel-btn">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => handleStartEdit(p)} className="small-edit-btn" title="Edit catalog metadata">
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => setSelectedBarcodeProduct(p)} className="small-edit-btn" title="View Barcode" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                            <Barcode size={12} />
                          </button>
                          {p.is_active !== false
                            ? (
                              <button
                                onClick={() => handleDeactivateProduct(p.id, p.name)}
                                className="small-delete-btn"
                                title="Deactivate (soft-hide from catalog)"
                                style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}
                              >
                                <EyeOff size={12} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReactivateProduct(p.id, p.name)}
                                className="small-save-btn"
                                title="Reactivate product"
                              >
                                <Eye size={12} />
                              </button>
                            )
                          }
                        </div>
                      )
                  },
                ]}
              />
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '12px 0', borderTop: '1px solid var(--border-light)' }}>
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-primary)', cursor: currentPage === 0 ? 'not-allowed' : 'pointer', opacity: currentPage === 0 ? 0.4 : 1 }}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Page {currentPage + 1} of {totalPages} ({filteredProducts.length} total)
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-primary)', cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages - 1 ? 0.4 : 1 }}
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          {/* Add Product Modal */}
          {showAddForm && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={() => setShowAddForm(false)}>
              <div className="form-container glass-panel animate-slide-up" style={{ padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', backgroundColor: 'var(--bg-surface)' }} onClick={e => e.stopPropagation()}>
                <div style={{ position: 'sticky', top: '-24px', backgroundColor: 'var(--bg-surface)', margin: '-24px -24px 20px -24px', padding: '18px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Add New Catalog Product</div>
                  <button onClick={() => setShowAddForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={22} /></button>
                </div>

                {/* Security note */}
                <div style={{ backgroundColor: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--primary)' }} />
                  <span>Stock and warehouse location are managed by Warehouse Ops. This form creates the <strong>catalog entry only</strong>.</span>
                </div>

                <form onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Product Name *</label>
                    <input type="text" placeholder="e.g. Organic Strawberries"
                      value={newName} onChange={e => setNewName(e.target.value)}
                      className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} required />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Category *</label>
                      <CustomDropdown
                        value={newCategory}
                        onChange={setNewCategory}
                        options={categories.map(c => ({ label: c.name, value: c.id }))}
                        placeholder="-- Select Category --"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Start Active?</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '42px' }}>
                        <button
                          type="button"
                          onClick={() => setNewIsActive(!newIsActive)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: newIsActive ? 'var(--primary)' : 'var(--text-secondary)' }}
                        >
                          {newIsActive ? <ToggleRight size={28} color="var(--primary)" /> : <ToggleLeft size={28} />}
                          <span style={{ fontSize: '0.82rem' }}>{newIsActive ? 'Active (visible)' : 'Inactive (hidden)'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Base Price (₹) *</label>
                      <input type="number" step="0.01" min="0"
                        value={newPrice} onChange={e => setNewPrice(e.target.value)}
                        className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} required />
                    </div>
                    <div>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Discount Price (₹)</label>
                      <input type="number" step="0.01" min="0"
                        value={newDiscountPrice} onChange={e => setNewDiscountPrice(e.target.value)}
                        className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Pack Quantity</label>
                      <input type="number" step="0.01" min="0.01" placeholder="e.g. 500"
                        value={newPackQuantity} onChange={e => setNewPackQuantity(e.target.value)}
                        className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Unit</label>
                      <select 
                        value={newPackUnit} 
                        onChange={e => setNewPackUnit(e.target.value)}
                        className="admin-input" 
                        style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box', backgroundColor: 'var(--bg-surface)' }}
                      >
                        <option value="">-- None --</option>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="L">L</option>
                        <option value="pcs">pcs</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Supplier / Procurement</div>
                    <div>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Supplier</label>
                      <CustomDropdown
                        value={newSupplierId}
                        onChange={setNewSupplierId}
                        options={[{ label: '-- No Supplier --', value: '' }, ...vendors.map(v => ({ label: v.name, value: v.id }))]}
                        placeholder="-- Select Supplier --"
                      />
                    </div>
                    {newSupplierId && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        <div>
                          <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Purchase Price (₹)</label>
                          <input type="number" step="0.01" min="0" placeholder="0.00"
                            value={newPurchasePrice} onChange={e => setNewPurchasePrice(e.target.value)}
                            className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>MOQ</label>
                          <input type="number" min="1" step="1" placeholder="1"
                            value={newMoq} onChange={e => setNewMoq(e.target.value)}
                            className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Vendor SKU</label>
                          <input type="text" placeholder="Optional"
                            value={newVendorSku} onChange={e => setNewVendorSku(e.target.value)}
                            className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>SKU (auto if blank)</label>
                      <input type="text" placeholder="Auto-generated"
                        value={newSku} onChange={e => setNewSku(e.target.value)}
                        className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Barcode (auto if blank)</label>
                      <input type="text" placeholder="Auto-generated"
                        value={newBarcode} onChange={e => setNewBarcode(e.target.value)}
                        className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div>
                    <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Description</label>
                    <textarea placeholder="Product details..."
                      value={newDesc} onChange={e => setNewDesc(e.target.value)}
                      className="admin-input" style={{ height: '72px', borderRadius: '8px', boxSizing: 'border-box', resize: 'vertical' }} />
                  </div>

                  <div>
                    <label className="admin-label" style={{ textAlign: 'left', display: 'block' }}>Image URL</label>
                    <input type="text"
                      value={newImage} onChange={e => setNewImage(e.target.value)}
                      className="admin-input" style={{ height: '42px', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>

                  <button type="submit" disabled={isSubmitting}
                    style={{ width: '100%', height: '44px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Plus size={16} /> {isSubmitting ? 'Adding...' : 'Add to Catalog'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Barcode Preview Modal */}
          {selectedBarcodeProduct && (
            <div 
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} 
              onClick={() => setSelectedBarcodeProduct(null)}
            >
              <div 
                className="form-container glass-panel animate-slide-up" 
                style={{ padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '420px', backgroundColor: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }} 
                onClick={e => e.stopPropagation()}
              >
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Barcode size={20} />
                    FlashGO Barcode
                  </div>
                  <button onClick={() => setSelectedBarcodeProduct(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <X size={22} />
                  </button>
                </div>
                
                <img 
                  src={selectedBarcodeProduct.image_url} 
                  alt="" 
                  style={{ width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover' }} 
                />
                
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {selectedBarcodeProduct.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Product Code / SKU: {selectedBarcodeProduct.sku || 'N/A'}
                  </div>
                </div>

                <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {selectedBarcodeProduct.internal_barcode ? (
                    <ReactBarcode 
                      value={selectedBarcodeProduct.internal_barcode} 
                      format="CODE128" 
                      width={2} 
                      height={80} 
                      fontSize={16} 
                      margin={0} 
                      background="#ffffff" 
                    />
                  ) : (
                    <div style={{ color: 'var(--accent-red)', fontWeight: 600 }}>No internal barcode assigned</div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── CATEGORIES TAB ─────────────────────────────────────────────────── */}
      {catalogSubTab === 'categories' && (
        <div className="categories-layout-grid">
          <div className="categories-card glass-panel animate-slide-up">
            <div className="panel-header" style={{ marginBottom: '4px' }}>
              Category Visibility ({categories.length} categories)
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '4px 16px 12px', borderBottom: '1px solid var(--border-light)' }}>
              Toggle visibility controls whether a category (and its products) appears to customers. Changes are persisted in real-time.
            </div>
            <div className="categories-list">
              {categories.map(c => (
                <div key={c.id} className="category-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="category-icon-container">
                      <Tag size={14} color="var(--primary)" />
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.85rem' }}>{c.name}</strong>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                        Slug: /{c.slug}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: c.active ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                      {c.active ? 'Visible' : 'Hidden'}
                    </span>
                    <button
                      onClick={() => handleCategoryToggle(c)}
                      style={{
                        padding: '6px 12px',
                        background: c.active ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                        color: c.active ? '#f59e0b' : 'var(--primary)',
                        border: `1px solid ${c.active ? '#f59e0b' : 'var(--primary)'}`,
                        borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem',
                        display: 'flex', alignItems: 'center', gap: '5px'
                      }}
                    >
                      {c.active ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM MODAL ──────────────────────────────────────────────────── */}
      {confirmModal?.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
          <div className="glass-panel" style={{ padding: '32px', borderRadius: '16px', maxWidth: '420px', width: '90%', backgroundColor: 'var(--bg-base)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-primary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={20} color="var(--primary)" />
              {confirmModal.title}
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: '1.6', fontSize: '0.92rem' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600 }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const catalogTabBtnStyle = (active: boolean): React.CSSProperties => ({
  backgroundColor: active ? 'var(--primary-glow)' : 'transparent',
  color: active ? 'var(--primary)' : 'var(--text-secondary)',
  border: active ? '1px solid var(--primary)' : '1px solid transparent',
  padding: '8px 16px',
  fontSize: '0.78rem',
  fontWeight: 700,
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all var(--transition-fast)',
});

const csvDropZoneStyle = (isDragging: boolean): React.CSSProperties => ({
  border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border-light)'}`,
  borderRadius: '8px',
  padding: '14px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  marginBottom: '14px',
  backgroundColor: isDragging ? 'var(--primary-glow)' : 'var(--bg-base)',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
});
