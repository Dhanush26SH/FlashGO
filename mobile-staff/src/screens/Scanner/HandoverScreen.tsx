import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { PackageCheck, UserCircle, Navigation, ArrowRight } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export default function HandoverScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const orderId = route.params?.orderId;

  const [loading, setLoading] = useState(true);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [orderStatus, setOrderStatus] = useState<string>('');

  const fetchOrderAndDriver = async () => {
    try {
      const { data: orderData } = await supabase
        .from('orders')
        .select('status, driver_id, trip_id')
        .eq('id', orderId)
        .maybeSingle();

      if (orderData) {
        setOrderStatus(orderData.status);
        if (orderData.driver_id) {
          const { data: driverData } = await supabase
            .from('profiles')
            .select('full_name, phone_number')
            .eq('id', orderData.driver_id)
            .maybeSingle();
            
          if (driverData) {
             setDriverInfo(driverData);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching driver", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchOrderAndDriver();
  }, [orderId]);
  
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`handover-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, () => {
        fetchOrderAndDriver();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Order Ready for Dispatch</Text>
          <Text style={styles.headerSub}>Order ID: {orderId?.substring(0,8).toUpperCase() || 'N/A'}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.successIconContainer}>
            <PackageCheck size={80} color="#10b981" />
            <Text style={styles.successText}>Order Packed Successfully!</Text>
            <Text style={{color: '#94a3b8', marginTop: 8}}>Awaiting Driver Assignment...</Text>
        </View>

        {/* Driver Card */}
        <View style={styles.driverCard}>
            <Text style={styles.assignedLabel}>ASSIGNED DRIVER</Text>
            <View style={styles.driverProfileRow}>
                <UserCircle size={64} color="#94a3b8" style={{ marginRight: 16 }} />
                <View>
                    <Text style={styles.driverName}>{driverInfo ? driverInfo.full_name : 'Searching...'}</Text>
                    <Text style={styles.driverPhone}>{driverInfo ? driverInfo.phone_number : 'Waiting for logistics...'}</Text>
                </View>
            </View>
            <View style={styles.etaBox}>
                <Navigation size={16} color="#3b82f6" />
                <Text style={styles.etaText}>
                  {driverInfo ? 'Driver is on the way' : 'Assigning driver...'}
                </Text>
            </View>
        </View>

      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomArea}>
          <Text style={styles.instructionText}>
            Hand over the package when the assigned driver arrives. You do not need to mark this manually.
          </Text>
          <TouchableOpacity 
            style={styles.actionBtnPrimary}
            onPress={() => navigation.navigate('MainTabs')}
            activeOpacity={0.8}
          >
            <Text style={styles.actionTextPrimary}>Return to Dashboard</Text>
            <ArrowRight size={20} color="#ffffff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    justifyContent: 'center'
  },
  headerTitleBox: { alignItems: 'center' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  headerSub: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  body: { flex: 1, padding: 24, justifyContent: 'center' },
  successIconContainer: {
      alignItems: 'center',
      marginBottom: 40
  },
  successText: {
      color: '#10b981',
      fontSize: 24,
      fontWeight: '800',
      marginTop: 16
  },
  driverCard: {
      backgroundColor: '#0f172a',
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: '#1e293b'
  },
  assignedLabel: {
      color: '#64748b',
      fontSize: 12,
      fontWeight: 'bold',
      letterSpacing: 1,
      marginBottom: 16
  },
  driverProfileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20
  },
  driverName: {
      color: '#ffffff',
      fontSize: 22,
      fontWeight: 'bold',
      marginBottom: 4
  },
  driverPhone: {
      color: '#94a3b8',
      fontSize: 16
  },
  etaBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      padding: 12,
      borderRadius: 10,
      alignSelf: 'flex-start'
  },
  etaText: {
      color: '#3b82f6',
      fontWeight: '600',
      marginLeft: 8
  },
  bottomArea: {
      padding: 24,
      backgroundColor: '#0f172a',
      borderTopWidth: 1,
      borderTopColor: '#1e293b'
  },
  instructionText: {
      color: '#94a3b8',
      textAlign: 'center',
      marginBottom: 20,
      fontSize: 14,
      lineHeight: 20
  },
  actionBtnPrimary: { 
    backgroundColor: '#3b82f6', 
    borderRadius: 16, 
    paddingVertical: 18, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  actionTextPrimary: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' }
});
