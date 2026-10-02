import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView, SafeAreaView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { QrCode, AlertTriangle, Check, X, MapPin, Apple } from 'lucide-react-native';
import { WarehouseScanner } from '../../components/WarehouseScanner';

const FNV_CATEGORY_ID = 'c0000000-0000-0000-0000-000000000001';

export default function FnvTaskWorkflow() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activeTask, setActiveTask] = useState<any>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<'location' | 'product' | null>(null);
  const [scannedLocation, setScannedLocation] = useState(false);
  const [scannedProduct, setScannedProduct] = useState(false);
  
  const [removedQty, setRemovedQty] = useState('');
  const [issueReason, setIssueReason] = useState<'good' | 'spoiled' | 'damaged' | 'quality_issue' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const getIstDateString = () => {
    const now = new Date();
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    fetchFnvInventory();
  }, []);

  const fetchFnvInventory = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('warehouse_id').eq('id', user.id).single();
      if (!profile) return;

      // Query F&V batches with available quantity > 0
      const { data: fnvBatches, error: batchErr } = await supabase
        .from('product_batches')
        .select(`
          id,
          available_quantity,
          product_id,
          batch_number,
          products!inner(
            name,
            internal_barcode,
            barcode,
            category_id
          )
        `)
        .eq('warehouse_id', profile.warehouse_id)
        .eq('status', 'active')
        .eq('products.category_id', FNV_CATEGORY_ID)
        .gt('available_quantity', 0);

      if (batchErr) throw batchErr;

      const todayString = getIstDateString();
      const { data: completions } = await supabase
        .from('fnv_inspections')
        .select('batch_id, location_id')
        .eq('warehouse_id', profile.warehouse_id)
        .eq('inspection_date', todayString);
        
      const completionSet = new Set((completions || []).map(c => `${c.batch_id}_${c.location_id}`));

      const enrichedTasks: any[] = [];
      for (const batch of (fnvBatches || [])) {
        const { data: placements } = await supabase
          .from('warehouse_product_placements')
          .select(`
            quantity,
            location_id,
            warehouse_locations (
              location_code,
              barcode
            )
          `)
          .eq('product_id', batch.product_id)
          .eq('warehouse_id', profile.warehouse_id)
          .gt('quantity', 0);
          
        if (placements && placements.length > 0) {
          placements.forEach(p => {
            enrichedTasks.push({
              batchId: batch.id,
              batchNumber: batch.batch_number,
              expectedQty: batch.available_quantity,
              productId: batch.product_id,
              productName: (batch.products as any)?.name,
              productInternalBarcode: (batch.products as any)?.internal_barcode,
              productBarcode: (batch.products as any)?.barcode,
              locationId: p.location_id,
              locationCode: (p.warehouse_locations as any)?.location_code,
              locationQR: (p.warehouse_locations as any)?.barcode,
              locationQty: p.quantity,
              isCompletedToday: completionSet.has(`${batch.id}_${p.location_id}`)
            });
          });
        }
      }

      setTasks(enrichedTasks);
    } catch (err: any) {
      console.error('Fetch F&V inventory error:', err);
      Alert.alert('Error', 'Failed to fetch F&V inventory.');
    } finally {
      setLoading(false);
    }
  };

  const startTask = (task: any) => {
    setActiveTask(task);
    setScanStep('location');
    setScannedLocation(false);
    setScannedProduct(false);
    setRemovedQty('');
    setIssueReason(null);
  };

  const cancelTask = () => {
    setActiveTask(null);
    setIsScanning(false);
  };

  const handleBarcodeScanned = (data: string) => {
    if (scanStep === 'location') {
      if (data === activeTask.locationQR) {
        setScannedLocation(true);
        setScanStep('product');
      } else {
        setIsScanning(false);
        Alert.alert('Invalid Location', `Scanned location does not match expected location: ${activeTask.locationCode}.`);
      }
    } else if (scanStep === 'product') {
      if (data === activeTask.productInternalBarcode || data === activeTask.productBarcode) {
        setScannedProduct(true);
        setIsScanning(false);
        setScanStep(null);
      } else {
        setIsScanning(false);
        Alert.alert('Invalid Product', 'Scanned barcode does not match the expected product.');
      }
    }
  };

  const submitRemoval = async () => {
    if (!issueReason) {
      Alert.alert('Error', 'Please select a quality issue reason.');
      return;
    }

    const qty = parseInt(removedQty, 10);
    if (issueReason !== 'good') {
      if (isNaN(qty) || qty <= 0) {
        Alert.alert('Invalid Quantity', 'Please enter a valid positive number.');
        return;
      }
      if (qty > activeTask.expectedQty || qty > activeTask.locationQty) {
        Alert.alert('Quantity Exceeded', `Cannot remove more than available in batch (${activeTask.expectedQty}) or location (${activeTask.locationQty}).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (issueReason === 'good') {
        const { error } = await supabase.rpc('record_fnv_inspection_good', {
          p_location_id: activeTask.locationId,
          p_batch_id: activeTask.batchId
        });
        if (error) throw error;
        Alert.alert('Success', 'Item marked as good. No inventory changed.');
      } else {
        const { data, error } = await supabase.rpc('remove_fnv_batch_inventory', {
          p_location_id: activeTask.locationId,
          p_batch_id: activeTask.batchId,
          p_removed_qty: qty,
          p_scanned_barcode: activeTask.productInternalBarcode, // Primary internal barcode for validation
          p_reason: issueReason,
          p_user_id: user?.id
        });

        if (error) throw error;
        Alert.alert('Success', `Removed ${qty} units of F&V stock for reason: ${issueReason}.`);
      }
      
      setActiveTask(null);
      fetchFnvInventory(); // Refresh
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to process removal.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Finding F&V inventory...</Text>
      </View>
    );
  }

  if (activeTask) {
    return (
      <View style={styles.taskContainer}>
        <WarehouseScanner
          visible={isScanning}
          onClose={() => setIsScanning(false)}
          onScan={handleBarcodeScanned}
          title={scanStep === 'location' ? 'Scan Location QR' : 'Scan Product Barcode'}
          instruction={scanStep === 'location' 
            ? `Scan QR for Location: ${activeTask.locationCode}` 
            : `Scan barcode for: ${activeTask.productName}`}
        />

        <View style={styles.taskHeader}>
          <Text style={styles.taskTitle}>Quality Inspection</Text>
          <TouchableOpacity onPress={cancelTask} disabled={submitting}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.productName}>{activeTask.productName}</Text>
          <Text style={styles.batchInfo}>Batch: {activeTask.batchNumber || 'N/A'}</Text>
          <Text style={styles.locationInfo}>Location: {activeTask.locationCode}</Text>
          <Text style={styles.quantityInfo}>Available Qty: {Math.min(activeTask.expectedQty, activeTask.locationQty)} units</Text>
        </View>

        <ScrollView style={styles.stepsContainer}>
          <View style={styles.stepRow}>
            <View style={[styles.stepCircle, scannedLocation && styles.stepCircleActive]}>
              {scannedLocation ? <Check size={16} color="#fff" /> : <Text style={styles.stepNumber}>1</Text>}
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Verify Location</Text>
              {!scannedLocation && (
                <TouchableOpacity style={styles.scanButton} onPress={() => { setScanStep('location'); setIsScanning(true); }}>
                  <QrCode size={16} color="#fff" />
                  <Text style={styles.scanButtonText}>Scan Location</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={[styles.stepCircle, scannedProduct && styles.stepCircleActive]}>
              {scannedProduct ? <Check size={16} color="#fff" /> : <Text style={styles.stepNumber}>2</Text>}
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Verify Product</Text>
              {!scannedProduct && scannedLocation && (
                <TouchableOpacity style={styles.scanButton} onPress={() => { setScanStep('product'); setIsScanning(true); }}>
                  <QrCode size={16} color="#fff" />
                  <Text style={styles.scanButtonText}>Scan Product</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {scannedLocation && scannedProduct && (
            <View style={styles.stepRow}>
              <View style={[styles.stepCircle, issueReason && styles.stepCircleActive]}>
                <Text style={styles.stepNumber}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Select Quality Reason</Text>
                <View style={styles.reasonButtons}>
                  <TouchableOpacity style={[styles.reasonBtn, issueReason === 'good' && styles.reasonBtnSelected]} onPress={() => { setIssueReason('good'); setRemovedQty(''); }}>
                    <Text style={[styles.reasonBtnText, issueReason === 'good' && styles.reasonBtnTextSelected]}>Good / No Issue</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.reasonBtn, issueReason === 'spoiled' && styles.reasonBtnSelected]} onPress={() => setIssueReason('spoiled')}>
                    <Text style={[styles.reasonBtnText, issueReason === 'spoiled' && styles.reasonBtnTextSelected]}>Rotten / Spoiled</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.reasonBtn, issueReason === 'damaged' && styles.reasonBtnSelected]} onPress={() => setIssueReason('damaged')}>
                    <Text style={[styles.reasonBtnText, issueReason === 'damaged' && styles.reasonBtnTextSelected]}>Damaged / Bruised</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.reasonBtn, issueReason === 'quality_issue' && styles.reasonBtnSelected]} onPress={() => setIssueReason('quality_issue')}>
                    <Text style={[styles.reasonBtnText, issueReason === 'quality_issue' && styles.reasonBtnTextSelected]}>Poor Quality / Unfit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {scannedLocation && scannedProduct && issueReason && issueReason !== 'good' && (
            <View style={styles.stepRow}>
              <View style={[styles.stepCircle, removedQty !== '' && styles.stepCircleActive]}>
                <Text style={styles.stepNumber}>4</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Enter Affected Quantity</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Quantity affected"
                  keyboardType="numeric"
                  value={removedQty}
                  onChangeText={setRemovedQty}
                />
              </View>
            </View>
          )}
        </ScrollView>

        {scannedLocation && scannedProduct && issueReason && (
          <View style={styles.actionContainer}>
            <TouchableOpacity 
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]} 
              onPress={submitRemoval}
              disabled={submitting || (issueReason !== 'good' && !removedQty)}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>{issueReason === 'good' ? 'Confirm Condition (No Removal)' : 'Confirm Removal'}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.listContainer}>
      <View style={styles.header}>
        <Apple size={28} color="#10b981" />
        <Text style={styles.headerTitle}>F&V Quality Tasks</Text>
      </View>

      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Check size={48} color="#10b981" />
          <Text style={styles.emptyStateText}>No F&V inventory found in your warehouse.</Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {tasks.map((t, idx) => (
            <TouchableOpacity 
              key={idx} 
              style={[styles.taskCard, t.isCompletedToday && { opacity: 0.6 }]} 
              onPress={() => !t.isCompletedToday && startTask(t)}
              activeOpacity={t.isCompletedToday ? 1 : 0.2}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardProductName} numberOfLines={1}>{t.productName}</Text>
                <View style={styles.badgeWarning}>
                  <Text style={styles.badgeText}>F&V</Text>
                </View>
              </View>
              <View style={styles.cardMid}>
                <Text style={styles.cardSub}>Batch: {t.batchNumber || 'N/A'}</Text>
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.locBadge}>
                  <MapPin size={14} color="#475569" style={{ marginRight: 4 }} />
                  <Text style={styles.locText}>{t.locationCode}</Text>
                </View>
                {t.isCompletedToday ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Check size={16} color="#10b981" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 14, color: '#10b981', fontWeight: '600' }}>Checked Today</Text>
                  </View>
                ) : (
                  <Text style={styles.cardQty}>{Math.min(t.expectedQty, t.locationQty)} units avail.</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 16 },
  listContainer: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginLeft: 12 },
  emptyState: { alignItems: 'center', marginTop: 60, padding: 20 },
  emptyStateText: { fontSize: 16, color: '#64748b', marginTop: 16, textAlign: 'center' },
  cardList: { padding: 16, gap: 12 },
  taskCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardProductName: { fontSize: 16, fontWeight: '600', color: '#0f172a', flex: 1, marginRight: 8 },
  badgeWarning: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#047857', fontSize: 12, fontWeight: '600' },
  cardMid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardSub: { fontSize: 14, color: '#64748b' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  locBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  locText: { fontSize: 14, fontWeight: '500', color: '#475569' },
  cardQty: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  button: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  taskContainer: { flex: 1, backgroundColor: '#f8fafc' },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  taskTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  cancelText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  infoCard: { margin: 16, padding: 16, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  productName: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  batchInfo: { fontSize: 15, color: '#475569', marginBottom: 4 },
  locationInfo: { fontSize: 16, color: '#0f172a', fontWeight: '600', marginTop: 4 },
  quantityInfo: { fontSize: 15, color: '#475569', marginTop: 4 },
  stepsContainer: { padding: 16 },
  stepRow: { flexDirection: 'row', marginBottom: 24 },
  stepCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  stepCircleActive: { backgroundColor: '#10b981' },
  stepNumber: { color: '#64748b', fontWeight: '700', fontSize: 16 },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  scanButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', padding: 10, borderRadius: 8, alignSelf: 'flex-start' },
  scanButtonText: { color: '#fff', fontWeight: '600', marginLeft: 8 },
  reasonButtons: { flexDirection: 'column', gap: 8 },
  reasonBtn: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  reasonBtnSelected: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  reasonBtnText: { color: '#475569', fontWeight: '500', textAlign: 'center' },
  reasonBtnTextSelected: { color: '#1d4ed8', fontWeight: '700' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 16 },
  actionContainer: { padding: 16, marginTop: 'auto', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  submitButton: { backgroundColor: '#10b981', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
