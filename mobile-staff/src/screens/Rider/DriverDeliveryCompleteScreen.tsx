import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CheckCircle2, TrendingUp, Navigation2, Clock } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export default function DriverDeliveryCompleteScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchCompletionData();
  }, []);

  const fetchCompletionData = async () => {
    try {
      // Find the most recently completed trip
      const { data: tripData, error: tripErr } = await supabase
        .from('logistics_trips')
        .select(`
          id, 
          route_distance_meters, 
          in_transit_at,
          created_at, 
          updated_at,
          orders ( id, delivery_address, order_number )
        `)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
        
      if (tripErr) throw tripErr;

      // Check for return obligation
      const { data: returnData } = await supabase
        .from('driver_return_tasks')
        .select('*')
        .eq('trip_id', tripData.id)
        .eq('status', 'required')
        .maybeSingle();

      // Get earnings for this order
      const orderId = tripData.orders?.[0]?.id;
      const { data: earningData } = await supabase
        .from('driver_earnings')
        .select('earning_amount')
        .eq('order_id', orderId)
        .maybeSingle();

      setData({
        trip: tripData,
        order: tripData.orders?.[0],
        returnTask: returnData,
        earning: earningData
      });
    } catch (err) {
      console.error(err);
      // Fallback to Ops Map if we can't load data
      navigation.reset({
        index: 0,
        routes: [{ name: 'DriverOperationsMapScreen' }]
      });
    } finally {
      setLoading(false);
    }
  };

  const [acknowledging, setAcknowledging] = useState(false);

  const handleOkay = async () => {
    if (acknowledging) return;
    setAcknowledging(true);
    try {
      const { data: res, error } = await supabase.rpc('driver_acknowledge_completion', { p_trip_id: data.trip.id });
      if (error) throw error;
      
      if (data?.returnTask) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'DriverReturnToStoreScreen' }]
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'DriverOperationsMapScreen' }]
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setAcknowledging(false);
    }
  };

  if (loading || !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  const { trip, order, returnTask, earning } = data;
  const isLongDistance = !!returnTask;
  
  // Format distance
  const distanceKm = trip.route_distance_meters ? (trip.route_distance_meters / 1000).toFixed(1) : '—';
  
  // Calculate time
  const startTime = trip.in_transit_at ? new Date(trip.in_transit_at).getTime() : new Date(trip.created_at).getTime();
  const completed = new Date(trip.updated_at).getTime();
  const mins = Math.max(1, Math.round((completed - startTime) / 60000));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.successIcon}>
          <CheckCircle2 color="#10b981" size={64} />
        </View>
        <Text style={styles.title}>Great job!</Text>
        <Text style={styles.subtitle}>Delivery complete 👍</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trip earnings</Text>
        <View style={styles.earningRow}>
          <Text style={styles.earningLabel}>Trip pay</Text>
          <Text style={styles.earningValue}>{earning ? `₹${earning.earning_amount}` : 'Calculating / Pending'}</Text>
        </View>
        {isLongDistance && (
          <View style={styles.earningRow}>
            <Text style={styles.earningLabel}>Long distance return pay</Text>
            <Text style={[styles.earningValue, { color: '#10b981' }]}>Calculating / Pending</Text>
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.earningRow}>
          <Text style={styles.totalLabel}>Total trip earnings</Text>
          <Text style={styles.totalValue}>{earning ? `₹${earning.earning_amount}` : 'Calculating / Pending'}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Navigation2 color="#9ca3af" size={20} />
          <Text style={styles.statValue}>{distanceKm} km</Text>
          <Text style={styles.statLabel}>Trip distance</Text>
        </View>
        <View style={styles.statBox}>
          <Clock color="#9ca3af" size={20} />
          <Text style={styles.statValue}>{mins} min</Text>
          <Text style={styles.statLabel}>Trip time</Text>
        </View>
      </View>

      {isLongDistance && (
        <View style={styles.longDistanceBox}>
          <TrendingUp color="#3b82f6" size={24} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.ldTitle}>Long Distance Return Pay!</Text>
            <Text style={styles.ldSub}>Order {order?.order_number}</Text>
            <Text style={styles.ldDesc}>Return to the store to receive your return bonus and get your next trip.</Text>
          </View>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.okayBtn} onPress={handleOkay} disabled={acknowledging}>
          {acknowledging ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.okayBtnText}>Get Next Order / Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', padding: 16 },
  loadingContainer: { flex: 1, backgroundColor: '#09090b', justifyContent: 'center' },
  
  topSection: { alignItems: 'center', marginTop: 40, marginBottom: 32 },
  successIcon: { marginBottom: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  subtitle: { color: '#9ca3af', fontSize: 18, marginTop: 4 },

  card: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16
  },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  earningRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  earningLabel: { color: '#9ca3af', fontSize: 15 },
  earningValue: { color: '#fff', fontSize: 15, fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#27272a', marginVertical: 12 },
  totalLabel: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  totalValue: { color: '#10b981', fontSize: 18, fontWeight: 'bold' },

  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center'
  },
  statValue: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  statLabel: { color: '#6b7280', fontSize: 13, marginTop: 4 },

  longDistanceBox: {
    flexDirection: 'row',
    backgroundColor: '#1e3a8a20',
    borderWidth: 1,
    borderColor: '#1e3a8a80',
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start'
  },
  ldTitle: { color: '#60a5fa', fontSize: 16, fontWeight: 'bold' },
  ldSub: { color: '#93c5fd', fontSize: 13, marginTop: 2 },
  ldDesc: { color: '#bfdbfe', fontSize: 13, marginTop: 8, lineHeight: 18 },

  bottomBar: { paddingVertical: 16 },
  okayBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  okayBtnText: { color: '#000', fontSize: 17, fontWeight: 'bold' }
});
