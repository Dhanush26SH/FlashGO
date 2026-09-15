import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, Modal, SafeAreaView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { QrCode, ClipboardList, Check, X, ScanLine } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface AuditorWorkflowProps {
  onWorkflowComplete: () => Promise<void>;
}

export default function AuditorWorkflow({ onWorkflowComplete }: AuditorWorkflowProps) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  
  const [physicalQty, setPhysicalQty] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    fetchOrClaimTask();
  }, []);

  const fetchOrClaimTask = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: countingTask, error: countErr } = await supabase
        .from('cycle_counts')
        .select('*, location:warehouse_locations(location_code, barcode)')
        .eq('counter_id', user.id)
        .eq('status', 'counting')
        .maybeSingle();

      if (countErr) throw countErr;

      let targetTask = countingTask;

      if (!targetTask) {
        const { data: openTasks, error: openErr } = await supabase
          .from('cycle_counts')
          .select('id')
          .eq('status', 'open')
          .order('created_at', { ascending: true })
          .limit(1);
          
        if (openErr) throw openErr;
        
        if (openTasks && openTasks.length > 0) {
          const { data: claimData, error: claimErr } = await supabase.rpc('warehouse_audit_claim', {
            p_count_id: openTasks[0].id
          });
          
          if (claimErr) throw claimErr;
          
          if (claimData.status === 'success') {
            const { data: claimedTask, error: fetchErr } = await supabase
              .from('cycle_counts')
              .select('*, location:warehouse_locations(location_code, barcode)')
              .eq('id', claimData.task_id)
              .single();
              
            if (fetchErr) throw fetchErr;
            targetTask = claimedTask;
          } else {
            console.log('Failed to claim:', claimData.message);
          }
        }
      }

      if (targetTask && targetTask.product_id) {
        // Explicitly fetch the product
        const { data: productData, error: productErr } = await supabase
          .from('products')
          .select('name, sku, internal_barcode')
          .eq('id', targetTask.product_id)
          .single();
          
        if (productErr) {
          console.error('Failed to fetch product for task', productErr);
        } else {
          targetTask.product = productData;
        }
        setTask(targetTask);
      } else if (targetTask) {
        setTask(targetTask);
      }
    } catch (err: any) {
      console.error('Task fetch/claim error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!isScanning || !task) return;
    
    const scanned = data.trim().toUpperCase();
    const expected = task.product?.internal_barcode?.trim().toUpperCase();

    if (!expected) {
      setIsScanning(false);
      Alert.alert(
        'Product Data Missing',
        'Unable to determine the expected barcode. Please refresh the task.',
      );
      return;
    }

    if (!/^FLH\d{6}$/.test(scanned)) {
      setIsScanning(false);
      Alert.alert(
        'Invalid Format',
        'Scanned barcode must be an internal FlashGO (FLH) barcode.',
        [{ text: 'Try Again', onPress: () => setIsScanning(true) }]
      );
      return;
    }

    if (scanned !== expected) {
      setIsScanning(false);
      Alert.alert(
        'Wrong Product',
        `Scanned barcode (${scanned}) does not match the assigned product (${expected}).`,
        [{ text: 'Try Again', onPress: () => setIsScanning(true) }]
      );
      return;
    }

    setIsScanning(false);
    setScannedBarcode(scanned);
  };

  const handleSubmit = async () => {
    if (!task || !scannedBarcode || physicalQty === '') return;
    
    const qty = parseInt(physicalQty, 10);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid non-negative physical quantity.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('warehouse_audit_submit', {
        p_count_id: task.id,
        p_physical_qty: qty,
        p_barcode: scannedBarcode
      });

      if (error) throw error;
      
      if (data.status === 'success') {
        Alert.alert('Success', `Audit completed. Variance recorded: ${data.variance}`);
        try {
          await onWorkflowComplete();
          setTask(null);
          setScannedBarcode('');
          setPhysicalQty('');
        } catch (releaseErr) {
          // Release duty failed and alerted. Stop local state cleanup.
          return;
        }
        fetchOrClaimTask();
      } else {
        Alert.alert('Error', data.message || 'Failed to submit audit');
        // Let them rescan or fix if backend rejected
        setScannedBarcode('');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'An error occurred during submission');
      // Let them rescan or fix if backend rejected
      setScannedBarcode('');
    } finally {
      setSubmitting(false);
    }
  };

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Camera Permission Required</Text>
        <Text style={styles.emptyText}>We need your permission to scan product barcodes for auditing.</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={requestPermission}>
          <Text style={styles.refreshButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Looking for audit tasks...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.center}>
        <ClipboardList size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>No Pending Audits</Text>
        <Text style={styles.emptyText}>You're all caught up. Waiting for new inventory audit assignments.</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={fetchOrClaimTask}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }


  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.taskCard}>
          <View style={styles.headerRow}>
            <Text style={styles.taskId}>Audit #{task.id.substring(0, 8).toUpperCase()}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>COUNTING</Text>
            </View>
          </View>
          
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 2 }}>Product</Text>
            <Text style={styles.productName}>{task.product?.name}</Text>
            
            <Text style={{ fontSize: 14, color: '#64748b', marginTop: 12, marginBottom: 2 }}>SKU</Text>
            <Text style={{ fontSize: 16, color: '#0f172a' }}>{task.product?.sku}</Text>
            
            <Text style={{ fontSize: 14, color: '#64748b', marginTop: 12, marginBottom: 2 }}>FlashGO Barcode</Text>
            <Text style={{ fontSize: 16, color: '#0f172a' }}>{task.product?.internal_barcode}</Text>
          </View>
          
          <View style={styles.locationContainer}>
            <Text style={styles.locationLabel}>Location to Audit</Text>
            <Text style={styles.locationCode}>{task.location?.location_code}</Text>
          </View>

          {!scannedBarcode ? (
            task.product?.internal_barcode ? (
              <TouchableOpacity 
                style={styles.scanButton} 
                onPress={() => setIsScanning(true)}
              >
                <QrCode size={24} color="#fff" />
                <Text style={styles.scanButtonText}>Scan Product Barcode</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ marginTop: 16, padding: 16, backgroundColor: '#fef2f2', borderRadius: 8, borderWidth: 1, borderColor: '#f87171' }}>
                <Text style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>Unable to load product details.</Text>
                <Text style={{ color: '#991b1b', marginBottom: 16 }}>The target product data could not be retrieved. You cannot scan without knowing what to audit.</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={fetchOrClaimTask}>
                  <Text style={styles.refreshButtonText}>Refresh and Try Again</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <View style={styles.verifiedContainer}>
              <View style={styles.verifiedRow}>
                <Check size={20} color="#10b981" />
                <Text style={styles.verifiedText}>Scanned: {scannedBarcode}</Text>
              </View>
              
              <Text style={styles.inputLabel}>Physical Quantity Counted:</Text>
              <TextInput
                style={styles.qtyInput}
                keyboardType="number-pad"
                value={physicalQty}
                onChangeText={setPhysicalQty}
                placeholder="0"
                editable={!submitting}
              />
              
              <TouchableOpacity 
                style={[styles.submitButton, (!physicalQty || submitting) ? styles.submitButtonDisabled : null]} 
                onPress={handleSubmit}
                disabled={!physicalQty || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Physical Count</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.rescanButton} onPress={() => setScannedBarcode('')}>
                <Text style={styles.rescanButtonText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
      
      <Modal visible={isScanning} animationType="slide" transparent={false} onRequestClose={() => setIsScanning(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#000', borderBottomWidth: 1, borderBottomColor: '#333' }}>
            <TouchableOpacity style={{ paddingVertical: 8, paddingHorizontal: 12 }} onPress={() => setIsScanning(false)}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>← Back</Text>
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 16 }}>Scan Product Barcode</Text>
          </View>
          
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e"]
              }}
            >
              <View style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 8, marginTop: -100, textAlign: 'center' }}>Scan FlashGO Barcode</Text>
                <Text style={{ color: '#fff', fontSize: 16, marginBottom: 40, textAlign: 'center', paddingHorizontal: 20 }}>for {task?.product?.name}</Text>
                <View style={{ width: 250, height: 250, borderWidth: 2, borderColor: '#10b981', borderRadius: 16, backgroundColor: 'transparent' }} />
              </View>
            </CameraView>
          </View>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, color: '#64748b', fontSize: 16, fontWeight: '500' },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 24 },
  refreshButton: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#f1f5f9', borderRadius: 8 },
  refreshButtonText: { color: '#0f172a', fontWeight: '600', fontSize: 16 },
  taskCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  taskId: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  statusBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusText: { color: '#0284c7', fontSize: 12, fontWeight: 'bold' },
  productName: { fontSize: 22, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  skuText: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  locationContainer: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 8, marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0' },
  locationLabel: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  locationCode: { fontSize: 24, fontWeight: 'bold', color: '#d97706' },
  scanButton: { backgroundColor: '#0f172a', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 12 },
  scanButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  verifiedContainer: { marginTop: 8 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24, gap: 8 },
  verifiedText: { color: '#0f172a', fontWeight: '600', fontSize: 15 },
  inputLabel: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 12 },
  qtyInput: { backgroundColor: '#f8fafc', borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 12, fontSize: 32, fontWeight: 'bold', padding: 20, textAlign: 'center', marginBottom: 24, color: '#0f172a' },
  submitButton: { backgroundColor: '#10b981', padding: 18, borderRadius: 12, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#94a3b8' },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  rescanButton: { marginTop: 16, padding: 16, alignItems: 'center' },
  rescanButtonText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  activeContainer: { flex: 1, backgroundColor: '#fff', padding: 16 },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  activeTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
  scannerWrapper: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }
});
