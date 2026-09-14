import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Image, Modal, ScrollView, TextInput
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Check, X, Camera as CameraIcon, Keyboard } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Barcode from 'react-native-barcode-svg';

export default function PickingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const orderId = route.params?.orderId;
  const { profile } = useAuth() as any;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Timer state
  const [orderData, setOrderData] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date().getTime());

  // Barcode Scanning State
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);

  // Manual entry state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  // Multi-quantity state
  const [showQuantityConfirm, setShowQuantityConfirm] = useState(false);
  const [manualPickedQuantity, setManualPickedQuantity] = useState(1);

  useEffect(() => {
    fetchOrderData();
    const interval = setInterval(() => setCurrentTime(new Date().getTime()), 1000);
    return () => clearInterval(interval);
  }, [orderId]);

  const fetchOrderData = async () => {
    try {
      setLoading(true);

      // Fetch timer info
      console.log('PICKING_SCREEN_ORDER', { orderId });
      const { data: order } = await supabase
        .from('orders')
        .select('status, picker_assigned_at, warehouse_id')
        .eq('id', orderId)
        .single();
      setOrderData(order);

      // Recovery: If order is already packed or further along, go straight to Handover
      if (order && order.status !== 'picking' && order.status !== 'placed') {
        navigation.replace('HandoverToDriver', { orderId });
        return;
      }

      console.log('PICKING_PICK_LINES_REQUEST', { orderId });
      const { data: pickLines, error } = await supabase.rpc('get_pick_lines_for_order', {
        p_order_id: orderId
      });
      console.log('PICKING_PICK_LINES_RESULT', { linesCount: pickLines?.length, error });
      if (error) throw error;

      const processedItems = (pickLines || []).map((item: any) => ({
        ...item,
        picked_quantity: 0,
        quantity: item.allocated_quantity
      }));

      setItems(processedItems);

      if (processedItems.length > 0) {
        setCurrentIndex(0);
        setIsVerified(false);
        setScannedBarcode(null);
        setManualBarcode('');
        setShowManualEntry(false);
        setShowQuantityConfirm(false);
        setManualPickedQuantity(1);
      } else {
        await finishPicking();
      }
    } catch (e: any) {
      console.log('PICKING_LOAD_ERROR', e);
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const finishPicking = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('mark_order_packed_for_handover', {
        p_order_id: orderId,
        p_picker_id: profile.id
      });
      if (error) throw error;
      navigation.replace('HandoverToDriver', { orderId });
    } catch (e: any) {
      Alert.alert('Completion Error', e.message);
      setSubmitting(false);
    }
  };

  // Authoritative barcode validation via resolve_product_barcode
  const handleBarcodeScanned = async ({ data }: any) => {
    if (processingScan) return;
    
    // Ignore rapid identical scans if already verified for multi-quantity
    if (isVerified && scannedBarcode === data && items[currentIndex]?.quantity > 1) {
      return;
    }
    
    setProcessingScan(true);

    try {
      const currentItem = items[currentIndex];
      setSubmitting(true);

      const { data: resolvedProductId, error: resolveError } = await supabase.rpc('resolve_product_barcode', {
        p_scanned_barcode: data
      });

      if (resolveError) throw resolveError;

      if (!resolvedProductId) {
        Alert.alert('Barcode not recognized', 'This barcode does not match any product in our system.');
        return;
      }
      
      if (resolvedProductId !== currentItem.product_id) {
        Alert.alert('Wrong product scanned', `Please scan the barcode for ${currentItem.product_name}.`);
        return;
      }

      // Valid scan!
      setScannedBarcode(data);
      setIsVerified(true);
      setShowManualEntry(false);

      if (currentItem.quantity === 1) {
        // Single unit: pick authoritatively immediately
        const { error } = await supabase.rpc('pick_fefo_location_item', {
          p_warehouse_id: profile.warehouse_id,
          p_product_id: currentItem.product_id,
          p_location_id: currentItem.location_id,
          p_quantity: 1,
          p_order_id: orderId,
          p_user_id: profile.id,
          p_scanned_barcode: data
        });
        
        if (error) {
          throw error;
        } else {
          await fetchOrderData();
        }
      } else {
        // Multi-quantity: require manual confirmation
        setManualPickedQuantity(1);
        setShowQuantityConfirm(true);
      }
    } catch (e: any) {
      Alert.alert('Pick Error', e.message, [{ text: 'OK' }]);
    } finally {
      setSubmitting(false);
      setProcessingScan(false);
    }
  };

  const handleConfirmItem = async () => {
    if (processingScan || submitting) return;
    setSubmitting(true);
    try {
      const currentItem = items[currentIndex];
      const { error } = await supabase.rpc('pick_fefo_location_item', {
        p_warehouse_id: profile.warehouse_id,
        p_product_id: currentItem.product_id,
        p_location_id: currentItem.location_id,
        p_quantity: manualPickedQuantity,
        p_order_id: orderId,
        p_user_id: profile.id,
        p_scanned_barcode: scannedBarcode
      });
      if (error) throw error;
      await fetchOrderData();
    } catch (e: any) {
      Alert.alert('Pick Error', e.message, [{ text: 'OK' }]);
    } finally {
      setSubmitting(false);
    }
  };

  const submitManualBarcode = async () => {
    if (!manualBarcode.trim() || processingScan) return;
    setIsScanning(false);
    await handleBarcodeScanned({ data: manualBarcode.trim() });
  };

  // Timer display
  const getTimerStrings = () => {
    if (!orderData?.picker_assigned_at) return { mStr: '02', sStr: '30' };
    const targetTime = new Date(orderData.picker_assigned_at).getTime() + 150000;
    const remainingMs = Math.max(0, targetTime - currentTime);
    const m = Math.floor(remainingMs / 60000);
    const s = Math.floor((remainingMs % 60000) / 1000);
    return {
      mStr: m < 10 ? `0${m}` : `${m}`,
      sStr: s < 10 ? `0${s}` : `${s}`
    };
  };

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Loading pick route...</Text>
      </SafeAreaView>
    );
  }

  const currentItem = items[currentIndex];
  
  if (currentItem) {
    console.log('PICKING_LINE_RENDER_DATA', {
      product_id: currentItem.product_id,
      product_name: currentItem.product_name,
      required_quantity: currentItem.quantity, // this is allocated_quantity from the API, mapped to quantity
      allocated_remaining_quantity: currentItem.quantity,
      internal_barcode: currentItem.internal_barcode,
      location_code: currentItem.location_code
    });

    if (currentItem.internal_barcode) {
      console.log('PICKING_BARCODE_RENDER_DATA', {
        internal_barcode: currentItem.internal_barcode,
        format: "CODE128",
        maxWidth: 300,
        height: 60,
        singleBarWidth: 2,
        lineColor: "#000000",
        backgroundColor: "#FFFFFF"
      });
    }
  }

  if (!currentItem) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Finalizing order...</Text>
      </SafeAreaView>
    );
  }

  const { mStr, sStr } = getTimerStrings();
  const shortOrderId = orderId.substring(0, 8).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      {/* ── HEADER ── */}
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

        {/* Product thumbnail strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailScroll}>
          {items.map((item, index) => (
            <View key={index} style={[styles.thumbnailWrapper, index === currentIndex && styles.thumbnailActive]}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.thumbnailImage} resizeMode="contain" />
              ) : (
                <View style={styles.thumbnailPlaceholder} />
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* ── LOCATION STRIP ── */}
        <View style={styles.locationContainer}>
          <Text style={styles.locationText}>{currentItem.location_code || 'UNAVAILABLE'}</Text>
          <Text style={styles.locationMore}>More</Text>
        </View>

        {/* ── PRODUCT AREA ── */}
        <View style={styles.productCard}>
          <View style={styles.productLayoutRow}>
            {/* Left: product image */}
            <View style={styles.productImageContainer}>
              {currentItem.image_url ? (
                <Image source={{ uri: currentItem.image_url }} style={styles.productImageLarge} resizeMode="contain" />
              ) : (
                <View style={[styles.productImageLarge, styles.placeholderImage]} />
              )}
              {isVerified && (
                <View style={styles.verifiedBadge}>
                  <Check color="#fff" size={14} strokeWidth={3} />
                </View>
              )}
            </View>

            {/* Right: metrics */}
            <View style={styles.productDetailsContainer}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantity</Text>
                <Text style={styles.detailValueLarge}>{currentItem.quantity}</Text>
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
          {currentItem.internal_barcode ? (
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#3f3f46', marginBottom: 4 }}>
                FlashGO Barcode
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#18181b', marginBottom: 8 }}>
                {currentItem.internal_barcode}
              </Text>
              <View style={{ backgroundColor: '#fff', padding: 8, borderRadius: 4, width: '100%', alignItems: 'center' }}>
                <Barcode 
                  value={currentItem.internal_barcode} 
                  format="CODE128" 
                  maxWidth={300} 
                  height={60} 
                  singleBarWidth={2}
                  lineColor="#000000"
                  backgroundColor="#FFFFFF"
                />
              </View>
            </View>
          ) : currentItem.manufacturer_barcode_verified ? (
            <Text style={styles.productCodeText}>UPC/EAN: {currentItem.manufacturer_barcode}</Text>
          ) : (
            <Text style={styles.productCodeText}>
              Product Code: {currentItem.product_id ? currentItem.product_id.substring(0, 8).toUpperCase() : 'N/A'}
            </Text>
          )}
        </View>

        {/* ── BARCODE / SCANNER SECTION ── */}
        {showQuantityConfirm ? (
          <View style={styles.multiQtyContainer}>
            <Text style={styles.multiQtyTitle}>Verify Quantity</Text>
            <Text style={styles.multiQtyLabel}>Picked: {manualPickedQuantity} / {currentItem.quantity}</Text>
            
            <View style={styles.qtyControls}>
              <TouchableOpacity 
                style={styles.qtyBtn} 
                onPress={() => setManualPickedQuantity(prev => Math.max(1, prev - 1))}
                disabled={manualPickedQuantity <= 1}
              >
                <Text style={styles.qtyBtnText}>-</Text>
              </TouchableOpacity>
              
              <Text style={styles.qtyValue}>{manualPickedQuantity}</Text>
              
              <TouchableOpacity 
                style={styles.qtyBtn} 
                onPress={() => setManualPickedQuantity(prev => Math.min(currentItem.quantity, prev + 1))}
                disabled={manualPickedQuantity >= currentItem.quantity}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={[styles.confirmBtn, manualPickedQuantity !== currentItem.quantity && styles.confirmBtnDisabled]}
              onPress={handleConfirmItem}
              disabled={manualPickedQuantity !== currentItem.quantity || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Item</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.scannerSection}>
            {showManualEntry ? (
              <View style={styles.manualEntryContainer}>
                <Text style={styles.manualEntryTitle}>Enter UPC Manually</Text>
                <TextInput
                  style={styles.barcodeInput}
                  placeholder="Enter UPC / barcode..."
                  value={manualBarcode}
                  onChangeText={setManualBarcode}
                  autoCapitalize="none"
                  autoFocus
                  keyboardType="default"
                />
                <View style={styles.manualActions}>
                  <TouchableOpacity
                    style={[styles.manualBtn, styles.manualBtnCancel]}
                    onPress={() => { setShowManualEntry(false); setManualBarcode(''); }}
                  >
                    <Text style={styles.manualBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.manualBtn, styles.manualBtnSubmit, (!manualBarcode.trim() || processingScan) && styles.manualBtnDisabled]}
                    onPress={submitManualBarcode}
                    disabled={!manualBarcode.trim() || processingScan || submitting}
                  >
                    {processingScan || submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.manualBtnSubmitText}>Verify & Pick</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.scanCameraBtn, isVerified && styles.scanCameraBtnVerified]}
                  onPress={() => {
                    if (!permission?.granted) { requestPermission(); return; }
                    setIsScanning(true);
                  }}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : isVerified ? (
                    <>
                      <Check color="#fff" size={20} strokeWidth={3} />
                      <Text style={styles.scanCameraBtnText}>Verified — Scan next</Text>
                    </>
                  ) : (
                    <>
                      <CameraIcon color="#fff" size={20} />
                      <Text style={styles.scanCameraBtnText}>Scan Barcode</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.manualLinkBtn}
                  onPress={() => setShowManualEntry(true)}
                >
                  <Keyboard size={16} color="#10b981" style={{ marginRight: 6 }} />
                  <Text style={styles.manualLinkText}>Enter UPC manually</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── FULLSCREEN CAMERA SCANNER MODAL ── */}
      <Modal visible={isScanning} animationType="slide" transparent={false}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'upc_a', 'upc_e', 'ean8', 'qr', 'code39', 'code128'],
            }}
            onBarcodeScanned={processingScan ? undefined : handleBarcodeScanned}
          />
          <SafeAreaView style={styles.scannerOverlay}>
            <View style={styles.scannerHeader}>
              <TouchableOpacity
                style={styles.scannerCloseBtn}
                onPress={() => { setIsScanning(false); setProcessingScan(false); }}
              >
                <X color="#fff" size={28} />
              </TouchableOpacity>
              <Text style={styles.scannerTitle}>Scan Product Barcode</Text>
              <View style={{ width: 44 }} />
            </View>

            <View style={styles.scannerTarget}>
              <View style={styles.targetCornerTL} />
              <View style={styles.targetCornerTR} />
              <View style={styles.targetCornerBL} />
              <View style={styles.targetCornerBR} />
              {processingScan && (
                <View style={styles.scannerLoadingBox}>
                  <ActivityIndicator color="#10b981" size="large" />
                  <Text style={styles.scannerLoadingText}>Verifying...</Text>
                </View>
              )}
            </View>

            <View style={styles.scannerFooter}>
              <Text style={styles.scannerHelpText}>Align the barcode within the frame.</Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  loadingContainer: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#4b5563', fontWeight: '500' },

  // Header
  header: { backgroundColor: '#ffffff', paddingTop: 16, paddingBottom: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLabel: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: '700', marginBottom: 2, letterSpacing: 0.5 },
  headerOrderId: { fontSize: 20, fontWeight: 'bold', color: '#111827' },

  // Timer amber pill boxes
  timerContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerBox: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#fde68a' },
  timerBoxText: { fontSize: 13, fontWeight: 'bold', color: '#b45309' },
  timerDots: { fontSize: 18, color: '#9ca3af', fontWeight: 'bold', marginLeft: 2 },

  // Product thumbnail strip
  thumbnailScroll: { flexDirection: 'row', marginTop: 4 },
  thumbnailWrapper: { width: 46, height: 46, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb', marginRight: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', overflow: 'hidden' },
  thumbnailActive: { borderColor: '#10b981', borderWidth: 2.5, backgroundColor: '#f0fdf4' },
  thumbnailImage: { width: '85%', height: '85%' },
  thumbnailPlaceholder: { width: '60%', height: '60%', backgroundColor: '#e5e7eb', borderRadius: 4 },

  // Scroll body
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Location strip (yellow-tinted, reference-style)
  locationContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fef9c3', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#fef08a', marginBottom: 20 },
  locationText: { color: '#854d0e', fontSize: 17, fontWeight: 'bold', letterSpacing: 0.5 },
  locationMore: { color: '#ca8a04', fontSize: 14, fontWeight: '600' },

  // Product area
  productCard: { backgroundColor: '#ffffff', marginBottom: 20 },
  productLayoutRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start' },
  productImageContainer: { flex: 1.1, marginRight: 16, position: 'relative' },
  productImageLarge: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  placeholderImage: { backgroundColor: '#f3f4f6' },
  verifiedBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: '#10b981', borderRadius: 12, padding: 4 },
  productDetailsContainer: { flex: 1 },
  detailRow: { marginBottom: 14 },
  detailLabel: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: '700', marginBottom: 2, letterSpacing: 0.5 },
  detailValueLarge: { fontSize: 32, fontWeight: 'bold', color: '#111827', lineHeight: 36 },
  detailValue: { fontSize: 16, fontWeight: '600', color: '#374151' },
  productNameTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  productCodeText: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },

  // Scanner / barcode section
  scannerSection: { marginTop: 4 },
  scanCameraBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#111827', paddingVertical: 16, borderRadius: 10, marginBottom: 12 },
  scanCameraBtnVerified: { backgroundColor: '#059669' },
  scanCameraBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  manualLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1.5, borderColor: '#10b981' },
  manualLinkText: { color: '#10b981', fontSize: 15, fontWeight: 'bold' },

  // Manual entry form
  manualEntryContainer: { padding: 16, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  manualEntryTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 16, textAlign: 'center' },
  barcodeInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16, textAlign: 'center' },
  manualActions: { flexDirection: 'row', gap: 12 },
  manualBtn: { flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
  manualBtnCancel: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db' },
  manualBtnCancelText: { color: '#374151', fontWeight: 'bold', fontSize: 15 },
  manualBtnSubmit: { backgroundColor: '#10b981' },
  manualBtnSubmitText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  manualBtnDisabled: { backgroundColor: '#9ca3af' },

  // Fullscreen scanner modal
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, justifyContent: 'space-between', backgroundColor: 'transparent' },
  scannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  scannerCloseBtn: { padding: 8 },
  scannerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scannerTarget: { alignSelf: 'center', width: 280, height: 280, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  targetCornerTL: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderTopWidth: 4, borderLeftWidth: 4, borderColor: '#10b981' },
  targetCornerTR: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderTopWidth: 4, borderRightWidth: 4, borderColor: '#10b981' },
  targetCornerBL: { position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: '#10b981' },
  targetCornerBR: { position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#10b981' },
  scannerLoadingBox: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 24, borderRadius: 12, alignItems: 'center' },
  scannerLoadingText: { color: '#10b981', marginTop: 12, fontWeight: 'bold' },
  scannerFooter: { padding: 32, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  scannerHelpText: { color: '#fff', fontSize: 14, textAlign: 'center' },

  // Multi-quantity
  multiQtyContainer: { backgroundColor: '#ffffff', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', marginTop: 4 },
  multiQtyTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  multiQtyLabel: { fontSize: 16, color: '#4b5563', marginBottom: 20 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 24 },
  qtyBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d1d5db' },
  qtyBtnText: { fontSize: 28, fontWeight: 'bold', color: '#111827' },
  qtyValue: { fontSize: 32, fontWeight: 'bold', color: '#111827', minWidth: 40, textAlign: 'center' },
  confirmBtn: { width: '100%', backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 10, alignItems: 'center' },
  confirmBtnDisabled: { backgroundColor: '#9ca3af' },
  confirmBtnText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
});