import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

interface SharedWarehouseQRScannerProps {
  onScan: (data: string) => Promise<void>;
  title?: string;
  subtitle?: string;
  loadingMessage?: string;
}

export default function SharedWarehouseQRScanner({
  onScan,
  title = "Warehouse Verification",
  subtitle = "Scan the QR code displayed at your warehouse",
  loadingMessage = "Verifying shift..."
}: SharedWarehouseQRScannerProps) {
  const navigation = useNavigation<any>();
  const { profile } = useAuth() as any;
  const [loading, setLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (hasScanned || loading) return;
    setHasScanned(true);
    setLoading(true);

    try {
      await onScan(data);
    } catch (e: any) {
      setHasScanned(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView 
        style={styles.camera} 
        facing="back" 
        onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      >
        <SafeAreaView style={styles.overlay}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <ChevronLeft color="#fff" size={28} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{title}</Text>
            {/* Spacer */}<View style={{ width: 44 }} />
          </View>

          {/* Guide Overlay */}
          <View style={styles.guideContainer}>
            <Text style={styles.subtitle}>{subtitle}</Text>
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
                <Text style={[styles.scanResultText, { marginTop: 8 }]}>{loadingMessage}</Text>
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
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  backButton: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  guideContainer: { alignItems: 'center', justifyContent: 'center' },
  subtitle: {
    color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 32,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, overflow: 'hidden', marginHorizontal: 32
  },
  qrFrame: { width: 260, height: 260, marginBottom: 24, position: 'relative' },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: '#10b981' },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  instructionText: {
    color: '#e5e7eb', fontSize: 14, marginBottom: 24, backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: 'hidden'
  },
  warehouseTag: { backgroundColor: '#374151', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  warehouseTagText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  bottomArea: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  helperText: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  scanResultBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', alignItems: 'center'
  },
  scanResultText: { color: '#10b981', fontSize: 16, fontWeight: '500' }
});
