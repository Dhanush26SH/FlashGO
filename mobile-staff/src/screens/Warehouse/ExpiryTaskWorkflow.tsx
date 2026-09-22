import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView, Modal, SafeAreaView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { QrCode, AlertTriangle, Check, X, MapPin } from 'lucide-react-native';
import { WarehouseScanner } from '../../components/WarehouseScanner';

export default function ExpiryTaskWorkflow() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activeTask, setActiveTask] = useState<any>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<'location' | 'product' | null>(null);
  const [scannedLocation, setScannedLocation] = useState(false);
  const [scannedProduct, setScannedProduct] = useState(false);
  
  const [removedQty, setRemovedQty] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchExpiredBatches();
  }, []);

  const fetchExpiredBatches = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('warehouse_id').eq('id', user.id).single();
      if (!profile) return;

      const today = new Date().toISOString().split('T')[0];

      // Query expired batches
      const { data: expiredBatches, error: batchErr } = await supabase
        .from('product_batches')
        .select(`
          id,
          expiry_date,
          available_quantity,
          product_id,
          batch_number,
          products (
            name,
            internal_barcode,
            barcode
          )
        `)
        .eq('warehouse_id', profile.warehouse_id)
        .eq('status', 'active')
        .lt('expiry_date', today)
        .gt('available_quantity', 0);

      if (batchErr) throw batchErr;

      // Find candidate locations for these products
      const enrichedTasks: any[] = [];
      for (const batch of (expiredBatches || [])) {
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
              expiryDate: batch.expiry_date,
              expectedQty: batch.available_quantity, // logical expected max
              productId: batch.product_id,
              productName: (batch.products as any)?.name,
              productInternalBarcode: (batch.products as any)?.internal_barcode,
              productBarcode: (batch.products as any)?.barcode,
              locationId: p.location_id,
              locationCode: (p.warehouse_locations as any)?.location_code,
              locationQR: (p.warehouse_locations as any)?.barcode,
              locationQty: p.quantity // physical max at this location
            });
          });
        }
      }

      setTasks(enrichedTasks);
    } catch (err: any) {
      console.error('Fetch expiry tasks error:', err);
      Alert.alert('Error', 'Failed to fetch expired inventory tasks.');
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
    const qty = parseInt(removedQty, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid positive number.');
      return;
    }
    if (qty > activeTask.expectedQty || qty > activeTask.locationQty) {
      Alert.alert('Quantity Exceeded', `Cannot remove more than available in batch (${activeTask.expectedQty}) or location (${activeTask.locationQty}).`);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('remove_expired_batch_inventory', {
        p_location_id: activeTask.locationId,
        p_batch_id: activeTask.batchId,
        p_removed_qty: qty,
        p_scanned_barcode: activeTask.productInternalBarcode, // Primary internal barcode for validation
        p_user_id: user?.id
      });

      if (error) throw error;
      
      Alert.alert('Success', `Removed ${qty} units of expired stock.`);
      setActiveTask(null);
      fetchExpiredBatches(); // Refresh
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to process removal.');
    } finally {
      setSubmitting(false);
    }
  };
  
  const reportMissing = async () => {
    Alert.alert(
      "Report Discrepancy",
      "Are you sure you want to report the remaining expected quantity as physically missing? This will create an Auditor Cycle Count task for this location.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Report Missing", 
          style: "destructive",
          onPress: async () => {
            try {
              setSubmitting(true);
              const { data: profile } = await supabase.from('profiles').select('warehouse_id').single();
              const { error } = await supabase.rpc('admin_create_warehouse_audit', {
                p_warehouse_id: profile?.warehouse_id,
                p_product_id: activeTask.productId,
                p_location_id: activeTask.locationId,
                p_note: 'Expiry removal discrepancy reported by staff'
              });
              if (error) throw error;
              Alert.alert('Reported', 'A cycle count task has been generated for an auditor.');
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Finding expired batches...</Text>
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
          <Text style={styles.taskTitle}>Expiry Removal</Text>
          <TouchableOpacity onPress={cancelTask} disabled={submitting}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.productName}>{activeTask.productName}</Text>
          <Text style={styles.batchInfo}>Batch: {activeTask.batchNumber || 'N/A'}</Text>
          <Text style={styles.expiryInfo}>Expired: {new Date(activeTask.expiryDate).toLocaleDateString()}</Text>
          <Text style={styles.locationInfo}>Go to Location: {activeTask.locationCode}</Text>
          <Text style={styles.quantityInfo}>Expected Qty: {Math.min(activeTask.expectedQty, activeTask.locationQty)} units</Text>
        </View>

        <View style={styles.stepsContainer}>
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

          <View style={styles.stepRow}>
            <View style={[styles.stepCircle, (scannedLocation && scannedProduct && removedQty !== '') && styles.stepCircleActive]}>
              <Text style={styles.stepNumber}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Enter Removed Quantity</Text>
              {scannedLocation && scannedProduct && (
                <TextInput
                  style={styles.input}
                  placeholder="Quantity found & removed"
                  keyboardType="numeric"
                  value={removedQty}
                  onChangeText={setRemovedQty}
                />
              )}
            </View>
          </View>
        </View>

        {scannedLocation && scannedProduct && (
          <View style={styles.actionContainer}>
            <TouchableOpacity 
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]} 
              onPress={submitRemoval}
              disabled={submitting || !removedQty}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Confirm Removal</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.reportButton} 
              onPress={reportMissing}
              disabled={submitting}
            >
              <Text style={styles.reportButtonText}>Report Discrepancy (Missing units)</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.listContainer}>
      <View style={styles.header}>
        <AlertTriangle size={28} color="#ef4444" />
        <Text style={styles.headerTitle}>Expired Inventory Tasks</Text>
      </View>

      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Check size={48} color="#10b981" />
          <Text style={styles.emptyStateText}>No expired inventory found in your warehouse.</Text>
        </View>
      ) : (
        <View style={styles.cardList}>
          {tasks.map((t, idx) => (
            <TouchableOpacity key={idx} style={styles.taskCard} onPress={() => startTask(t)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardProductName} numberOfLines={1}>{t.productName}</Text>
                <View style={styles.badgeWarning}>
                  <Text style={styles.badgeText}>Expired</Text>
                </View>
              </View>
              <View style={styles.cardMid}>
                <Text style={styles.cardSub}>Batch: {t.batchNumber || 'N/A'}</Text>
                <Text style={styles.cardSub}>Exp: {new Date(t.expiryDate).toLocaleDateString()}</Text>
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.locBadge}>
                  <MapPin size={14} color="#475569" style={{ marginRight: 4 }} />
                  <Text style={styles.locText}>{t.locationCode}</Text>
                </View>
                <Text style={styles.cardQty}>{Math.min(t.expectedQty, t.locationQty)} units exp.</Text>
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
  badgeWarning: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#b91c1c', fontSize: 12, fontWeight: '600' },
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
  expiryInfo: { fontSize: 15, color: '#ef4444', fontWeight: '600', marginBottom: 4 },
  locationInfo: { fontSize: 16, color: '#0f172a', fontWeight: '600', marginTop: 8 },
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
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 16 },
  actionContainer: { padding: 16, marginTop: 'auto', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  submitButton: { backgroundColor: '#10b981', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  reportButton: { padding: 16, alignItems: 'center' },
  reportButtonText: { color: '#ef4444', fontSize: 15, fontWeight: '600' }
});
