import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, ScrollView, Linking, AppState } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, AlertTriangle, User, MapPin, Phone, Package, Navigation, RefreshCw } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import QRCode from 'react-native-qrcode-svg';

export default function CustomerReturnPickupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { profile } = useAuth() as any;
  const taskId = route.params?.taskId;

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [isArriving, setIsArriving] = useState(false);
  const [isPickingUp, setIsPickingUp] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [handoverToken, setHandoverToken] = useState<string | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);

  const fetchTask = async () => {
    if (!profile?.id || !taskId) return;
    try {
      const { data, error } = await supabase
        .from('customer_return_tasks')
        .select('*, warehouses(name), orders(id, customer_snapshot_name, customer_name_snapshot, customer_snapshot_phone, address_snapshot_formatted, address_snapshot_flat, address_snapshot_floor, address_snapshot_landmark, address_snapshot_locality, address_snapshot_instructions, delivery_lat, delivery_lng), customer_return_items(expected_quantity, order_items(product_name_snapshot, product_image_snapshot, sku_snapshot))')
        .eq('id', taskId)
        .eq('assigned_driver_id', profile.id)
        .single();
        
      if (error) throw error;
      
      if (data.status === 'at_warehouse' || data.status === 'completed') {
        navigation.reset({ index: 0, routes: [{ name: 'DriverMainTabs' }] });
        return;
      }
      
      setTask(data);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Failed to load task details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTask();
    }, [taskId, profile?.id])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchTask();
      }
    });
    return () => subscription.remove();
  }, [taskId, profile?.id]);

  useEffect(() => {
    if (!taskId) return;
    const channelName = `customer-return-${taskId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'customer_return_tasks',
          filter: `id=eq.${taskId}`,
        },
        (payload) => {
          if (payload.new.status === 'at_warehouse' || payload.new.status === 'completed') {
            navigation.reset({ index: 0, routes: [{ name: 'DriverMainTabs' }] });
          } else {
            fetchTask();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  const handleNavigateToCustomer = () => {
    if (!task || !task.orders) return;
    const { delivery_lat, delivery_lng } = task.orders;
    if (delivery_lat && delivery_lng) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${delivery_lat},${delivery_lng}`);
    } else {
      Alert.alert('Location unavailable', 'Coordinates not found for this return order.');
    }
  };

  const handleReachedCustomer = async () => {
    if (isArriving || !task) return;
    setIsArriving(true);
    try {
      const { error } = await supabase.rpc('driver_mark_customer_return_arrived', {
        p_task_id: task.id
      });
      if (error) throw error;
      await fetchTask();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Failed to mark arrived', err.message);
    } finally {
      setIsArriving(false);
    }
  };

  const handleConfirmPickup = async () => {
    if (isPickingUp || !task || !isConfirmed) return;
    setIsPickingUp(true);
    try {
      const { error } = await supabase.rpc('driver_confirm_customer_return_pickup', {
        p_task_id: task.id
      });
      if (error) throw error;
      await fetchTask();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Failed to confirm pickup', err.message);
    } finally {
      setIsPickingUp(false);
    }
  };

  const generateHandoverQR = async () => {
    if (isGeneratingQR || !task) return;
    setIsGeneratingQR(true);
    try {
      const { data, error } = await supabase.rpc('driver_generate_customer_return_handover_challenge', {
        p_task_id: task.id
      });
      if (error) {
        if (error.message?.includes('Task must be picked_up')) {
          await fetchTask();
          return;
        }
        throw error;
      }
      setHandoverToken(data);
    } catch (err: any) {
      console.error(err);
      Alert.alert('QR Generation Failed', err.message);
    } finally {
      setIsGeneratingQR(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading Return Details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!task) return null;

  const customerName = task.orders?.customer_snapshot_name || task.orders?.customer_name_snapshot;

  let displayAddress = task.orders?.address_snapshot_formatted || '';
  if (task.orders) {
    const rawParts = [
      task.orders.address_snapshot_flat,
      task.orders.address_snapshot_floor,
      task.orders.address_snapshot_landmark,
      task.orders.address_snapshot_locality,
      task.orders.address_snapshot_formatted,
    ];
    
    const parts = rawParts
      .filter((p) => typeof p === 'string')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const uniqueParts = parts.filter((item, pos, arr) => {
      return pos === 0 || item.toLowerCase() !== arr[pos - 1].toLowerCase();
    });

    if (uniqueParts.length > 0) {
      displayAddress = uniqueParts.join(', ');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RETURN PICKUP</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderIdLabel}>ORDER ID</Text>
            <Text style={styles.orderIdValue}>{task.orders?.id?.slice(0, 8).toUpperCase()}</Text>
          </View>
          <View style={styles.reasonRow}>
            <AlertTriangle color="#f59e0b" size={18} style={{ marginRight: 8 }} />
            <Text style={styles.reasonText}>{task.reason}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          <View style={styles.detailRow}>
            <User color="#9ca3af" size={18} style={{ marginRight: 12 }} />
            <Text style={styles.detailText}>{customerName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Phone color="#9ca3af" size={18} style={{ marginRight: 12 }} />
            <Text style={styles.detailText}>{task.orders?.customer_snapshot_phone}</Text>
          </View>
          <View style={styles.detailRow}>
            <MapPin color="#9ca3af" size={18} style={{ marginRight: 12, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailText}>{displayAddress}</Text>
              {task.orders?.address_snapshot_instructions ? (
                <Text style={styles.detailSubText}>Note: {task.orders.address_snapshot_instructions}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Return Items ({task.customer_return_items?.length || 0})</Text>
          {task.customer_return_items?.map((item: any, idx: number) => (
            <View key={idx} style={styles.itemRow}>
              <View style={styles.itemIconBg}>
                <Package color="#a1a1aa" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.order_items?.product_name_snapshot}</Text>
                {item.order_items?.sku_snapshot ? (
                  <Text style={styles.itemSku}>SKU: {item.order_items.sku_snapshot}</Text>
                ) : null}
              </View>
              <Text style={styles.itemQuantity}>×{item.expected_quantity}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {task.status === 'accepted' ? (
          <>
            <TouchableOpacity style={styles.navBtn} onPress={handleNavigateToCustomer}>
              <Navigation color="#8b5cf6" size={20} style={{ marginRight: 8 }} />
              <Text style={styles.navBtnText}>Navigate to Customer</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.primaryBtn, isArriving && { opacity: 0.7 }]} 
              onPress={handleReachedCustomer}
              disabled={isArriving}
            >
              {isArriving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Reached Customer</Text>}
            </TouchableOpacity>
          </>
        ) : task.status === 'at_customer' ? (
          <View style={styles.arrivedContainer}>
            <Text style={styles.arrivedTitle}>Confirm Return Pickup</Text>
            <TouchableOpacity 
              style={styles.checkboxRow}
              onPress={() => setIsConfirmed(!isConfirmed)}
            >
              <View style={[styles.checkbox, isConfirmed && styles.checkboxActive]}>
                 {isConfirmed && <Text style={{color: '#fff', fontSize: 12}}>✓</Text>}
              </View>
              <Text style={styles.checkboxText}>I have collected the listed return item(s) from the customer</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.primaryBtn, { width: '100%', marginTop: 16 }, (!isConfirmed || isPickingUp) && { opacity: 0.5 }]} 
              onPress={handleConfirmPickup}
              disabled={!isConfirmed || isPickingUp}
            >
              {isPickingUp ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Confirm Item Picked Up</Text>}
            </TouchableOpacity>
          </View>
        ) : task.status === 'picked_up' ? (
          <View style={styles.arrivedContainer}>
            <Text style={styles.arrivedTitle}>Return Item Collected</Text>
            <Text style={styles.arrivedSub}>Return to {task.warehouses?.name || 'FlashGO Store'}</Text>

            {handoverToken ? (
              <View style={{ alignItems: 'center', marginTop: 24 }}>
                <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                  <QRCode value={handoverToken} size={200} backgroundColor="#fff" color="#000" />
                </View>
                <TouchableOpacity 
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    backgroundColor: '#8b5cf6', 
                    paddingVertical: 10, 
                    paddingHorizontal: 20, 
                    borderRadius: 24, 
                    marginBottom: 16,
                    opacity: isGeneratingQR ? 0.7 : 1
                  }} 
                  onPress={generateHandoverQR} 
                  disabled={isGeneratingQR}
                >
                  {isGeneratingQR ? (
                    <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  ) : (
                    <RefreshCw color="#fff" size={16} style={{ marginRight: 8 }} />
                  )}
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                    {isGeneratingQR ? 'Refreshing...' : 'Refresh QR'}
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: '#a1a1aa', fontSize: 13, textAlign: 'center', paddingHorizontal: 20 }}>
                  Show this QR to the Warehouse Staff. It expires in 2 minutes.
                </Text>
              </View>
            ) : (
              <TouchableOpacity 
                style={[styles.primaryBtn, { width: '100%', marginTop: 24 }, isGeneratingQR && { opacity: 0.7 }]} 
                onPress={generateHandoverQR}
                disabled={isGeneratingQR}
              >
                {isGeneratingQR ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Show Handover QR</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#a1a1aa', marginTop: 12, fontSize: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { color: '#8b5cf6', fontSize: 18, fontWeight: 'bold' },
  scrollContent: { padding: 16 },
  orderCard: { backgroundColor: '#18181b', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#8b5cf6' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  orderIdLabel: { color: '#9ca3af', fontSize: 12, fontWeight: 'bold' },
  orderIdValue: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#27272a', padding: 12, borderRadius: 8 },
  reasonText: { color: '#f59e0b', fontSize: 14, fontWeight: 'bold', flex: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  detailText: { color: '#e4e4e7', fontSize: 15, lineHeight: 22 },
  detailSubText: { color: '#a1a1aa', fontSize: 13, marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', padding: 12, borderRadius: 8, marginBottom: 8 },
  itemIconBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#27272a', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  itemName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  itemSku: { color: '#a1a1aa', fontSize: 12, marginTop: 2 },
  itemQuantity: { color: '#10b981', fontSize: 18, fontWeight: 'bold' },
  footer: { padding: 16, backgroundColor: '#18181b', borderTopWidth: 1, borderTopColor: '#27272a' },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#8b5cf6', marginBottom: 12 },
  navBtnText: { color: '#8b5cf6', fontSize: 16, fontWeight: 'bold' },
  primaryBtn: { backgroundColor: '#8b5cf6', paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  arrivedContainer: { alignItems: 'center', paddingVertical: 20 },
  arrivedTitle: { color: '#10b981', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  arrivedSub: { color: '#a1a1aa', fontSize: 14 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#27272a', padding: 12, borderRadius: 8, width: '100%' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#52525b', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  checkboxText: { color: '#e4e4e7', fontSize: 14, flex: 1, lineHeight: 20 }
});
