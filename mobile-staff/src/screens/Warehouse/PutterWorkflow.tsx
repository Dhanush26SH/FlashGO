import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Package, ScanLine, CheckCircle, ArrowRight, X, LocateFixed } from 'lucide-react-native';

interface PutterWorkflowProps {
  onWorkflowComplete: () => Promise<void>;
}

export default function PutterWorkflow({ onWorkflowComplete }: PutterWorkflowProps) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [product, setProduct] = useState<any>(null);
  
  // States: 'checking', 'pending_list', 'scanning', 'scanning_location_qr', 'confirm_location'
  const [step, setStep] = useState('checking');
  const [scannedLocationQr, setScannedLocationQr] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [completing, setCompleting] = useState(false);
  
  // Partial Putaway State
  const [putawayQuantity, setPutawayQuantity] = useState<string>('');
  const [releasing, setReleasing] = useState(false);
  const [reportingIssue, setReportingIssue] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    fetchTaskState();
  }, []);

  const fetchTaskState = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase.from('profiles').select('warehouse_id').eq('id', user.id).single();

      // First check if user has an in_progress task
      const { data: inProgress } = await supabase
        .from('putaway_tasks')
        .select(`*, products(*)`)
        .eq('worker_id', user.id)
        .eq('status', 'in_progress')
        .limit(1)
        .maybeSingle();

      if (inProgress) {
        if (!inProgress.destination_location) {
          const { data: destRes, error: destErr } = await supabase.rpc('warehouse_putaway_ensure_destination', {
            p_task_id: inProgress.id
          });
          if (destErr) {
            Alert.alert("Allocation Failed", "No valid putaway location available. Contact warehouse supervisor.");
            setStep('pending_list');
            return;
          }
          inProgress.destination_location = destRes.location_code;
        }
        
        setTask(inProgress);
        setProduct(inProgress.products);
        setStep('scanning'); // Ready to scan barcode
      } else {
        // Find a pending task
        const { data: pending } = await supabase
          .from('putaway_tasks')
          .select(`*, products(*)`)
          .eq('status', 'pending')
          .eq('warehouse_id', profile?.warehouse_id)
          .is('worker_id', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (pending) {
          setTask(pending);
          setProduct(pending.products);
          setStep('pending_list');
        } else {
          setTask(null);
          setProduct(null);
          setStep('pending_list'); // Will show empty state
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!task) return;
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc('warehouse_putaway_claim', {
        p_task_id: task.id
      });
      if (error) throw error;
      if (data.status === 'success') {
        fetchTaskState();
      } else {
        Alert.alert("Claim Failed", data.message);
        fetchTaskState();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
      fetchTaskState();
    } finally {
      setClaiming(false);
    }
  };

  const handleRelease = async () => {
    if (!task) return;
    setReleasing(true);
    try {
      const { data, error } = await supabase.rpc('warehouse_putaway_release', {
        p_task_id: task.id
      });
      if (error) throw error;
      if (data.status === 'success') {
        fetchTaskState();
      } else {
        Alert.alert("Release Failed", data.message);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setReleasing(false);
    }
  };

  const handleReportIssue = () => {
    Alert.alert(
      "Report Location Issue",
      "Why is this destination unsuitable?",
      [
        { text: "Wrong storage zone", onPress: () => submitIssue("Wrong storage zone") },
        { text: "Location full", onPress: () => submitIssue("Location full") },
        { text: "Location blocked/inaccessible", onPress: () => submitIssue("Location blocked/inaccessible") },
        { text: "Location damaged/unusable", onPress: () => submitIssue("Location damaged/unusable") },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const submitIssue = async (reason: string) => {
    if (!task) return;
    setReportingIssue(true);
    try {
      const { data, error } = await supabase.rpc('warehouse_putaway_report_issue', {
        p_task_id: task.id,
        p_reason: reason
      });
      if (error) throw error;
      if (data.status === 'success') {
        Alert.alert("Success", "Location issue reported. New destination assigned.");
        fetchTaskState();
      } else {
        throw new Error(data.message || "Failed to reassign");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setReportingIssue(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (step !== 'scanning') return;
    if (data === product.internal_barcode) {
      setStep('scanning_location_qr');
    } else {
      Alert.alert("Invalid Product", `Scanned: ${data}. Please scan the correct product (FLH...).`);
    }
  };

  const handleLocationQrScanned = async ({ data }: { data: string }) => {
    if (step !== 'scanning_location_qr') return;
    try {
      const { data: res, error } = await supabase.rpc('warehouse_putaway_verify_location_qr', {
        p_task_id: task.id,
        p_scanned_location_qr: data
      });
      if (error) throw error;
      if (res.status === 'success') {
        setScannedLocationQr(res.location_id); // Ensure we set the ID, not the code
        setPutawayQuantity(task.quantity.toString()); // Default to remaining task quantity
        setStep('confirm_location');
      } else {
        Alert.alert("Wrong Location", `Expected: ${res.expected}\nScanned: ${res.scanned || 'Unknown'}`);
      }
    } catch (e: any) {
      Alert.alert("Location Verification Failed", e.message);
    }
  };

  const handleComplete = async () => {
    if (!task || !product) return;
    
    const qty = parseInt(putawayQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid quantity greater than 0.");
      return;
    }
    
    setCompleting(true);
    try {
      const { data, error } = await supabase.rpc('warehouse_putaway_complete', {
        p_task_id: task.id,
        p_scanned_barcode: product.internal_barcode,
        p_location_id: scannedLocationQr, // this is now the UUID
        p_quantity: qty
      });
      if (error) throw error;
      if (data.status === 'success') {
        Alert.alert("Success", `Put away ${data.placed_quantity} units!`);
        if (data.remaining <= 0) {
          try {
            await onWorkflowComplete();
            setTask(null);
            setProduct(null);
          } catch (releaseErr) {
            // handleReleaseDuty already surfaced an alert. 
            // We just stop here so we don't transition away or refresh incorrectly.
            return;
          }
        } else {
          // Task still active, fetch updated state
          setStep('pending_list'); // Go back to pending list to show remaining
        }
        fetchTaskState();
      } else {
        throw new Error(data.message);
      }
    } catch (e: any) {
      Alert.alert("Completion Failed", e.message);
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Syncing tasks...</Text>
      </View>
    );
  }

  // 1. EMPTY STATE
  if (step === 'pending_list' && !task) {
    return (
      <View style={styles.centerContainer}>
        <Package size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Waiting for putaway tasks...</Text>
        <Text style={styles.emptySubtitle}>No tasks assigned right now</Text>
        <TouchableOpacity onPress={fetchTaskState} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 2. PENDING TASK VIEW
  if (step === 'pending_list' && task) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Package size={24} color="#0f172a" />
          <Text style={styles.cardTitle}>New Putaway Task</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.productName}>{product?.name || 'Unknown Product'}</Text>
          <Text style={styles.detailText}>Quantity: {task.quantity}</Text>
          {task.batch_id && <Text style={styles.detailText}>Batch ID: {task.batch_id.slice(0,8)}</Text>}
          {task.source_type && <Text style={styles.detailText}>Source: {task.source_type.toUpperCase()}</Text>}
          
          <TouchableOpacity 
            style={[styles.primaryBtn, claiming && styles.disabledBtn]} 
            onPress={handleClaim}
            disabled={claiming}
          >
            {claiming ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Start Putaway</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 3 & 4. IN_PROGRESS - SCANNING VIEWS
  if (step === 'scanning' || step === 'scanning_location_qr') {
    if (!permission) {
      return <View><ActivityIndicator /></View>;
    }
    if (!permission.granted) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptySubtitle}>We need your permission to show the camera</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.refreshBtn}>
            <Text style={styles.refreshBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isLocationStep = step === 'scanning_location_qr';

    return (
      <View style={styles.activeContainer}>
        <View style={styles.activeHeader}>
          <Text style={styles.activeTitle}>{isLocationStep ? 'Scan Location QR' : 'Scan Product Barcode'}</Text>
          <TouchableOpacity onPress={handleRelease} disabled={releasing}>
            <X size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
        
        {isLocationStep ? (
          <>
            <View style={styles.successHeader}>
              <CheckCircle size={32} color="#10b981" style={{ marginBottom: 8 }} />
              <Text style={styles.successTitle}>Product Verified</Text>
            </View>
            <View style={styles.productInfoBox}>
              <Text style={styles.locationLabel}>Destination</Text>
              <Text style={styles.locationValue}>{task?.destination_location}</Text>
              <TouchableOpacity onPress={handleReportIssue} disabled={reportingIssue} style={{marginTop: 8, alignSelf: 'center'}}>
                <Text style={{color: '#dc2626', fontWeight: 'bold', textDecorationLine: 'underline'}}>
                  {reportingIssue ? "Reporting..." : "Report Location Issue"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.productInfoBox}>
            <Text style={styles.productName}>{product?.name}</Text>
            <Text style={styles.barcodeText}>Expected Barcode: {product?.internal_barcode}</Text>
            <Text style={styles.detailText}>Qty to put away: {task?.quantity}</Text>
          </View>
        )}

        <View style={styles.scannerWrapper}>
          <CameraView 
            style={StyleSheet.absoluteFillObject} 
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: isLocationStep ? ['qr', 'code128'] : ['code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'qr']
            }}
            onBarcodeScanned={isLocationStep ? handleLocationQrScanned : handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            {isLocationStep ? <LocateFixed size={64} color="#3b82f6" /> : <ScanLine size={64} color="#10b981" />}
          </View>
        </View>
      </View>
    );
  }

  // 6. CONFIRM LOCATION (FINAL STEP)
  if (step === 'confirm_location') {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <CheckCircle size={24} color="#10b981" />
          <Text style={styles.cardTitle}>Ready to Place</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.detailText}>Product: {product?.name}</Text>
          <Text style={styles.detailText}>Destination: {task?.destination_location}</Text>
          
          <Text style={{ marginTop: 16, fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>Quantity to Put Away:</Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 8,
              padding: 12,
              marginTop: 8,
              fontSize: 18,
              backgroundColor: '#fff',
              color: '#0f172a',
            }}
            keyboardType="numeric"
            value={putawayQuantity}
            onChangeText={setPutawayQuantity}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 }}>
            <TouchableOpacity 
              style={[styles.secondaryBtn, { flex: 1, marginRight: 8 }]} 
              onPress={() => setStep('scanning_location_qr')}
            >
              <Text style={styles.secondaryBtnText}>Rescan Loc</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.primaryBtn, { flex: 2, marginLeft: 8, marginTop: 0 }, completing && styles.disabledBtn]} 
              onPress={handleComplete}
              disabled={completing}
            >
              {completing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Confirm Placement</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#64748b' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#475569', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  refreshBtn: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#f1f5f9', borderRadius: 8 },
  refreshBtnText: { color: '#0f172a', fontWeight: '600' },
  
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginLeft: 8 },
  cardBody: { padding: 16 },
  productName: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  detailText: { fontSize: 14, color: '#475569', marginBottom: 4 },
  primaryBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabledBtn: { opacity: 0.7 },
  
  activeContainer: { flex: 1 },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  activeTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  productInfoBox: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  barcodeText: { fontSize: 14, fontWeight: '600', color: '#3b82f6', marginBottom: 4 },
  
  scannerWrapper: { height: 300, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  
  successHeader: { alignItems: 'center', marginVertical: 24 },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#10b981' },
  
  locationBox: { backgroundColor: '#eff6ff', padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 32 },
  locationLabel: { fontSize: 16, color: '#1d4ed8', marginBottom: 8 },
  locationValue: { fontSize: 32, fontWeight: '800', color: '#1e3a8a', marginBottom: 12 },
  locationWarning: { fontSize: 12, color: '#dc2626', fontStyle: 'italic', textAlign: 'center' },
  
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  secondaryBtn: { flex: 1, backgroundColor: '#f1f5f9', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  secondaryBtnText: { color: '#64748b', fontWeight: '700', fontSize: 16 },
});
