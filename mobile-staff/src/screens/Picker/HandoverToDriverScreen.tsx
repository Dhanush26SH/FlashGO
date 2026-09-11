import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, Truck, PackageCheck, User } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function HandoverToDriverScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const orderId = route.params?.orderId;
  const { profile } = useAuth() as any;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);

  const fetchOrderAndDriver = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, driver_id, trip_id,
          driver:profiles!orders_driver_id_fkey(id, full_name, phone_number)
        `)
        .eq('id', orderId)
        .maybeSingle();

      if (error) throw error;
      setOrder(data);
      if (data?.driver) {
        setDriver(data.driver);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderAndDriver();
  }, [orderId]);

  // Realtime subscription for driver assignment
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase.channel('handover-order')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => { fetchOrderAndDriver(); }
      )
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const handleHandover = async () => {
    if (!driver || !order?.trip_id) {
      Alert.alert('Error', 'No driver assigned yet.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('execute_worker_handover', {
        p_order_id: orderId,
        p_picker_id: profile.id
      });
      if (error) throw error;
      
      // Successfully handed off, return to picker dashboard
      navigation.reset({
        index: 0,
        routes: [{ name: 'PickerShift' }],
      });
    } catch (e: any) {
      Alert.alert('Handover Failed', e.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft color="#fff" size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Handover bag to driver</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.orderIdBadge}>
          <Text style={styles.orderIdText}>Order #{orderId?.substring(0, 8).toUpperCase()}</Text>
        </View>

        {/* Counter Info - We don't have this in DB currently, so showing unassigned */}
        <View style={styles.counterCard}>
          <Text style={styles.counterLabel}>Handover location not assigned</Text>
        </View>

        {/* Driver Info */}
        <View style={styles.driverCard}>
          <View style={styles.driverHeader}>
            <Truck color="#60a5fa" size={24} />
            <Text style={styles.driverTitle}>Assigned Driver</Text>
          </View>
          
          {driver ? (
            <View style={styles.driverDetails}>
              <View style={styles.driverAvatar}>
                <User color="#9ca3af" size={32} />
              </View>
              <View>
                <Text style={styles.driverName}>{driver.full_name || 'Driver'}</Text>
                <Text style={styles.driverPhone}>{driver.phone_number || 'No phone number'}</Text>
                <Text style={styles.tripId}>Trip ID: {order.trip_id?.substring(0,8).toUpperCase()}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.noDriverContainer}>
              <ActivityIndicator color="#60a5fa" style={{ marginBottom: 12 }} />
              <Text style={styles.noDriverText}>Waiting for driver assignment...</Text>
              <Text style={styles.noDriverSubText}>Please pack the items and wait.</Text>
            </View>
          )}
        </View>

        {/* Package Info */}
        <View style={styles.packageCard}>
          <PackageCheck color="#10b981" size={24} />
          <Text style={styles.packageText}>Packages ready for handover</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[
            styles.handoverButton, 
            (!driver || submitting) && styles.handoverButtonDisabled
          ]}
          onPress={handleHandover}
          disabled={!driver || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.handoverButtonText}>
              {driver ? 'Handover' : 'Waiting...'}
            </Text>
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
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  orderIdBadge: {
    alignSelf: 'center',
    backgroundColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginBottom: 24,
  },
  orderIdText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  counterCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
    borderStyle: 'dashed',
  },
  counterLabel: {
    color: '#9ca3af',
    fontSize: 14,
    fontStyle: 'italic',
  },
  driverCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  driverTitle: {
    color: '#60a5fa',
    fontSize: 16,
    fontWeight: '600',
  },
  driverDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  driverAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  driverPhone: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 4,
  },
  tripId: {
    color: '#6b7280',
    fontSize: 12,
  },
  noDriverContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  noDriverText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  noDriverSubText: {
    color: '#6b7280',
    fontSize: 14,
  },
  packageCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  packageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    padding: 16,
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  handoverButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  handoverButtonDisabled: {
    backgroundColor: '#374151',
  },
  handoverButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
