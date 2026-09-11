import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, MoreVertical, Scan, ArrowRight, CheckCircle2, XCircle, RotateCcw } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function ScannerScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { profile } = useAuth();
  const orderId = route.params?.orderId;
  
  const [items, setItems] = useState<any[]>([]);
  const [currentItem, setCurrentItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [manualBarcode, setManualBarcode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [bagNumber, setBagNumber] = useState('');

  const fetchOrderData = async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    try {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          id, product_id, quantity, status, 
          products!order_items_product_id_fkey(id, name, price, barcode, image_url, warehouse_location)
        `)
        .eq('order_id', orderId);
        
      if (itemsError) throw itemsError;

      const { data: ledgers, error: ledgersError } = await supabase
        .from('stock_ledgers')
        .select('product_id, quantity_change, reason')
        .eq('order_id', orderId)
        .in('reason', ['picking', 'picking_undo']);
        
      if (ledgersError) throw ledgersError;

      const { data: subs, error: subsError } = await supabase
        .from('order_substitutions')
        .select(`
          id, original_item_id, suggested_product_id, status, 
          products!order_substitutions_suggested_product_id_fkey(id, name, barcode, image_url, warehouse_location, price)
        `)
        .eq('order_id', orderId);
        
      if (subsError) throw subsError;

      const pickedByProduct: Record<string, number> = {};
      ledgers?.forEach(l => {
        pickedByProduct[l.product_id] = (pickedByProduct[l.product_id] || 0) + Math.abs(l.quantity_change);
      });
      
      const combinedItems = orderItems?.map(item => {
        const origPicked = pickedByProduct[item.product_id] || 0;
        const itemSubs = subs?.filter(s => s.original_item_id === item.product_id) || [];
        const activeSub = itemSubs.find(s => ['pending', 'approved'].includes(s.status));
        const subPicked = activeSub ? (pickedByProduct[activeSub.suggested_product_id] || 0) : 0;
        
        const totalPicked = origPicked + subPicked;
        const remaining = Math.max(0, item.quantity - totalPicked);
        const isCompleted = totalPicked >= item.quantity || item.status === 'out_of_stock';
        
        return {
          ...item,
          origPicked,
          activeSub,
          subPicked,
          totalPicked,
          remaining,
          isCompleted
        };
      }) || [];
      
      setItems(combinedItems);
      
      // Keep current item if it still exists, else pick first uncompleted
      if (currentItem) {
        const updatedCurrent = combinedItems.find(i => i.id === currentItem.id);
        if (updatedCurrent) setCurrentItem(updatedCurrent);
        else setCurrentItem(combinedItems.find(i => !i.isCompleted) || combinedItems[0]);
      } else {
        setCurrentItem(combinedItems.find(i => !i.isCompleted) || combinedItems[0]);
      }
      
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error fetching order", e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrderData();
  }, [orderId]);
  
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`scanner-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_substitutions', filter: `order_id=eq.${orderId}` }, () => {
        fetchOrderData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}` }, () => {
        fetchOrderData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const handleScan = async (scannedBarcode: string) => {
    if (!currentItem || actionLoading) return;
    if (!scannedBarcode) return;
    
    // Determine which product to pick based on barcode
    let productToPick = null;
    let isSub = false;
    
    if (currentItem.products?.barcode === scannedBarcode) {
      productToPick = currentItem.products;
    } else if (currentItem.activeSub?.status === 'approved' && currentItem.activeSub?.products?.barcode === scannedBarcode) {
      productToPick = currentItem.activeSub.products;
      isSub = true;
    } else {
      Alert.alert("Invalid Barcode", "This barcode does not match the current item or its approved substitution.");
      return;
    }
    
    if (currentItem.remaining <= 0) {
      Alert.alert("Already Picked", "This item has already been fully picked.");
      return;
    }
    
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('pick_fefo_item', {
        p_warehouse_id: (profile as any)?.warehouse_id,
        p_product_id: productToPick.id,
        p_quantity: 1, // pick 1 unit per scan
        p_order_id: orderId,
        p_user_id: profile?.id
      });
      
      if (error) throw error;
      setManualBarcode('');
      await fetchOrderData();
    } catch (e: any) {
      Alert.alert("Picking Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleUndo = () => {
    if (!currentItem || actionLoading) return;
    if (currentItem.totalPicked <= 0) return;
    
    Alert.alert(
      "Confirm Undo",
      "Are you sure you want to return 1 unit of this item to the shelf?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Undo Pick", 
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              // Determine which product to undo. We undo the sub if it has picks, else original.
              const productToUndo = currentItem.subPicked > 0 ? currentItem.activeSub.products.id : currentItem.product_id;
              
              const { error } = await supabase.rpc('undo_fefo_pick', {
                p_order_id: orderId,
                p_product_id: productToUndo,
                p_picker_id: profile?.id
              });
              
              if (error) throw error;
              await fetchOrderData();
            } catch (e: any) {
              Alert.alert("Undo Error", e.message);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };
  
  const handleSuggestSub = async () => {
    if (!currentItem || actionLoading) return;
    if (currentItem.activeSub?.status === 'pending' || currentItem.activeSub?.status === 'approved') {
      Alert.alert("Substitution Exists", "There is already an active substitution for this item.");
      return;
    }
    
    Alert.prompt(
      "Suggest Substitute",
      "Scan or type the barcode of the replacement product:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Suggest",
          onPress: async (barcode) => {
            if (!barcode) return;
            setActionLoading(true);
            try {
              // 1. Find product by barcode
              const { data: prodData } = await supabase
                .from('products')
                .select('id')
                .eq('barcode', barcode.trim())
                .maybeSingle();
                
              if (!prodData) {
                Alert.alert("Not Found", "No product found with that barcode.");
                setActionLoading(false);
                return;
              }
              
              // 2. Insert substitution
              const { error } = await supabase
                .from('order_substitutions')
                .insert({
                  order_id: orderId,
                  original_item_id: currentItem.product_id,
                  suggested_product_id: prodData.id,
                  status: 'pending'
                });
                
              if (error) throw error;
              
              Alert.alert("Success", "Substitution request sent to customer.");
              await fetchOrderData();
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };
  
  const handleMarkOOS = async () => {
    if (!currentItem || actionLoading) return;
    if (currentItem.totalPicked > 0) {
      Alert.alert("Cannot Mark OOS", "You have already picked some quantity of this item. Please undo picks before marking OOS.");
      return;
    }
    if (currentItem.activeSub?.status === 'pending' || currentItem.activeSub?.status === 'approved') {
      Alert.alert("Cannot Mark OOS", "This item has an active substitution. Fulfill the substitution or wait for customer response.");
      return;
    }
    
    Alert.alert(
      "Mark Out of Stock",
      "Are you sure this item is completely unavailable?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Mark OOS", 
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              const { error } = await supabase.rpc('mark_item_oos', {
                p_order_id: orderId,
                p_product_id: currentItem.product_id,
                p_picker_id: profile?.id
              });
              if (error) throw error;
              await fetchOrderData();
            } catch (e: any) {
              Alert.alert("OOS Error", e.message);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handlePack = async () => {
    if (!bagNumber.trim()) {
      Alert.alert("Required", "Please enter a bag number to pack this order.");
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('pack_order', {
        p_order_id: orderId,
        p_picker_id: profile?.id,
        p_bag_number: bagNumber.trim()
      });
      if (error) throw error;
      (navigation as any).navigate('Handover', { orderId });
    } catch (e: any) {
      Alert.alert("Packing Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }
  
  const allCompleted = items.length > 0 && items.every(i => i.isCompleted);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Pick Order Items</Text>
          <Text style={styles.headerSub}>Order ID: {orderId?.substring(0,8).toUpperCase() || 'N/A'}</Text>
        </View>
        <TouchableOpacity>
          <MoreVertical size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {allCompleted ? (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ alignItems: 'center', marginVertical: 32 }}>
            <CheckCircle2 size={64} color="#10b981" />
            <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: 'bold', marginTop: 16 }}>All items picked!</Text>
            <Text style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>Please enter bag number to complete packing.</Text>
          </View>
          
          <View style={styles.locationBox}>
            <Text style={styles.locLabel}>Bag Number</Text>
            <TextInput 
              style={styles.input}
              placeholder="e.g. BAG-123"
              placeholderTextColor="#4b5563"
              value={bagNumber}
              onChangeText={setBagNumber}
            />
            <TouchableOpacity 
              style={[styles.outlineBtn, { backgroundColor: '#10b981', borderColor: '#10b981', marginTop: 16, opacity: actionLoading ? 0.7 : 1 }]}
              onPress={handlePack}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.outlineBtnText, {color: '#fff'}]}>Pack Order</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {/* Scanner Area */}
          <View style={styles.scannerArea}>
            <View style={styles.scannerBox}>
              <Scan size={60} color="#10b981" />
              <View style={styles.laserLine} />
              <View style={styles.barcodeOverlay}>
                <Text style={styles.barcodeText}>{currentItem?.activeSub?.status === 'approved' ? currentItem?.activeSub?.products?.barcode : currentItem?.products?.barcode}</Text>
              </View>
            </View>
            <Text style={{color: '#94a3b8', marginTop: 12, fontSize: 12}}>Scan product barcode to pick</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 40}}>
              <TextInput 
                style={styles.manualInput}
                placeholder="Manual entry..."
                placeholderTextColor="#4b5563"
                value={manualBarcode}
                onChangeText={setManualBarcode}
                onSubmitEditing={() => handleScan(manualBarcode)}
              />
              <TouchableOpacity style={styles.manualBtn} onPress={() => handleScan(manualBarcode)} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.manualBtnText}>Go</Text>}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.body}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
              <Text style={styles.instructionTitle}>Item {items.findIndex(i => i.id === currentItem?.id) + 1} of {items.length}</Text>
              <Text style={{color: '#3b82f6', fontWeight: 'bold'}}>{items.filter(i => i.isCompleted).length} / {items.length} Done</Text>
            </View>

            {/* Product Details Card */}
            {currentItem && (
              <View style={styles.productCard}>
                <View style={styles.productImagePlaceholder}>
                  <Text style={styles.placeholderText}>IMG</Text>
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{currentItem.products?.name}</Text>
                  
                  {currentItem.activeSub && (
                    <View style={styles.subBox}>
                      <Text style={styles.subText}>Sub: {currentItem.activeSub.products?.name}</Text>
                      <Text style={[styles.subStatus, currentItem.activeSub.status === 'approved' ? {color: '#10b981'} : {color: '#f59e0b'}]}>
                        {currentItem.activeSub.status.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  
                  {currentItem.status === 'out_of_stock' && (
                    <View style={styles.oosBadge}>
                      <Text style={styles.oosText}>OUT OF STOCK</Text>
                    </View>
                  )}
                  
                  <View style={styles.progressRow}>
                    <View style={styles.progressItem}>
                      <Text style={styles.progressLabel}>Ordered</Text>
                      <Text style={styles.progressValue}>{currentItem.quantity}</Text>
                    </View>
                    <View style={styles.progressItem}>
                      <Text style={styles.progressLabel}>Picked</Text>
                      <Text style={[styles.progressValue, {color: '#10b981'}]}>{currentItem.totalPicked}</Text>
                    </View>
                    <View style={styles.progressItem}>
                      <Text style={styles.progressLabel}>Remain</Text>
                      <Text style={[styles.progressValue, {color: '#ef4444'}]}>{currentItem.remaining}</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Location Box */}
            <View style={styles.locationBox}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                <View>
                  <Text style={styles.locLabel}>Location</Text>
                  <Text style={styles.locValue}>
                    {currentItem?.activeSub?.status === 'approved' ? currentItem?.activeSub?.products?.warehouse_location : currentItem?.products?.warehouse_location || 'Unknown'}
                  </Text>
                </View>
                {currentItem?.totalPicked > 0 && (
                  <TouchableOpacity style={styles.undoBtn} onPress={handleUndo} disabled={actionLoading}>
                    <RotateCcw size={16} color="#ef4444" />
                    <Text style={styles.undoText}>Undo Pick</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {!currentItem?.isCompleted && currentItem?.totalPicked === 0 && (!currentItem?.activeSub || currentItem?.activeSub.status === 'rejected') && (
                <View style={{ flexDirection: 'row', marginTop: 16, justifyContent: 'space-between' }}>
                  <TouchableOpacity style={[styles.unableBtn, { flex: 1, marginRight: 8, backgroundColor: '#1e293b', borderRadius: 8 }]} onPress={handleSuggestSub} disabled={actionLoading}>
                    <Text style={styles.unableText}>Suggest Substitute</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.unableBtn, { flex: 1, marginLeft: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }]} onPress={handleMarkOOS} disabled={actionLoading}>
                    <Text style={[styles.unableText, { color: '#ef4444', textDecorationLine: 'none' }]}>Mark OOS</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Bottom Actions */}
            <View style={styles.bottomActions}>
              <TouchableOpacity 
                style={styles.actionBtnSecondary} 
                onPress={() => {
                  const currentIndex = items.findIndex(i => i.id === currentItem?.id);
                  let nextIndex = currentIndex + 1;
                  if (nextIndex >= items.length) nextIndex = 0;
                  setCurrentItem(items[nextIndex]);
                }}
              >
                <Text style={styles.actionTextSecondary}>Skip & Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  backBtn: { padding: 4 },
  headerTitleBox: { flex: 1, marginLeft: 16 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  headerSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  scannerArea: {
    paddingVertical: 32,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    borderBottomWidth: 4,
    borderBottomColor: '#3b82f6'
  },
  scannerBox: { alignItems: 'center', justifyContent: 'center' },
  laserLine: {
    position: 'absolute',
    width: 120,
    height: 2,
    backgroundColor: '#ef4444',
    top: '50%'
  },
  barcodeOverlay: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginTop: 16
  },
  barcodeText: { color: '#030712', fontWeight: 'bold', fontSize: 12 },
  manualInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8
  },
  manualBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  manualBtnText: { color: '#ffffff', fontWeight: 'bold' },
  body: { flex: 1, padding: 20 },
  instructionTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  productCard: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  productImagePlaceholder: { width: 60, height: 80, backgroundColor: '#1e293b', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  placeholderText: { color: '#4b5563', fontSize: 12, fontWeight: 'bold' },
  productInfo: { flex: 1 },
  productName: { color: '#ffffff', fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 8 },
  subBox: { backgroundColor: '#1e293b', padding: 8, borderRadius: 6, marginBottom: 8 },
  subText: { color: '#cbd5e1', fontSize: 12 },
  subStatus: { fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  oosBadge: { backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 8, borderWidth: 1, borderColor: '#ef4444' },
  oosText: { color: '#ef4444', fontSize: 10, fontWeight: 'bold' },
  progressRow: { flexDirection: 'row', gap: 24, marginTop: 4 },
  progressItem: { alignItems: 'center' },
  progressLabel: { color: '#94a3b8', fontSize: 11, marginBottom: 4 },
  progressValue: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  locationBox: { 
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 24
  },
  locLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 6 },
  locValue: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#ffffff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginTop: 8
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  outlineBtnText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  undoText: { color: '#ef4444', fontSize: 12, fontWeight: 'bold' },
  unableBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  unableText: { color: '#94a3b8', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  bottomActions: { flexDirection: 'row', gap: 12, marginTop: 'auto' },
  actionBtnSecondary: { 
    flex: 1, 
    borderWidth: 1, 
    borderColor: '#334155', 
    borderRadius: 12, 
    paddingVertical: 14, 
    alignItems: 'center' 
  },
  actionTextSecondary: { color: '#94a3b8', fontSize: 13, fontWeight: 'bold' }
});
