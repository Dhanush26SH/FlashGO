import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  User,
  Package,
  Store,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

interface DeliveryData {
  trip: { id: string; status: string };
  warehouse: { id: string; name: string; address: string };
  order: {
    id: string;
    order_number: string;
    status: string;
    total_amount: number;
    picker_name: string;
    customer_name: string;
    customer_phone: string;
    delivery_address: string;
    picker_ready: boolean;
    items: { id: string; quantity: number; picked_quantity: number; product_name: string; product_image: string | null }[];
    total_item_count: number;
  };
}

export default function DriverPickupScreen() {
  const navigation = useNavigation<any>();

  const [delivery, setDelivery] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const [customerExpanded, setCustomerExpanded] = useState(false);
  const [storeExpanded, setStoreExpanded] = useState(false);

  const readyPulse = useRef(new Animated.Value(1)).current;

  const fetchDelivery = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('driver_get_active_delivery');
      if (error) throw error;
      if (data?.success && data?.trip && data?.order) {
        setDelivery(data as DeliveryData);
      } else {
        setDelivery(null);
      }
    } catch (err) {
      console.error('Delivery fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime: listen to order status changes (handed_off)
  useEffect(() => {
    fetchDelivery();
  }, [fetchDelivery]);

  useEffect(() => {
    if (!delivery?.order?.id) return;
    const channel = supabase.channel(`driver-pickup-${delivery.order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${delivery.order.id}` },
        () => fetchDelivery()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [delivery?.order?.id, fetchDelivery]);

  // Pulse animation for ready badge
  useEffect(() => {
    if (delivery?.order?.picker_ready) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(readyPulse, { toValue: 1.1, duration: 600, useNativeDriver: true }),
          Animated.timing(readyPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      readyPulse.setValue(1);
    }
  }, [delivery?.order?.picker_ready]);

  const handleConfirmPickup = async () => {
    if (!delivery?.trip?.id) return;
    if (!delivery.order.picker_ready) {
      Alert.alert('Not Ready', 'Wait for the Picker to complete handover before picking up.');
      return;
    }
    setConfirming(true);
    try {
      const { data, error } = await supabase.rpc('driver_confirm_order_pickup', {
        p_trip_id: delivery.trip.id,
      });
      if (error) throw error;
      if (!data?.success) {
        if (data?.code === 'PICKER_NOT_READY') {
          Alert.alert('Picker Not Ready', 'The Picker has not yet completed handover.');
        } else {
          Alert.alert('Error', data?.code || 'Failed to confirm pickup.');
        }
        return;
      }
      // Stop here — next screen will be provided separately
      await fetchDelivery();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to confirm pickup.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Loading delivery...</Text>
      </View>
    );
  }

  if (!delivery) {
    return (
      <View style={styles.loadingContainer}>
        <Package color="#6b7280" size={48} />
        <Text style={styles.loadingText}>No active delivery</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back to Map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { order, warehouse } = delivery;
  const isPickerReady = order.picker_ready;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.orderLabel}>ORDER ID</Text>
          <Text style={styles.orderId}>{order.order_number || order.id.slice(0, 8).toUpperCase()}</Text>
        </View>
        <View style={styles.brandBadge}>
          <Text style={styles.brandText}>⚡ FlashGO</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Picker / Collection Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Collect order from</Text>
          <View style={styles.pickerRow}>
            <View style={styles.pickerAvatar}>
              <User color="#10b981" size={22} />
            </View>
            <Text style={styles.pickerName}>{order.picker_name}</Text>
            <Animated.View style={[styles.readyBadge, isPickerReady && styles.readyBadgeGreen, { transform: [{ scale: readyPulse }] }]}>
              {isPickerReady ? (
                <>
                  <CheckCircle2 color="#10b981" size={14} />
                  <Text style={[styles.readyText, { color: '#10b981' }]}>Ready</Text>
                </>
              ) : (
                <>
                  <AlertCircle color="#ef4444" size={14} />
                  <Text style={[styles.readyText, { color: '#ef4444' }]}>Not Ready</Text>
                </>
              )}
            </Animated.View>
          </View>
          {!isPickerReady && (
            <Text style={styles.waitingNote}>Waiting for Picker to complete handover...</Text>
          )}
        </View>

        {/* Order Details — collapsible */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setOrdersExpanded(v => !v)} activeOpacity={0.7}>
          <View style={styles.sectionHeaderLeft}>
            <Package color="#9ca3af" size={18} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.sectionTitle}>Order details</Text>
              <Text style={styles.sectionSub}>{order.total_item_count} items</Text>
            </View>
          </View>
          {ordersExpanded ? <ChevronUp color="#9ca3af" size={20} /> : <ChevronDown color="#9ca3af" size={20} />}
        </TouchableOpacity>
        {ordersExpanded && (
          <View style={styles.sectionBody}>
            {order.items?.map(item => (
              <View key={item.id} style={styles.itemRow}>
                {item.product_image ? (
                  <Image source={{ uri: item.product_image }} style={styles.itemImage} />
                ) : (
                  <View style={styles.itemImagePlaceholder}>
                    <Package color="#6b7280" size={16} />
                  </View>
                )}
                <Text style={styles.itemQty}>{item.quantity}×</Text>
                <Text style={styles.itemName} numberOfLines={2}>{item.product_name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Customer Details — collapsible */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setCustomerExpanded(v => !v)} activeOpacity={0.7}>
          <View style={styles.sectionHeaderLeft}>
            <User color="#9ca3af" size={18} />
            <Text style={[styles.sectionTitle, { marginLeft: 12 }]}>Customer details</Text>
          </View>
          {customerExpanded ? <ChevronUp color="#9ca3af" size={20} /> : <ChevronDown color="#9ca3af" size={20} />}
        </TouchableOpacity>
        {customerExpanded && (
          <View style={styles.sectionBody}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Name</Text>
              <Text style={styles.detailValue}>{order.customer_name || '—'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phone</Text>
              <Text style={styles.detailValue}>{order.customer_phone || '—'}</Text>
            </View>
          </View>
        )}

        {/* Store Details — collapsible */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setStoreExpanded(v => !v)} activeOpacity={0.7}>
          <View style={styles.sectionHeaderLeft}>
            <Store color="#9ca3af" size={18} />
            <Text style={[styles.sectionTitle, { marginLeft: 12 }]}>Store details</Text>
          </View>
          {storeExpanded ? <ChevronUp color="#9ca3af" size={20} /> : <ChevronDown color="#9ca3af" size={20} />}
        </TouchableOpacity>
        {storeExpanded && (
          <View style={styles.sectionBody}>
            <View style={styles.storeRow}>
              <MapPin color="#3b82f6" size={18} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.storeName}>{warehouse.name}</Text>
                <Text style={styles.storeAddress}>{warehouse.address}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Spacer for sticky button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky bottom action */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.pickupBtn, !isPickerReady && styles.pickupBtnDisabled]}
          onPress={handleConfirmPickup}
          disabled={!isPickerReady || confirming}
          activeOpacity={isPickerReady ? 0.8 : 1}
        >
          {confirming ? (
            <ActivityIndicator color={isPickerReady ? '#000' : '#6b7280'} />
          ) : (
            <Text style={[styles.pickupBtnText, !isPickerReady && styles.pickupBtnTextDisabled]}>
              {isPickerReady ? 'Order picked →' : '⏳ Waiting for Picker...'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  loadingContainer: { flex: 1, backgroundColor: '#09090b', justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { color: '#9ca3af', fontSize: 16 },
  backBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#18181b', borderRadius: 12 },
  backBtnText: { color: '#10b981', fontWeight: '600' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  orderLabel: { color: '#6b7280', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  orderId: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginTop: 2 },
  brandBadge: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  brandText: { color: '#10b981', fontSize: 13, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  card: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  cardTitle: { color: '#9ca3af', fontSize: 13, marginBottom: 12 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#064e3b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerName: { color: '#fff', fontSize: 17, fontWeight: '600', flex: 1 },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#1f1f23',
    borderWidth: 1,
    borderColor: '#ef444440',
  },
  readyBadgeGreen: {
    borderColor: '#10b98140',
    backgroundColor: '#022c22',
  },
  readyText: { fontSize: 12, fontWeight: '600' },
  waitingNote: { color: '#6b7280', fontSize: 12, marginTop: 10, fontStyle: 'italic' },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: '#e5e7eb', fontSize: 15, fontWeight: '600' },
  sectionSub: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  sectionBody: {
    backgroundColor: '#111113',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f1f23',
    gap: 12,
  },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemImage: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#27272a' },
  itemImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1f1f23',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemQty: { color: '#10b981', fontSize: 14, fontWeight: 'bold', minWidth: 28 },
  itemName: { color: '#d1d5db', fontSize: 14, flex: 1 },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { color: '#6b7280', fontSize: 13 },
  detailValue: { color: '#fff', fontSize: 14, fontWeight: '500' },

  storeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  storeName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  storeAddress: { color: '#6b7280', fontSize: 13, marginTop: 3 },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 12,
    backgroundColor: '#09090b',
    borderTopWidth: 1,
    borderTopColor: '#1f1f23',
  },
  pickupBtn: {
    backgroundColor: '#10b981',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupBtnDisabled: {
    backgroundColor: '#1f1f23',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  pickupBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: 'bold',
  },
  pickupBtnTextDisabled: {
    color: '#6b7280',
  },
});
