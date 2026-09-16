import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import { ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default function ReturnItemScannerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { intakeId } = route.params || {};

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [processing, setProcessing] = useState(false);
  
  // Track the current scan operation UUID.
  // We generate a new one for every unique physical scan attempt.
  const scanOperationIdRef = useRef<string | null>(null);
  const isCooldownRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = async ({ data: barcode }: { type: string; data: string }) => {
    if (processing || isCooldownRef.current) return;

    // Start a physical scan processing
    setProcessing(true);
    isCooldownRef.current = true;
    
    // Generate a fresh UUID for this specific camera scan event
    scanOperationIdRef.current = generateUUID();

    await processScan(barcode, scanOperationIdRef.current);
  };

  const processScan = async (barcode: string, operationId: string) => {
    try {
      const { data, error } = await supabase.rpc('staff_scan_return_item', {
        p_intake_id: intakeId,
        p_barcode: barcode,
        p_scan_operation_id: operationId
      });

      if (error) throw error;

      // Scan was successful or handled idempotently
      Alert.alert(
        'Success',
        'Item verified successfully.',
        [{ 
          text: 'OK', 
          onPress: () => {
             // Let the summary screen fetch the latest data on focus
             navigation.goBack();
          } 
        }]
      );
    } catch (err: any) {
      const msg = err.message || '';
      let friendlyError = msg;

      if (msg.includes('UNKNOWN_BARCODE')) {
        friendlyError = 'Barcode not recognized.';
      } else if (msg.includes('PRODUCT_NOT_EXPECTED')) {
        friendlyError = 'This product is not part of this return.';
      } else if (msg.includes('EXPECTED_QUANTITY_REACHED')) {
        friendlyError = 'All expected units of this product have already been scanned.';
      } else if (msg.includes('SCAN_OPERATION_CONFLICT')) {
        friendlyError = 'System conflict. Please try scanning again.';
      } else if (msg.includes('INTAKE_NOT_SCANNING')) {
        friendlyError = 'This return intake is no longer in scanning state.';
      } else if (msg.includes('UNAUTHORIZED')) {
        friendlyError = 'Unauthorized to perform this scan.';
      }

      Alert.alert(
        'Scan Failed',
        friendlyError,
        [{
          text: 'Scan Again',
          onPress: () => {
             // Reset UI state for a new physical scan
             scanOperationIdRef.current = null;
             setProcessing(false);
             // Short cooldown to prevent immediate double-read
             setTimeout(() => { isCooldownRef.current = false; }, 1000);
          }
        }]
      );
    }
  };

  if (hasPermission === null) {
    return <View style={styles.container}><ActivityIndicator color="#fff" /></View>;
  }
  if (hasPermission === false) {
    return <View style={styles.container}><Text style={{ color: '#fff' }}>No access to camera</Text></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Scan Returned Item</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={processing ? undefined : handleBarCodeScanned}
        />
        <View style={styles.overlay}>
          <View style={styles.scanTarget} />
          <Text style={styles.scanInstruction}>Scan the FLH product barcode</Text>
        </View>
      </View>

      {processing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.processingText}>Verifying item...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  backBtn: { padding: 8 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cameraContainer: { flex: 1, position: 'relative' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanTarget: {
    width: 280,
    height: 120,
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: 'transparent',
    marginBottom: 24
  },
  scanInstruction: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' }
});
