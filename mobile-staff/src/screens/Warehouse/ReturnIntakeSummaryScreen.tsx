import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, Alert } from 'react-native';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { ArrowLeft, CheckCircle, Package } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

export default function ReturnIntakeSummaryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isFocused = useIsFocused();
  const { intakeId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [intake, setIntake] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchIntake = useCallback(async () => {
    try {
      if (!intakeId) throw new Error("No Intake ID provided");
      
      const { data, error } = await supabase.rpc('staff_get_return_intake', {
        p_intake_id: intakeId
      });

      if (error) throw error;
      setIntake(data);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load intake details");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [intakeId]);

  useEffect(() => {
    if (isFocused) {
      fetchIntake();
    }
  }, [isFocused, fetchIntake]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchIntake();
  };

  const handleAbandon = () => {
    Alert.alert(
      'Close Invalid Intake',
      'This intake has no expected items and cannot be recovered. Are you sure you want to close it permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Close Intake', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const { error } = await supabase.rpc('staff_abandon_return_intake', {
                p_intake_id: intake.id,
                p_reason: 'invalid_expected_items'
              });
              if (error) throw error;
              navigation.navigate('WarehouseMainTabs');
            } catch (err: any) {
              Alert.alert('Error', err.message);
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleReload = async () => {
    if (reloading) return;
    try {
      setReloading(true);
      const { error } = await supabase.rpc('staff_reload_return_intake_items', {
        p_intake_id: intake.id
      });
      if (error) throw error;
      await fetchIntake();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reload expected items');
    } finally {
      setReloading(false);
    }
  };

  const handleComplete = () => {
    if (completing) return;
    Alert.alert(
      'Confirm Return Handover?',
      'All returned items have been physically received and verified. The items will be sent for disposition and will not become sellable automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm', 
          style: 'default',
          onPress: async () => {
            try {
              setCompleting(true);
              const { data, error } = await supabase.rpc('staff_complete_return_intake', {
                p_intake_id: intake.id
              });
              if (error) throw error;
              await fetchIntake();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to complete intake');
            } finally {
              setCompleting(false);
            }
          }
        }
      ]
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </SafeAreaView>
    );
  }

  if (errorMsg || !intake) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.navigate('WarehouseMainTabs')} style={styles.backBtn}>
            <ArrowLeft color="#0f172a" size={24} />
          </TouchableOpacity>
          <Text style={styles.title}>Return Error</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMsg || 'Intake not found'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchIntake}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const items = intake.items || [];
  const totalExpected = items.reduce((sum: number, item: any) => sum + item.expected_quantity, 0);
  const totalReceived = items.reduce((sum: number, item: any) => sum + item.received_quantity, 0);
  const allScanned = totalReceived >= totalExpected && totalExpected > 0;

  // Group items by Order ID
  const ordersMap = new Map<string, any[]>();
  items.forEach((item: any) => {
    const orderItems = ordersMap.get(item.order_id) || [];
    orderItems.push(item);
    ordersMap.set(item.order_id, orderItems);
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('WarehouseMainTabs')} style={styles.backBtn}>
          <ArrowLeft color="#0f172a" size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Return Summary</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Driver</Text>
          <Text style={styles.infoValue}>{intake.driver_name}</Text>
          
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Warehouse</Text>
              <Text style={styles.infoValue}>{intake.warehouse_name}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Trip Reference</Text>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">{intake.trip_id}</Text>
            </View>
          </View>
          
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>Progress: {totalReceived} / {totalExpected} Scanned</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 0}%` }]} />
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Expected Returns</Text>
        
        {Array.from(ordersMap.entries()).map(([orderId, orderItems]) => (
          <View key={orderId} style={styles.orderGroup}>
            <Text style={styles.orderTitle}>Order: {orderId.split('-')[0]}</Text>
            {orderItems.map((item: any) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemName}>{item.product_name}</Text>
                  <Text style={styles.itemBarcode}>{item.barcode}</Text>
                </View>
                <View style={styles.itemQuantity}>
                  {item.received_quantity >= item.expected_quantity ? (
                    <CheckCircle color="#10b981" size={24} />
                  ) : (
                    <Text style={styles.quantityText}>{item.received_quantity} / {item.expected_quantity}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.footer}>
        {intake.status === 'completed' ? (
          <View style={styles.completedState}>
            <CheckCircle color="#10b981" size={32} style={{ marginBottom: 8 }} />
            <Text style={styles.completedText}>Return Handover Completed</Text>
            <Text style={styles.noteText}>Returned items have been received and sent for disposition.</Text>
            <TouchableOpacity 
              style={[styles.scanBtn, { width: '100%', marginTop: 16 }]}
              onPress={() => navigation.navigate('WarehouseMainTabs')}
            >
              <Text style={styles.scanBtnText}>Back to Tasks</Text>
            </TouchableOpacity>
          </View>
        ) : intake.status === 'discrepancy' ? (
          <View style={styles.completedState}>
            <Package color="#f59e0b" size={32} style={{ marginBottom: 8 }} />
            <Text style={[styles.completedText, { color: '#f59e0b' }]}>Return Discrepancy</Text>
            <Text style={styles.noteText}>Handover completed with missing items. Sent for manager disposition.</Text>
            <TouchableOpacity 
              style={[styles.scanBtn, { backgroundColor: '#f59e0b', width: '100%', marginTop: 16 }]}
              onPress={() => navigation.navigate('WarehouseMainTabs')}
            >
              <Text style={styles.scanBtnText}>Back to Tasks</Text>
            </TouchableOpacity>
          </View>
        ) : intake.can_abandon_invalid_intake ? (
          <TouchableOpacity 
            style={[styles.scanBtn, { backgroundColor: '#ef4444' }]}
            onPress={handleAbandon}
          >
            <Text style={styles.scanBtnText}>Close Invalid Intake</Text>
          </TouchableOpacity>
        ) : intake.status === 'scanning' && items.length === 0 ? (
          <TouchableOpacity 
            style={[styles.scanBtn, { backgroundColor: reloading ? '#94a3b8' : '#3b82f6' }]}
            onPress={handleReload}
            disabled={reloading}
          >
            {reloading ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
            ) : (
              <Package color="#fff" size={20} style={{ marginRight: 8 }} />
            )}
            <Text style={styles.scanBtnText}>
              {reloading ? 'Reloading...' : 'Reload Expected Items'}
            </Text>
          </TouchableOpacity>
        ) : !allScanned ? (
          <TouchableOpacity 
            style={styles.scanBtn}
            onPress={() => navigation.navigate('ReturnItemScannerScreen', { intakeId: intake.id })}
          >
            <Package color="#fff" size={20} style={{ marginRight: 8 }} />
            <Text style={styles.scanBtnText}>Scan Returned Item</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.scanBtn, { backgroundColor: completing ? '#94a3b8' : '#10b981' }]}
            onPress={handleComplete}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
            ) : (
              <CheckCircle color="#fff" size={20} style={{ marginRight: 8 }} />
            )}
            <Text style={styles.scanBtnText}>Confirm Return Handover</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff'
  },
  backBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  errorText: { color: '#ef4444', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#3b82f6', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  content: { padding: 16 },
  infoCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', marginTop: 12 },
  infoLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  progressContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  progressText: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  progressBarBg: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#3b82f6' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  orderGroup: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  orderTitle: { backgroundColor: '#f1f5f9', padding: 12, fontSize: 14, fontWeight: '600', color: '#475569' },
  itemRow: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', alignItems: 'center' },
  itemDetails: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  itemBarcode: { fontSize: 13, color: '#64748b' },
  itemQuantity: { minWidth: 60, alignItems: 'flex-end' },
  quantityText: { fontSize: 16, fontWeight: '700', color: '#3b82f6' },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  scanBtn: { flexDirection: 'row', backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  completedState: { alignItems: 'center', padding: 16 },
  completedText: { color: '#10b981', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  noteText: { color: '#64748b', fontSize: 12, textAlign: 'center' }
});
