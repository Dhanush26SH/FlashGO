import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Package } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../lib/supabase';

export default function DriverDropZoneScanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const tripId = route.params?.tripId;
  const zoneCode = route.params?.zoneCode;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || submitting) return;
    setScanned(true);
    setSubmitting(true);
    try {
      const parts = data.split(':');
      if (parts.length !== 3 || parts[0] !== 'DROPZONE' || !parts[1] || !parts[2]) {
        throw new Error('Invalid or malformed Drop Zone QR format. Scan a valid Drop Zone QR.');
      }
      
      const p_warehouse_id = parts[1];
      const p_qr_token = parts[2];

      const { data: res, error } = await supabase.rpc('driver_pickup_from_drop_zone', {
        p_trip_id: tripId,
        p_warehouse_id,
        p_qr_token
      });
      if (error) throw error;
      if (!res.success) throw new Error(res.code || 'Scan failed');
      
      Alert.alert('Success', `Picked up from Drop Zone ${zoneCode}`, [
        {
          text: 'OK',
          onPress: () => {
            navigation.reset({ index: 0, routes: [{ name: 'DriverMainTabs' }] });
          }
        }
      ]);
    } catch (err: any) {
      Alert.alert('Scan Failed', err.message, [
        { text: 'Try Again', onPress: () => { setScanned(false); setSubmitting(false); } }
      ]);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft color="#fff" size={26} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pickup from Drop Zone</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.instructionContainer}>
        <Package color="#f59e0b" size={48} />
        <Text style={styles.instructionTitle}>Pickup from {zoneCode}</Text>
        <Text style={styles.instructionText}>
          Go to Drop Zone {zoneCode} and scan its QR code to pick up the order.
        </Text>
      </View>

      <View style={styles.scannerContainer}>
        {submitting ? (
          <View style={styles.submittingContainer}>
             <ActivityIndicator size="large" color="#f59e0b" />
             <Text style={styles.submittingText}>Verifying Drop Zone...</Text>
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr']
            }}
          />
        )}
        <View style={styles.overlay}>
          <View style={styles.scanArea} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  text: { color: '#fff', marginTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#333'
  },
  backButton: { padding: 8 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  instructionContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#111'
  },
  instructionTitle: { color: '#f59e0b', fontSize: 24, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  instructionText: { color: '#9ca3af', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  scannerContainer: { flex: 1, overflow: 'hidden' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#f59e0b',
    backgroundColor: 'transparent'
  },
  submittingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center'
  },
  submittingText: { color: '#fff', fontSize: 18, marginTop: 16 }
});
