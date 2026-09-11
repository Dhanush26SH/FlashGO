import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Package, User, ChevronDown, ChevronUp, CheckCircle2, Phone, Map as MapIcon, CreditCard, Banknote } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

interface DropOrderData {
  trip_id: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  total_amount: number;
  payment_method: string;
  items: any[];
  total_item_count: number;
}

export default function DriverDropOrderScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DropOrderData | null>(null);
  
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const [customerExpanded, setCustomerExpanded] = useState(false);
  
  const [otp, setOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [completing, setCompleting] = useState(false);
  
  const [codCollected, setCodCollected] = useState(false);

  useEffect(() => {
    fetchDelivery();
  }, []);

  const fetchDelivery = async () => {
    try {
      const { data: res, error } = await supabase.rpc('driver_get_active_delivery');
      if (error) throw error;
      if (res?.success && res.order) {
        setData({
          trip_id: res.trip.id,
          order_id: res.order.id,
          order_number: res.order.order_number || res.order.id.slice(0, 8).toUpperCase(),
          customer_name: res.order.customer_name,
          customer_phone: res.order.customer_phone,
          delivery_address: res.order.delivery_address,
          total_amount: res.order.total_amount,
          payment_method: res.order.payment_method || 'online',
          items: res.order.items || [],
          total_item_count: res.order.total_item_count || 0
        });
      } else {
        navigation.navigate('DriverOperationsMapScreen');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isHighValue = (data?.total_amount || 0) > 1000;
  const isCod = data?.payment_method === 'cod';

  const handleVerifyOtp = async () => {
    if (!data || otp.length < 4) return;
    setVerifyingOtp(true);
    try {
      const { data: res, error } = await supabase.rpc('driver_verify_delivery_otp', {
        p_order_id: data.order_id,
        p_otp: otp
      });
      if (error) throw error;
      if (res?.success || res?.code === 'ALREADY_VERIFIED' || res?.code === 'NO_OTP_REQUIRED') {
        setOtpVerified(true);
      } else {
        Alert.alert('Verification Failed', res?.code || 'Invalid OTP');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleComplete = async () => {
    if (!data || completing) return;
    setCompleting(true);
    try {
      // 1. Fetch Authoritative Route Distance
      const { data: routeData, error: routeError } = await supabase.functions.invoke('calculate_route_distance', {
        body: { trip_id: data.trip_id }
      });
      
      if (routeError || !routeData?.success) {
        Alert.alert('Route Unavailable', routeData?.error || 'Failed to determine route distance. Please try again.');
        setCompleting(false);
        return;
      }

      // 2. Complete Delivery
      const { data: res, error } = await supabase.rpc('driver_complete_delivery', {
        p_trip_id: data.trip_id,
        p_cod_collected: isCod ? true : false
      });
      if (error) throw error;
      
      if (res?.success) {
        navigation.replace('DriverDeliveryCompleteScreen');
      } else {
        Alert.alert('Delivery Failed', res?.code || 'Failed to complete delivery');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCompleting(false);
    }
  };

  if (loading || !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  const isCompleteEnabled = 
    (!isHighValue || otpVerified) && 
    (!isCod || codCollected);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.orderLabel}>ORDER ID</Text>
        <Text style={styles.orderId}>{data.order_number}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        
        {/* Payment State */}
        <View style={[styles.paymentCard, isCod ? styles.paymentCod : styles.paymentOnline]}>
          {isCod ? (
            <>
              <Banknote color="#fbbf24" size={28} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.paymentTitleCod}>Cash on delivery</Text>
                <Text style={styles.paymentAmount}>Collect ₹{data.total_amount}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.codCheckBtn, codCollected && styles.codCheckBtnActive]} 
                onPress={() => setCodCollected(!codCollected)}
              >
                {codCollected && <CheckCircle2 color="#000" size={20} />}
                <Text style={[styles.codCheckText, codCollected && { color: '#000' }]}>
                  {codCollected ? 'Collected' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <CreditCard color="#10b981" size={24} />
              <View style={{ marginLeft: 16 }}>
                <Text style={styles.paymentTitleOnline}>Paid online</Text>
                <Text style={styles.paymentAmountSub}>No cash to collect</Text>
              </View>
            </>
          )}
        </View>

        {/* High Value OTP */}
        {isHighValue && (
          <View style={styles.otpCard}>
            <Text style={styles.otpTitle}>High Value Order (₹{data.total_amount})</Text>
            {otpVerified ? (
              <View style={styles.otpSuccessRow}>
                <CheckCircle2 color="#10b981" size={20} />
                <Text style={styles.otpSuccessText}>OTP Verified ✓</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.otpSub}>Ask the customer for the delivery OTP to complete this order.</Text>
                <View style={styles.otpInputRow}>
                  <TextInput
                    style={styles.otpInput}
                    placeholder="Enter OTP"
                    placeholderTextColor="#6b7280"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={setOtp}
                    editable={!verifyingOtp}
                  />
                  <TouchableOpacity 
                    style={styles.otpVerifyBtn} 
                    onPress={handleVerifyOtp}
                    disabled={verifyingOtp || otp.length < 4}
                  >
                    {verifyingOtp ? <ActivityIndicator color="#000" /> : <Text style={styles.otpVerifyBtnText}>Verify</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Order Details */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setOrdersExpanded(v => !v)}>
          <View style={styles.sectionHeaderLeft}>
            <Package color="#9ca3af" size={18} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.sectionTitle}>Order details</Text>
              <Text style={styles.sectionSub}>{data.total_item_count} items</Text>
            </View>
          </View>
          {ordersExpanded ? <ChevronUp color="#9ca3af" size={20} /> : <ChevronDown color="#9ca3af" size={20} />}
        </TouchableOpacity>
        {ordersExpanded && (
          <View style={styles.sectionBody}>
            {data.items?.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemQty}>{item.quantity}×</Text>
                <Text style={styles.itemName} numberOfLines={2}>{item.product_name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Customer Details */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setCustomerExpanded(v => !v)}>
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
              <Text style={styles.detailValue}>{data.customer_name}</Text>
            </View>
            <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
              <Text style={styles.detailLabel}>Address</Text>
              <Text style={[styles.detailValue, { flex: 1, textAlign: 'right', marginLeft: 16 }]}>{data.delivery_address}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phone</Text>
              <Text style={styles.detailValue}>{data.customer_phone}</Text>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity 
          style={[styles.completeBtn, !isCompleteEnabled && styles.completeBtnDisabled]} 
          onPress={handleComplete}
          disabled={!isCompleteEnabled || completing}
        >
          {completing ? (
             <ActivityIndicator color="#000" />
          ) : (
             <Text style={[styles.completeBtnText, !isCompleteEnabled && styles.completeBtnTextDisabled]}>
               Order delivered →
             </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  loadingContainer: { flex: 1, backgroundColor: '#09090b', justifyContent: 'center' },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
    alignItems: 'center'
  },
  orderLabel: { color: '#6b7280', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  orderId: { color: '#ffffff', fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  paymentOnline: {
    backgroundColor: '#064e3b20',
    borderColor: '#064e3b80',
  },
  paymentCod: {
    backgroundColor: '#78350f20',
    borderColor: '#78350f80',
  },
  paymentTitleOnline: { color: '#10b981', fontSize: 16, fontWeight: '600' },
  paymentTitleCod: { color: '#fbbf24', fontSize: 15, fontWeight: '600' },
  paymentAmount: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  paymentAmountSub: { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  
  codCheckBtn: {
    borderWidth: 1,
    borderColor: '#fbbf24',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  codCheckBtnActive: {
    backgroundColor: '#fbbf24',
  },
  codCheckText: {
    color: '#fbbf24',
    fontWeight: '600',
    fontSize: 14
  },

  otpCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  otpTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  otpSub: { color: '#9ca3af', fontSize: 13, marginBottom: 16 },
  otpInputRow: { flexDirection: 'row', gap: 12 },
  otpInput: {
    flex: 1,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 16,
    fontSize: 18,
    letterSpacing: 2,
    fontWeight: '600'
  },
  otpVerifyBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  otpVerifyBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  otpSuccessRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  otpSuccessText: { color: '#10b981', fontSize: 16, fontWeight: 'bold' },

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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f1f23',
    gap: 12,
  },
  itemRow: { flexDirection: 'row', gap: 12 },
  itemQty: { color: '#10b981', fontSize: 14, fontWeight: 'bold', minWidth: 28 },
  itemName: { color: '#d1d5db', fontSize: 14, flex: 1 },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { color: '#6b7280', fontSize: 13 },
  detailValue: { color: '#fff', fontSize: 14, fontWeight: '500' },

  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f1f23',
    backgroundColor: '#09090b',
  },
  completeBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  completeBtnDisabled: {
    backgroundColor: '#1f1f23',
    borderColor: '#27272a',
    borderWidth: 1
  },
  completeBtnText: { color: '#000', fontSize: 17, fontWeight: 'bold' },
  completeBtnTextDisabled: { color: '#6b7280' }
});
