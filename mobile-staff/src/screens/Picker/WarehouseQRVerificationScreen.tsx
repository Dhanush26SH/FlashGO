import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function WarehouseQRVerificationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const shiftId = route.params?.shiftId;
  const { profile } = useAuth() as any;
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedData || loading) return;
    setScannedData(data);
    setLoading(true);

    try {
      if (!data) {
        throw new Error('Invalid QR code format');
      }

      const { data: rpcData, error } = await supabase.rpc('picker_shift_check_in', {
        p_shift_id: shiftId,
        p_qr_token: data
      });

      if (error) {
        throw error;
      }
      
      // Success - go back to Dashboard which will now see the shift as active
      navigation.goBack();
      
    } catch (e: any) {
      setScannedData(null);
      if (e.message && e.message.includes('belong to your booked store')) {
         Alert.alert('Scan Failed', 'This QR does not belong to your booked store.');
      } else {
         Alert.alert('Scan Failed', e.message || 'Invalid QR Code');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView 
        style={styles.camera} 
        facing="back" 
        onBarcodeScanned={scannedData ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      >
        <SafeAreaView style={styles.overlay}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <ChevronLeft color="#fff" size={28} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Warehouse Verification</Text>
            {/* Spacer */}<View style={{ width: 44 }} />
          </View>

          {/* Guide Overlay */}
          <View style={styles.guideContainer}>
            <Text style={styles.subtitle}>Scan the QR code displayed at your warehouse</Text>
            <View style={styles.qrFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Text style={styles.instructionText}>
              Align the warehouse QR code inside the frame
            </Text>
            
            {profile?.warehouses?.name && (
              <View style={styles.warehouseTag}>
                <Text style={styles.warehouseTagText}>{profile.warehouses.name}</Text>
              </View>
            )}
          </View>

          {/* Bottom Area */}
          <View style={styles.bottomArea}>
            {loading ? (
              <View style={styles.scanResultBox}>
                <ActivityIndicator size="small" color="#10b981" />
                <Text style={[styles.scanResultText, { marginTop: 8 }]}>Verifying shift...</Text>
              </View>
            ) : (
              <Text style={styles.helperText}>
                The QR code is displayed on the warehouse screen.
              </Text>
            )}
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  guideContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 32,
  },
  qrFrame: {
    width: 260,
    height: 260,
    marginBottom: 24,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#10b981',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  instructionText: {
    color: '#e5e7eb',
    fontSize: 14,
    marginBottom: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  warehouseTag: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  warehouseTagText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomArea: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  helperText: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  scanResultBox: {
    backgroundColor: 'rgba(17,24,39,0.95)',
    padding: 20,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  scanResultText: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  }
});
