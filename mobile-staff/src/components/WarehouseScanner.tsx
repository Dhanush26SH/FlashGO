import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';

interface WarehouseScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title: string;
  instruction: string;
}

export const WarehouseScanner: React.FC<WarehouseScannerProps> = ({
  visible,
  onClose,
  onScan,
  title,
  instruction
}) => {
  const [permission, requestPermission] = useCameraPermissions();

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.centerContainer} />
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.centerContainer}>
          <Text style={styles.permissionText}>We need your permission to use the camera</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: '#ef4444', marginTop: 12 }]} onPress={onClose}>
            <Text style={styles.permissionBtnText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "code128", "code39"] }}
          onBarcodeScanned={({ data }) => {
            onScan(data);
          }}
        />
        
        {/* Dark overlay for contrast and viewfinder */}
        <View style={styles.overlay}>
          {/* Top dark area */}
          <View style={styles.overlayMask} />
          
          {/* Middle row: dark left, clear center, dark right */}
          <View style={styles.middleRow}>
            <View style={styles.overlayMask} />
            <View style={styles.targetBox}>
              {/* Corner brackets */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <View style={styles.overlayMask} />
          </View>
          
          {/* Bottom dark area */}
          <View style={styles.overlayMask} />
        </View>

        {/* UI Overlay */}
        <SafeAreaView style={styles.uiContainer} pointerEvents="box-none">
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X color="#fff" size={28} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.footer}>
            <Text style={styles.instruction}>{instruction}</Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', padding: 20 },
  permissionText: { color: '#fff', fontSize: 16, marginBottom: 20, textAlign: 'center' },
  permissionBtn: { backgroundColor: '#3b82f6', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  permissionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  overlayMask: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  middleRow: {
    flexDirection: 'row',
    height: 280, // Size of the viewfinder
  },
  targetBox: {
    width: 280,
    height: 280,
    backgroundColor: 'transparent',
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
  uiContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  closeBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  footer: {
    padding: 30,
    alignItems: 'center',
    marginBottom: 40,
  },
  instruction: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    overflow: 'hidden'
  }
});
