import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, Maximize, AlertTriangle, Check } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function PickingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const orderId = route.params?.orderId;
  const { profile } = useAuth() as any;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pickedQty, setPickedQty] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Fetch Items
  const fetchOrderData = async () => {
    try {
      setLoading(true);
      const { data: orderItems, error } = await supabase
        .from('order_items')
        .select(`
          id, quantity, status,
          product:products (
            id, name, image_url, barcode, sku,
            warehouse_locations ( location_code )
          )
        `)
        .eq('order_id', orderId)
        .order('id', { ascending: true });

      if (error) throw error;
      
      // Need to find which items are already fully picked
      const { data: ledgers, error: ledgerError } = await supabase
        .from('stock_ledgers')
        .select('product_id, quantity_change')
        .eq('order_id', orderId)
        .in('reason', ['picking', 'picking_undo']);
        
      if (ledgerError) throw ledgerError;
      
      const pickedMap: Record<string, number> = {};
      ledgers?.forEach(l => {
        pickedMap[l.product_id] = (pickedMap[l.product_id] || 0) + Math.abs(l.quantity_change);
      });

      const processedItems = orderItems.map((item: any) => ({
        ...item,
        picked_quantity: pickedMap[item.product?.id] || 0
      }));

      setItems(processedItems);
      
      // Find first unpicked
      const firstUnpicked = processedItems.findIndex(i => i.picked_quantity < i.quantity && i.status !== 'out_of_stock');
      if (firstUnpicked !== -1) {
        setCurrentIndex(firstUnpicked);
        setPickedQty(processedItems[firstUnpicked].picked_quantity);
      } else {
        // All picked! Finish.
        await finishPicking();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderData();
  }, [orderId]);

  const finishPicking = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('mark_order_packed_for_handover', {
        p_order_id: orderId,
        p_picker_id: profile.id
      });
      if (error) throw error;
      
      navigation.navigate('HandoverToDriver', { orderId });
    } catch (e: any) {
      Alert.alert('Completion Error', e.message);
      setSubmitting(false);
    }
  };

  const currentItem = items[currentIndex];

  const handlePickIncrement = (amount: number) => {
    if (!currentItem) return;
    const newQty = Math.max(0, Math.min(currentItem.quantity, pickedQty + amount));
    setPickedQty(newQty);
  };

  const confirmPick = async () => {
    if (!currentItem || pickedQty === 0) return;
    
    // We only want to pick the remaining unpicked amount up to what the user selected.
    // If they selected full quantity, we pick (pickedQty - already picked)
    const qtyToPick = pickedQty - currentItem.picked_quantity;
    
    if (qtyToPick <= 0) {
      // Move to next item
      fetchOrderData();
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('pick_fefo_item', {
        p_warehouse_id: profile.warehouse_id,
        p_product_id: currentItem.product.id,
        p_quantity: qtyToPick,
        p_order_id: orderId,
        p_user_id: profile.id
      });

      if (error) throw error;
      
      // Fetch again to update state
      await fetchOrderData();
    } catch (e: any) {
      Alert.alert('FEFO Pick Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!currentItem) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={{color: '#fff', marginTop: 16}}>Finalizing order...</Text>
      </View>
    );
  }

  const locationCode = currentItem.product?.warehouse_locations?.[0]?.location_code;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft color="#fff" size={28} />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Order #{orderId.substring(0, 8).toUpperCase()}</Text>
          <Text style={styles.timerText}>05:00</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <AlertTriangle color="#9ca3af" size={24} />
        </TouchableOpacity>
      </View>

      {/* Item Progress */}
      <View style={styles.progressContainer}>
        {items.map((item, idx) => {
          const isCompleted = item.picked_quantity >= item.quantity;
          const isCurrent = idx === currentIndex;
          return (
            <View 
              key={item.id} 
              style={[
                styles.progressDot, 
                isCompleted ? styles.dotCompleted : isCurrent ? styles.dotCurrent : styles.dotPending
              ]}
            >
              {isCompleted ? <Check color="#fff" size={12} /> : null}
            </View>
          );
        })}
      </View>

      <View style={styles.content}>
        {/* Location Info */}
        <View style={styles.locationContainer}>
          <Text style={styles.locationLabel}>Location</Text>
          {locationCode ? (
            <View style={styles.locationBadge}>
              <Text style={styles.locationText}>{locationCode}</Text>
            </View>
          ) : (
            <Text style={styles.locationMissingText}>Location not mapped</Text>
          )}
        </View>

        {/* Product Card */}
        <View style={styles.productCard}>
          <View style={styles.productImageContainer}>
            {currentItem.product.image_url ? (
              <Image source={{ uri: currentItem.product.image_url }} style={styles.productImage} />
            ) : (
              <View style={styles.productPlaceholder} />
            )}
            <TouchableOpacity style={styles.scanButton}>
              <Maximize color="#fff" size={20} />
            </TouchableOpacity>
          </View>
          <Text style={styles.productName}>{currentItem.product.name}</Text>
          <Text style={styles.productSku}>SKU: {currentItem.product.sku}</Text>
        </View>

        {/* Quantity Controls */}
        <View style={styles.quantitySection}>
          <Text style={styles.reqQuantityText}>Required: {currentItem.quantity}</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity 
              style={styles.qtyBtn} 
              onPress={() => handlePickIncrement(-1)}
              disabled={pickedQty <= 0}
            >
              <Text style={styles.qtyBtnText}>-</Text>
            </TouchableOpacity>
            
            <View style={styles.qtyDisplay}>
              <Text style={styles.qtyDisplayText}>
                <Text style={{color: '#fff', fontSize: 32}}>{pickedQty}</Text>
                <Text style={{color: '#9ca3af', fontSize: 24}}> / {currentItem.quantity}</Text>
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.qtyBtn} 
              onPress={() => handlePickIncrement(1)}
              disabled={pickedQty >= currentItem.quantity}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[
            styles.confirmButton, 
            (pickedQty === 0 || submitting) && { opacity: 0.5 }
          ]}
          onPress={confirmPick}
          disabled={pickedQty === 0 || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Pick</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#030712',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  backButton: {
    padding: 4,
  },
  headerTitleBox: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timerText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  iconBtn: {
    padding: 4,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotCompleted: {
    backgroundColor: '#10b981',
  },
  dotCurrent: {
    backgroundColor: '#3b82f6',
    borderWidth: 2,
    borderColor: '#60a5fa',
  },
  dotPending: {
    backgroundColor: '#374151',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  locationContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  locationLabel: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 8,
  },
  locationBadge: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  locationText: {
    color: '#60a5fa',
    fontSize: 20,
    fontWeight: 'bold',
  },
  locationMissingText: {
    color: '#9ca3af',
    fontSize: 16,
    fontStyle: 'italic',
  },
  productCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  productImageContainer: {
    width: 160,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    marginBottom: 16,
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  productPlaceholder: {
    flex: 1,
  },
  scanButton: {
    position: 'absolute',
    bottom: -16,
    right: -16,
    backgroundColor: '#374151',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#111827',
  },
  productName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  productSku: {
    color: '#9ca3af',
    fontSize: 14,
  },
  quantitySection: {
    alignItems: 'center',
  },
  reqQuantityText: {
    color: '#9ca3af',
    fontSize: 16,
    marginBottom: 16,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  qtyBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
  },
  qtyDisplay: {
    minWidth: 100,
    alignItems: 'center',
  },
  qtyDisplayText: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  footer: {
    padding: 16,
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  confirmButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
