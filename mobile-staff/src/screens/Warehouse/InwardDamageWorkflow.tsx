import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, TextInput, Modal, SafeAreaView } from 'react-native';
import { Package, Search, Plus, Check, AlertTriangle, AlertCircle, RefreshCw, ScanLine, X, Camera } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface POItem {
  id: string;
  product_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  product: {
    name: string;
    sku: string;
    internal_barcode: string;
  };
  supplier_dispatch_batches?: {
    id: string;
    batch_number: string;
    expiry_date: string | null;
    dispatched_quantity: number;
    received_quantity: number;
  }[];
}

interface PO {
  id: string;
  vendor_id: string;
  status: string;
  vendor: {
    name: string;
  };
}

interface ReceivePayload {
  procurement_order_item_id: string;
  product_id: string;
  accepted_quantity: string;
  damaged_quantity: string;
  expired_quantity: string;
  supplier_dispatch_batch_id: string;
  unit_cost: number;
  scanned_barcode: string;
}

export default function InwardDamageWorkflow({ onWorkflowComplete }: { onWorkflowComplete: () => Promise<void> }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [procurements, setProcurements] = useState<PO[]>([]);
  const [selectedPO, setSelectedPO] = useState<string | null>(null);
  
  const [items, setItems] = useState<POItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  const [inputs, setInputs] = useState<Record<string, ReceivePayload>>({});
  const [submitting, setSubmitting] = useState(false);

  // Scanner States
  const [permission, requestPermission] = useCameraPermissions();
  const [scanningItemId, setScanningItemId] = useState<string | null>(null);
  const [verifiedItems, setVerifiedItems] = useState<Record<string, string>>({}); // itemId -> scannedBarcode

  useEffect(() => {
    fetchApprovedPOs();
  }, []);

  const fetchApprovedPOs = async () => {
    if (!profile?.warehouse_id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('procurement_orders')
        .select(`
          id, vendor_id, status,
          vendor:vendors(name)
        `)
        .eq('warehouse_id', profile.warehouse_id)
        .in('status', ['approved', 'partially_received']);

      if (error) throw error;
      // @ts-ignore
      setProcurements(data || []);
    } catch (err: any) {
      Alert.alert("Error fetching POs", err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPOItems = async (poId: string) => {
    try {
      setLoadingItems(true);
      const { data, error } = await supabase
        .from('procurement_order_items')
        .select(`
          id, product_id, quantity, received_quantity, cost_per_unit,
          product:products(name, sku, internal_barcode),
          supplier_dispatch_batches(id, batch_number, expiry_date, dispatched_quantity, received_quantity)
        `)
        .eq('procurement_order_id', poId);

      if (error) throw error;
      
      const newInputs: Record<string, ReceivePayload> = {};
      const fetchedItems = (data || []) as any[];
      fetchedItems.forEach(item => {
        newInputs[item.id] = {
          procurement_order_item_id: item.id,
          product_id: item.product_id,
          accepted_quantity: '0',
          damaged_quantity: '0',
          expired_quantity: '0',
          supplier_dispatch_batch_id: '',
          unit_cost: item.cost_per_unit,
          scanned_barcode: ''
        };
      });
      setInputs(newInputs);
      setItems(fetchedItems);
      setVerifiedItems({});
    } catch (err: any) {
      Alert.alert("Error fetching PO Items", err.message);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSelectPO = (poId: string) => {
    setSelectedPO(poId);
    fetchPOItems(poId);
  };

  const handleInputChange = (itemId: string, field: keyof ReceivePayload, value: string) => {
    setInputs(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  const handleScanProduct = async (itemId: string) => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Permission Required", "Camera access is needed to scan barcodes.");
        return;
      }
    }
    setScanningItemId(itemId);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!scanningItemId) return;
    
    const item = items.find(i => i.id === scanningItemId);
    if (!item) return;

    if (data === item.product.internal_barcode) {
      setVerifiedItems(prev => ({ ...prev, [scanningItemId]: data }));
      setInputs(prev => ({
        ...prev,
        [scanningItemId]: {
          ...prev[scanningItemId],
          scanned_barcode: data
        }
      }));
      setScanningItemId(null);
    } else {
      Alert.alert(
        "Invalid Barcode", 
        `Expected the internal FlashGO barcode for ${item.product.name}.\n\nScanned: ${data}`,
        [{ text: "Try Again" }]
      );
    }
  };

  const handleSubmit = async () => {
    if (!profile?.id || !profile?.warehouse_id || !selectedPO) return;

    try {
      setSubmitting(true);
      
      const payloadItems = Object.values(inputs).filter(inp => {
        const accepted = parseInt(inp.accepted_quantity || '0', 10);
        const damaged = parseInt(inp.damaged_quantity || '0', 10);
        const expired = parseInt(inp.expired_quantity || '0', 10);
        return (accepted + damaged + expired) > 0;
      }).map(inp => ({
        procurement_order_item_id: inp.procurement_order_item_id,
        product_id: inp.product_id,
        accepted_quantity: parseInt(inp.accepted_quantity || '0', 10),
        damaged_quantity: parseInt(inp.damaged_quantity || '0', 10),
        expired_quantity: parseInt(inp.expired_quantity || '0', 10),
        supplier_dispatch_batch_id: inp.supplier_dispatch_batch_id,
        unit_cost: inp.unit_cost,
        scanned_barcode: inp.scanned_barcode
      }));

      if (payloadItems.length === 0) {
        throw new Error('No items have positive receive quantities.');
      }

      for (const item of payloadItems) {
        if (!item.scanned_barcode) {
          throw new Error('Cannot submit unverified items.');
        }
      }

      const receiptNumber = `REC-${Math.floor(Math.random() * 1000000)}`;

      const { data, error } = await supabase.rpc('receive_procurement_order', {
        p_procurement_id: selectedPO,
        p_warehouse_id: profile.warehouse_id,
        p_user_id: profile.id,
        p_receipt_number: receiptNumber,
        p_notes: 'Received via mobile Inward scanner',
        p_items: payloadItems
      });

      if (error) throw error;
      
      if (data && data.success === false) {
        throw new Error(data.message || 'Error occurred during receive.');
      }

      Alert.alert(
        "Success", 
        "GRN generated successfully. Staging updated.",
        [{ text: "OK", onPress: async () => {
          try {
            await onWorkflowComplete();
            setSelectedPO(null);
            fetchApprovedPOs();
          } catch (releaseErr) {
            // Duty release failed, do not transition away
          }
        }}]
      );
      
    } catch (err: any) {
      console.error(err);
      Alert.alert("Failed to Receive", err.message || "An unknown error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Fetching Approved POs...</Text>
      </View>
    );
  }

  // Scanner is now rendered as a Modal at the bottom of the component

  if (!selectedPO) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Package color="#10b981" size={24} />
          <Text style={styles.headerTitle}>Select Procurement Order</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollArea}>
          {procurements.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No approved POs awaiting inwarding.</Text>
            </View>
          ) : (
            procurements.map(po => (
              <TouchableOpacity 
                key={po.id} 
                style={styles.poCard} 
                onPress={() => handleSelectPO(po.id)}
              >
                <View style={styles.poHeader}>
                  <Text style={styles.poId}>PO #{po.id.slice(-6).toUpperCase()}</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{po.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.poVendor}>Vendor: {po.vendor?.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => setSelectedPO(null)}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inward PO #{selectedPO.slice(-6).toUpperCase()}</Text>
      </View>

      {loadingItems ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : (
        <ScrollView style={styles.itemsList}>
          {items.map(item => {
            const inp = inputs[item.id] || {} as ReceivePayload;
            const isVerified = !!verifiedItems[item.id];
            const remaining = item.quantity - item.received_quantity;
            
            
            
            if (remaining <= 0) return null; // Already fully received
            
            const batches = item.supplier_dispatch_batches || [];
            
            return (
              <View key={item.id} style={[styles.itemCard, isVerified && styles.itemCardVerified]}>
                <View style={styles.itemHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.product?.name}</Text>
                    <Text style={styles.itemSku}>SKU: {item.product?.sku} | Remaining: {remaining}</Text>
                  </View>
                  {isVerified && (
                    <View style={styles.verifiedBadge}>
                      <Check color="#059669" size={16} />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
                </View>
                
                {batches.length === 0 ? (
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: '#fef3c7', borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                    <AlertTriangle color="#d97706" size={20} />
                    <Text style={{ marginLeft: 8, color: '#92400e', fontWeight: 'bold' }}>Awaiting supplier dispatch details</Text>
                  </View>
                ) : (
                  <View style={styles.inputsContainer}>
                    <Text style={[styles.label, { marginTop: 12, marginBottom: 8 }]}>Select Supplier Dispatch Batch:</Text>
                    <View style={{ gap: 8, marginBottom: 16 }}>
                      {batches.map(b => {
                        const remainingBatch = b.dispatched_quantity - b.received_quantity;
                        if (remainingBatch <= 0) return null;
                        const isSelected = inp.supplier_dispatch_batch_id === b.id;
                        return (
                          <TouchableOpacity 
                            key={b.id} 
                            style={{ 
                              padding: 12, 
                              borderRadius: 8, 
                              borderWidth: 1, 
                              borderColor: isSelected ? '#10b981' : '#e2e8f0',
                              backgroundColor: isSelected ? '#ecfdf5' : '#fff'
                            }}
                            onPress={() => handleInputChange(item.id, 'supplier_dispatch_batch_id', b.id)}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontWeight: 'bold', color: isSelected ? '#047857' : '#334155' }}>Batch: {b.batch_number}</Text>
                              {isSelected && <Check color="#10b981" size={16} />}
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 12, color: '#64748b' }}>Exp: {b.expiry_date || 'N/A'}</Text>
                              <Text style={{ fontSize: 12, color: '#64748b' }}>Qty Available: {remainingBatch} (of {b.dispatched_quantity})</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {!isVerified ? (
                      <TouchableOpacity 
                        style={[styles.scanBtn, !inp.supplier_dispatch_batch_id && { opacity: 0.5, backgroundColor: '#94a3b8' }]}
                        disabled={!inp.supplier_dispatch_batch_id}
                        onPress={() => handleScanProduct(item.id)}
                      >
                        <Camera color="#fff" size={16} />
                        <Text style={styles.scanBtnText}>
                          {inp.supplier_dispatch_batch_id ? "Verify FLH" : "Select Batch First"}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <Text style={styles.scannedBarcodeLabel}>Scanned FLH: {verifiedItems[item.id]}</Text>
                        
                        <View style={styles.row}>
                          <View style={styles.inputGroup}>
                            <Text style={styles.label}>Accepted Qty</Text>
                            <TextInput 
                              style={styles.input}
                              keyboardType="numeric"
                              value={inp.accepted_quantity}
                              onChangeText={(val) => handleInputChange(item.id, 'accepted_quantity', val)}
                            />
                          </View>
                        </View>
                        
                        <View style={styles.row}>
                          <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: '#f59e0b' }]}>Damaged Qty</Text>
                            <TextInput 
                              style={styles.input}
                              keyboardType="numeric"
                              value={inp.damaged_quantity}
                              onChangeText={(val) => handleInputChange(item.id, 'damaged_quantity', val)}
                            />
                          </View>
                          <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: '#ef4444' }]}>Expired Qty</Text>
                            <TextInput 
                              style={styles.input}
                              keyboardType="numeric"
                              value={inp.expired_quantity}
                              onChangeText={(val) => handleInputChange(item.id, 'expired_quantity', val)}
                            />
                          </View>
                        </View>
                        
                        <TouchableOpacity style={styles.rescanBtn} onPress={() => handleScanProduct(item.id)}>
                          <Text style={styles.rescanBtnText}>Rescan Barcode</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          
          <TouchableOpacity 
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit GRN</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={!!scanningItemId} animationType="slide" transparent={false} onRequestClose={() => setScanningItemId(null)}>
        {scanningItemId && (() => {
          const targetItem = items.find(i => i.id === scanningItemId);
          return (
            <SafeAreaView style={styles.scannerContainer}>
              <View style={styles.scannerHeader}>
                <TouchableOpacity style={styles.scannerCloseBtn} onPress={() => setScanningItemId(null)}>
                  <Text style={styles.scannerCloseText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.scannerHeaderTitle}>Scan Product Barcode</Text>
              </View>
              
              <View style={styles.cameraWrapper}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  onBarcodeScanned={handleBarcodeScanned}
                  barcodeScannerSettings={{
                    barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e"]
                  }}
                >
                  <View style={styles.scannerOverlay}>
                    <Text style={styles.scannerPrompt}>Scan FlashGO Barcode</Text>
                    <Text style={styles.scannerSubprompt}>for {targetItem?.product.name}</Text>
                    <View style={styles.scannerTarget} />
                  </View>
                </CameraView>
              </View>
            </SafeAreaView>
          );
        })()}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 16 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', gap: 12 },
  backBtn: { color: '#10b981', fontWeight: 'bold', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginLeft: 8 },
  scrollArea: { padding: 16 },
  emptyState: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 16 },
  poCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, borderWidth: 1, borderColor: '#f1f5f9' },
  poHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  poId: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  badge: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  poVendor: { fontSize: 14, color: '#475569' },
  itemsList: { padding: 16 },
  itemCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0' },
  itemCardVerified: { borderColor: '#10b981', borderWidth: 2 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemName: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  itemSku: { fontSize: 14, color: '#64748b' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  scanBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#d1fae5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  verifiedText: { color: '#059669', fontSize: 12, fontWeight: 'bold' },
  inputsContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  scannedBarcodeLabel: { fontSize: 12, color: '#059669', fontWeight: 'bold', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  inputGroup: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  rescanBtn: { alignSelf: 'flex-start', marginTop: 8 },
  rescanBtnText: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold' },
  submitBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 12, alignItems: 'center', marginVertical: 16 },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  // Scanner Styles
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#000', borderBottomWidth: 1, borderBottomColor: '#333' },
  scannerCloseBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  scannerCloseText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  scannerHeaderTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 16 },
  cameraWrapper: { flex: 1 },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  scannerPrompt: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 8, marginTop: -100, textAlign: 'center' },
  scannerSubprompt: { color: '#fff', fontSize: 16, marginBottom: 40, textAlign: 'center', paddingHorizontal: 20 },
  scannerTarget: { width: 250, height: 250, borderWidth: 2, borderColor: '#10b981', borderRadius: 16, backgroundColor: 'transparent' },
});
