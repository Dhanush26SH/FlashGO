import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import { ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

export default function WarehouseReturnQRScannerScreen() {
  const navigation = useNavigation<any>();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned || processing) return;
    setScanned(true);
    setProcessing(true);

    try {
      if (data.startsWith('CUSTOMER_RETURN_HANDOVER:')) {
        const { data: taskId, error } = await supabase.rpc('warehouse_staff_preview_customer_return_handover', {
          p_payload: data
        });
        if (error) throw error;
        if (taskId) {
          navigation.replace('CustomerReturnIntakePreviewScreen', { taskId, rawToken: data });
        } else {
          throw new Error('Did not receive a valid task ID for preview');
        }
      } else {
        const { data: intakeId, error } = await supabase.rpc('staff_start_return_intake', {
          p_raw_token: data
        });

        if (error) {
          throw error;
        }

        if (intakeId) {
          navigation.replace('ReturnIntakeSummaryScreen', { intakeId });
        } else {
           throw new Error("Did not receive a valid intake ID");
        }
      }
    } catch (err: any) {
      let friendlyError = err.message;
      if (err.message.includes('Invalid, expired, or consumed')) {
        friendlyError = 'QR Code is expired, invalid, or already consumed.';
      } else if (err.message.includes('Unauthorized')) {
        friendlyError = 'Unauthorized: ' + err.message;
      } else if (err.message.includes('Return task is no longer required')) {
        friendlyError = 'This return task is no longer active.';
      }
      
      Alert.alert(
        'Scan Failed',
        friendlyError,
        [{ text: 'Scan Again', onPress: () => { setScanned(false); setProcessing(false); } }]
      );
    }
  };

  if (hasPermission === null) {
    return <View style={styles.container}><ActivityIndicator color="#fff" /></View>;
  }
  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#fff' }}>No access to camera</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Scan Driver Return QR</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        <View style={styles.overlay}>
          <View style={styles.scanTarget} />
        </View>
      </View>

      {processing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.processingText}>Verifying QR...</Text>
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
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: 'transparent',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' }
});
