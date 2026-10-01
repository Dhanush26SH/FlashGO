import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { ArrowLeft, Package, CheckSquare, Square, CheckCircle2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

export default function CustomerReturnIntakePreviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isFocused = useIsFocused();
  const { taskId, rawToken } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleConfirm = async () => {
    if (!taskId || !rawToken) {
      Alert.alert('Error', 'Missing QR token data. Please scan the QR code again.');
      return;
    }
    setIsConfirming(true);
    try {
      const { data, error } = await supabase.rpc('warehouse_staff_receive_customer_return', {
        p_task_id: taskId,
        p_raw_token: rawToken
      });
      if (error) throw error;
      setIsSuccess(true);
    } catch (err: any) {
      let msg = err.message || 'Failed to confirm return.';
      if (msg.includes('expired') || msg.includes('consumed') || msg.includes('Invalid token hash') || msg.includes('payload format')) {
        msg = 'QR code is expired, invalid, or already consumed. Please ask the driver to refresh their QR code and scan again.';
      }
      Alert.alert('Confirmation Failed', msg);
    } finally {
      setIsConfirming(false);
    }
  };

  const fetchPreview = useCallback(async () => {
    try {
      if (!taskId) throw new Error("No Task ID provided");
      
      const { data, error } = await supabase.rpc('warehouse_staff_get_customer_return_preview', {
        p_task_id: taskId
      });

      if (error) throw error;
      if (data.status !== 'picked_up') {
        throw new Error('Task is not in picked_up status');
      }
      setTask(data);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load preview details");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (isFocused) {
      fetchPreview();
    }
  }, [isFocused, fetchPreview]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </SafeAreaView>
    );
  }

  if (errorMsg || !task) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.navigate('WarehouseMainTabs')} style={styles.backBtn}>
            <ArrowLeft color="#0f172a" size={24} />
          </TouchableOpacity>
          <Text style={styles.title}>Preview Error</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMsg || 'Task not found'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchPreview}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const items = task.items || [];
  const totalExpected = items.reduce((sum: number, item: any) => sum + (item.expected_quantity || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('WarehouseMainTabs')} style={styles.backBtn}>
          <ArrowLeft color="#0f172a" size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Customer Return Intake Preview</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Driver</Text>
          <Text style={styles.infoValue}>{task.driver?.full_name || 'Unknown'}</Text>
          
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Warehouse</Text>
              <Text style={styles.infoValue}>{task.warehouses?.name || 'Unknown'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Order ID</Text>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">{task.order_id.split('-')[0]}</Text>
            </View>
          </View>
          
          <View style={[styles.row, { marginTop: 12 }]}>
             <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Return Reason</Text>
              <Text style={styles.infoValue}>{task.reason}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Expected Items</Text>
        
        <View style={styles.orderGroup}>
          <Text style={styles.orderTitle}>Total Expected: {totalExpected}</Text>
          {items.map((item: any, index: number) => (
            <View key={index} style={styles.itemRow}>
              <View style={styles.itemDetails}>
                <Text style={styles.itemName}>{item.order_items?.product_name_snapshot || 'Unknown Product'}</Text>
                <Text style={styles.itemBarcode}>{item.order_items?.sku_snapshot || 'No SKU'}</Text>
              </View>
              <View style={styles.itemQuantity}>
                <Text style={styles.quantityText}>Qty: {item.expected_quantity}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.footer}>
        {isSuccess ? (
          <View style={styles.successState}>
            <CheckCircle2 color="#22c55e" size={48} style={{ marginBottom: 12 }} />
            <Text style={styles.successTitle}>Return Received</Text>
            <Text style={styles.successText}>Warehouse custody confirmed.</Text>
            <TouchableOpacity 
              style={[styles.scanBtn, { width: '100%', marginTop: 24 }]}
              onPress={() => navigation.navigate('WarehouseMainTabs')}
            >
              <Text style={styles.scanBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionState}>
            <TouchableOpacity 
              style={styles.checkboxRow} 
              onPress={() => setIsVerified(!isVerified)}
              disabled={isConfirming}
            >
              {isVerified ? <CheckSquare color="#3b82f6" size={24} /> : <Square color="#94a3b8" size={24} />}
              <Text style={styles.checkboxText}>I have received and verified the listed return item(s) from the driver.</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.confirmBtn, (!isVerified || isConfirming) && styles.disabledBtn]}
              onPress={handleConfirm}
              disabled={!isVerified || isConfirming}
            >
              {isConfirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Return Received</Text>
              )}
            </TouchableOpacity>
          </View>
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
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  orderGroup: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  orderTitle: { backgroundColor: '#f1f5f9', padding: 12, fontSize: 14, fontWeight: '600', color: '#475569' },
  itemRow: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', alignItems: 'center' },
  itemDetails: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  itemBarcode: { fontSize: 13, color: '#64748b' },
  itemQuantity: { minWidth: 60, alignItems: 'flex-end', justifyContent: 'center' },
  quantityText: { fontSize: 16, fontWeight: '700', color: '#3b82f6' },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  scanBtn: { flexDirection: 'row', backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  checkboxText: { marginLeft: 12, fontSize: 14, color: '#334155', flex: 1, lineHeight: 20 },
  actionState: { width: '100%' },
  confirmBtn: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center' },
  disabledBtn: { backgroundColor: '#94a3b8', opacity: 0.7 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  successState: { alignItems: 'center', padding: 16 },
  successTitle: { color: '#22c55e', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  successText: { color: '#64748b', fontSize: 14, textAlign: 'center' }
});
