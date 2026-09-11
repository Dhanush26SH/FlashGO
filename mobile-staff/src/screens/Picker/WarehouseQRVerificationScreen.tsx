import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CameraView } from 'expo-camera';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, Briefcase } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

export default function WarehouseQRVerificationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const shiftId = route.params?.shiftId;
  const { profile } = useAuth() as any;
  const [scannedData, setScannedData] = useState<string | null>(null);

  // We are currently just reading the QR but not pretending it verified since the backend doesn't exist.
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!scannedData) {
      setScannedData(data);
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
              {/* Corner markers for visual aesthetic */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Text style={styles.instructionText}>
              Align the warehouse QR code inside the frame
            </Text>
            
            {/* Show the real warehouse name if available */}
            {profile?.warehouse?.name && (
              <View style={styles.warehouseTag}>
                <Text style={styles.warehouseTagText}>{profile.warehouse.name}</Text>
              </View>
            )}
          </View>

          {/* Scanned Data Notification (Since real backend isn't connected) */}
          <View style={styles.bottomArea}>
            {scannedData ? (
              <View style={styles.scanResultBox}>
                <Text style={styles.scanResultTitle}>QR Detected</Text>
                <Text style={styles.scanResultText}>
                  Warehouse QR verification is not connected yet.
                </Text>
                <TouchableOpacity style={styles.resetButton} onPress={() => setScannedData(null)}>
                  <Text style={styles.resetButtonText}>Scan Again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.helperText}>
                The QR code is displayed on the warehouse screen.
              </Text>
            )}

            {/* DEV ONLY Preview Button */}
            {__DEV__ && (
              <TouchableOpacity 
                style={styles.devButton} 
                onPress={() => setScannedData('__DEV_PREVIEW')}
              >
                <Text style={styles.devButtonText}>[DEV] Preview Success Sheet</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </CameraView>

      {/* SUCCESS BOTTOM SHEET PREVIEW */}
      {__DEV__ && scannedData === '__DEV_PREVIEW' && (
        <View style={styles.bottomSheetContainer}>
          <View style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
            <Text style={styles.bottomSheetTitle}>Verification complete</Text>
            
            <TouchableOpacity 
              style={styles.pickerRow} 
              onPress={() => navigation.navigate('PickerShift', { shiftId })}
            >
              <View style={styles.pickerRowLeft}>
                <Briefcase color="#10b981" size={24} />
                <Text style={styles.pickerRowText}>Picker</Text>
              </View>
              <ChevronLeft color="#9ca3af" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  scanResultTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  scanResultText: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  resetButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  devButton: {
    marginTop: 16,
    backgroundColor: 'rgba(239,68,68,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  devButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Bottom Sheet Styles
  bottomSheetContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#1f2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#4b5563',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  bottomSheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 12,
  },
  pickerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickerRowText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  }
});
