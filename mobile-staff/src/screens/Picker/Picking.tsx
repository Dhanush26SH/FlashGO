import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Image, 
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X, Check, Box, Search, Keyboard } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function PickingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId } = route.params;
  const { profile } = useAuth() as any;

  const [loading, setLoading] = useState(true);
  const [completingPick, setCompletingPick] = useState(false);
  const [pickLines, setPickLines] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [orderData, setOrderData] = useState<any>(null);

  // Timer state
  const [currentTime, setCurrentTime] = useState(new Date().getTime());

  // Scanner state
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);

  // Manual entry state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  useEffect(() => {
    fetchPickLines();
    
    // Timer ticker
    const interval = setInterval(() => setCurrentTime(new Date().getTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchPickLines = async () => {
    try {
      setLoading(true);

      // 1. Get order details for the timer
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('picker_assigned_at, warehouse_id')
        .eq('id', orderId)
        .single();
        
      if (orderErr) throw orderErr;
      setOrderData(order);

      // 2. Fetch pick lines
      const { data, error } = await supabase.rpc('get_pick_lines_for_order', {
        p_order_id: orderId
      });

      if (error) throw error;
      
      setPickLines(data || []);
      setCurrentIndex(0); // Restart recovery happens naturally via the RPC
      setLoading(false);
    } catch (e: any) {
      Alert.alert('Error loading pick lines', e.message);
      navigation.goBack();
    }
  };

  const handleBarcodeScan = async (barcodeData: string) => {
    if (processingScan || scanned) return;
    setScanned(true);
    setProcessingScan(true);

    try {
      const currentItem = pickLines[currentIndex];
      
      const { error } = await supabase.rpc('pick_fefo_location_item', {
        p_order_id: orderId,
        p_warehouse_id: orderData.warehouse_id,
        p_product_id: currentItem.product_id,
        p_location_id: currentItem.location_id,
        p_quantity: currentItem.allocated_quantity,
        p_scanned_barcode: barcodeData,
        p_user_id: profile.id
      });

      if (error) throw error;

      // Success - move to next item
      if (currentIndex + 1 < pickLines.length) {
        setCurrentIndex(currentIndex + 1);
        setScanned(false);
        setManualBarcode('');
        setShowManualEntry(false);
      } else {
        // Final item picked — backend is the authoritative validator
        setCompletingPick(true);
        try {
          const { error: packError } = await supabase.rpc('mark_order_packed_for_handover', {
            p_order_id: orderId,
            p_picker_id: profile.id,
          });
          if (packError) throw packError;
          // All items confirmed picked by backend — go to handover
          navigation.replace('HandoverToDriver', { orderId });
        } catch (packErr: any) {
          // Backend validation failed — stay on picking and show error
          Alert.alert('Completion Failed', packErr.message, [
            { text: 'OK', onPress: () => setScanned(false) }
          ]);
        } finally {
          setCompletingPick(false);
        }
      }
    } catch (e: any) {
      // Allow them to scan again
      Alert.alert('Scan Failed', e.message, [
        { text: 'Try Again', onPress: () => setScanned(false) }
      ]);
    } finally {
      setProcessingScan(false);
    }
  };

  const submitManualBarcode = () => {
    if (!manualBarcode.trim()) return;
    handleBarcodeScan(manualBarcode.trim());
  };

  // Timer Formatting
  const getTimerStrings = () => {
    if (!orderData?.picker_assigned_at) return { mStr: '00', sStr: '00' };
    const targetTime = new Date(orderData.picker_assigned_at).getTime() + 150000;
    const remainingMs = Math.max(0, targetTime - currentTime);
    const m = Math.floor(remainingMs / 60000);
    const s = Math.floor((remainingMs % 60000) / 1000);
    return {
      mStr: m < 10 ? `0${m}` : `${m}`,
      sStr: s < 10 ? `0${s}` : `${s}`
    };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Loading pick route...</Text>
      </SafeAreaView>
    );
  }

  if (pickLines.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Check size={48} color="#10b981" />
        <Text style={styles.loadingText}>All items picked!</Text>
        <TouchableOpacity style={styles.returnButton} onPress={() => navigation.goBack()}>
          <Text style={styles.returnButtonText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const currentItem = pickLines[currentIndex];
  const { mStr, sStr } = getTimerStrings();
  const shortOrderId = orderId.substring(0, 8).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER SECTION */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerLabel}>Order ID</Text>
            <Text style={styles.headerOrderId}>#{shortOrderId}</Text>
          </View>
          <View style={styles.timerContainer}>
            <View style={styles.timerBox}>
              <Text style={styles.timerBoxText}>{mStr} MIN</Text>
            </View>
            <View style={styles.timerBox}>
              <Text style={styles.timerBoxText}>{sStr} SEC</Text>
            </View>
            <Text style={styles.timerDots}>⋮</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailScroll}>
          {pickLines.map((item, index) => (
            <View key={item.id} style={[styles.thumbnailWrapper, index === currentIndex && styles.thumbnailActive]}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.thumbnailImage} resizeMode="contain" />
              ) : (
                <Box size={20} color="#9ca3af" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* LOCATION STRIP */}
        <View style={styles.locationContainer}>
          <Text style={styles.locationText}>{currentItem.location_code || 'UNAVAILABLE'}</Text>
          <Text style={styles.locationMore}>More</Text>
        </View>

        {/* PRODUCT DETAILS */}
        <View style={styles.productCard}>
          <View style={styles.productLayoutRow}>
            <View style={styles.productImageContainer}>
              {currentItem.image_url ? (
                <Image source={{ uri: currentItem.image_url }} style={styles.productImageLarge} resizeMode="contain" />
              ) : (
                <View style={[styles.productImageLarge, styles.placeholderImage]}>
                  <Box size={40} color="#9ca3af" />
                </View>
              )}
            </View>

            <View style={styles.productDetailsContainer}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantity</Text>
                <Text style={styles.detailValueLarge}>{currentItem.allocated_quantity}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Weight</Text>
                <Text style={styles.detailValue}>{currentItem.weight || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Price</Text>
                <Text style={styles.detailValue}>₹{currentItem.price ?? 0}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.productNameTitle}>{currentItem.product_name}</Text>
          <Text style={styles.productCodeText}>
            Product Code: {currentItem.product_id ? currentItem.product_id.substring(0, 8).toUpperCase() : 'N/A'}
          </Text>
        </View>

        {/* SCANNER SECTION */}
        <View style={styles.scannerSection}>
          {!permission?.granted ? (
            <View style={styles.noCameraView}>
              <Text style={styles.noCameraText}>Camera access required</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={requestPermission}>
                <Text style={styles.secondaryBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          ) : showManualEntry ? (
            <View style={styles.manualEntryContainer}>
              <Text style={styles.manualEntryTitle}>Manual Barcode Entry</Text>
              <TextInput
                style={styles.barcodeInput}
                placeholder="Enter UPC manually"
                value={manualBarcode}
                onChangeText={setManualBarcode}
                autoCapitalize="none"
                autoFocus
              />
              <View style={styles.manualActions}>
                <TouchableOpacity
                  style={[styles.manualBtn, styles.manualBtnCancel]}
                  onPress={() => setShowManualEntry(false)}
                >
                  <Text style={styles.manualBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.manualBtn, styles.manualBtnSubmit, !manualBarcode.trim() && styles.manualBtnDisabled]}
                  onPress={submitManualBarcode}
                  disabled={!manualBarcode.trim() || processingScan}
                >
                  {processingScan ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.manualBtnSubmitText}>Verify</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.cameraWrapper}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['ean13', 'ean8', 'upc_e', 'upc_a', 'qr', 'code128', 'code39'],
                }}
                onBarcodeScanned={scanned || processingScan ? undefined : ({ data }) => handleBarcodeScan(data)}
              />
              <View style={styles.cameraOverlay}>
                <View style={styles.targetBox} />
              </View>
              {processingScan && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color="#10b981" />
                  <Text style={styles.processingText}>Verifying...</Text>
                </View>
              )}
            </View>
          )}

          {!showManualEntry && (
            <TouchableOpacity
              style={styles.manualLinkBtn}
              onPress={() => setShowManualEntry(true)}
            >
              <Keyboard size={16} color="#10b981" style={{ marginRight: 6 }} />
              <Text style={styles.manualLinkText}>Enter UPC manually</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#4b5563', fontWeight: '500' },
  returnButton: { marginTop: 24, backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  returnButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  // Header
  header: { backgroundColor: '#ffffff', paddingTop: 16, paddingBottom: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', zIndex: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLabel: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', fontWeight: '600', marginBottom: 2 },
  headerOrderId: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  // Timer boxes (reference-style amber pill boxes)
  timerContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerBox: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#fde68a' },
  timerBoxText: { fontSize: 13, fontWeight: 'bold', color: '#b45309' },
  timerDots: { fontSize: 18, color: '#9ca3af', fontWeight: 'bold', marginLeft: 2 },
  // Product thumbnail strip
  thumbnailScroll: { flexDirection: 'row', marginTop: 4 },
  thumbnailWrapper: { width: 46, height: 46, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb', marginRight: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', overflow: 'hidden' },
  thumbnailActive: { borderColor: '#10b981', borderWidth: 2.5, backgroundColor: '#f0fdf4' },
  thumbnailImage: { width: '85%', height: '85%' },
  // Scroll body
  scrollContent: { padding: 16, paddingBottom: 40 },
  // Location strip (yellow-tinted like reference)
  locationContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fef9c3', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#fef08a', marginBottom: 20 },
  locationText: { color: '#854d0e', fontSize: 17, fontWeight: 'bold', letterSpacing: 0.5 },
  locationMore: { color: '#ca8a04', fontSize: 14, fontWeight: '600' },
  // Product card — white bg, side-by-side layout
  productCard: { backgroundColor: '#ffffff', marginBottom: 20 },
  productLayoutRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start' },
  productImageContainer: { flex: 1.1, marginRight: 16 },
  productImageLarge: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  placeholderImage: { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  productDetailsContainer: { flex: 1 },
  detailRow: { marginBottom: 14 },
  detailLabel: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: '700', marginBottom: 2, letterSpacing: 0.5 },
  detailValueLarge: { fontSize: 32, fontWeight: 'bold', color: '#111827', lineHeight: 36 },
  detailValue: { fontSize: 16, fontWeight: '600', color: '#374151' },
  productNameTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  productCodeText: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  // Scanner section
  scannerSection: { marginTop: 4 },
  noCameraView: { height: 200, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12 },
  noCameraText: { fontSize: 16, color: '#4b5563', marginBottom: 16 },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#e5e7eb', borderRadius: 8 },
  secondaryBtnText: { color: '#374151', fontWeight: 'bold' },
  cameraWrapper: { height: 220, borderRadius: 12, overflow: 'hidden', position: 'relative', backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  targetBox: { width: 200, height: 100, borderWidth: 2, borderColor: '#10b981', backgroundColor: 'transparent', borderRadius: 12 },
  processingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
  processingText: { marginTop: 12, fontSize: 16, fontWeight: 'bold', color: '#10b981' },
  // Manual entry link (green border, reference-style)
  manualLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingVertical: 14, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1.5, borderColor: '#10b981' },
  manualLinkText: { color: '#10b981', fontSize: 15, fontWeight: 'bold' },
  // Manual entry form
  manualEntryContainer: { padding: 16, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  manualEntryTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 16, textAlign: 'center' },
  barcodeInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16, textAlign: 'center' },
  manualActions: { flexDirection: 'row', gap: 12 },
  manualBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  manualBtnCancel: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db' },
  manualBtnCancelText: { color: '#374151', fontWeight: 'bold', fontSize: 15 },
  manualBtnSubmit: { backgroundColor: '#10b981' },
  manualBtnSubmitText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  manualBtnDisabled: { backgroundColor: '#9ca3af' },
});