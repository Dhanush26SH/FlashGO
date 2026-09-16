import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function RiderDashboard({ route, navigation }: any) {
  const { tripId } = route.params || {};
  const { profile } = useAuth() as any;
  const isOnline = profile?.is_online || false;
  const [otpInputs, setOtpInputs] = useState<{ [orderId: string]: string }>({});
  const [verifying, setVerifying] = useState<{ [orderId: string]: boolean }>({});
  
  const [trip, setTrip] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [warehouse, setWarehouse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // GPS State
  const [isGpsActive, setIsGpsActive] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // State for daily stats
  const [totalDrops, setTotalDrops] = useState<number | string>('...');
  const [riderEarnings, setRiderEarnings] = useState<number | string>('...');

  const fetchTripDetails = async () => {
    if (!tripId) return;
    
    // Fetch trip
    const { data: tripData } = await supabase
      .from('logistics_trips')
      .select('*')
      .eq('id', tripId)
      .single();
      
    if (tripData) {
      setTrip(tripData);
      
      // Fetch warehouse
      if (tripData.warehouse_id) {
        const { data: whData } = await supabase
          .from('warehouses')
          .select('name, address')
          .eq('id', tripData.warehouse_id)
          .single();
        setWarehouse(whData);
      }

      // Fetch orders
      const { data: ordersData } = await supabase
        .from('orders')
        .select('id, status, delivery_address, total_amount, payment_method, bag_number')
        .eq('trip_id', tripId)
        .order('delivery_sequence', { ascending: true });
        
      setOrders(ordersData || []);
    }
    
    // Fetch today's earnings and drops
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const { data: earns } = await supabase
      .from('driver_earnings')
      .select('earning_amount')
      .eq('driver_id', profile.id)
      .gte('created_at', todayStr);

    if (earns) {
      setRiderEarnings(earns.reduce((sum, e) => sum + Number(e.earning_amount), 0).toFixed(2));
    }

    const { count: tripsCount } = await supabase
      .from('logistics_trips')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', profile.id)
      .in('status', ['completed', 'delivered'])
      .gte('updated_at', todayStr);

    if (tripsCount !== null) {
      setTotalDrops(tripsCount);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchTripDetails();
    
    const channelName = `trip_${tripId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'logistics_trips', filter: `id=eq.${tripId}` },
        () => {
          fetchTripDetails();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `trip_id=eq.${tripId}` },
        () => {
          fetchTripDetails();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  const isInTransit = trip?.status === 'in_transit';

  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let isMounted = true;

    const startLocationTracking = async () => {
      if (!isInTransit) {
        setIsGpsActive(false);
        return;
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (isMounted) setLocationError('Permission to access location was denied');
          return;
        }
        
        const providerStatus = await Location.getProviderStatusAsync();
        if (!providerStatus?.locationServicesEnabled) {
          if (isMounted) setLocationError('Location services disabled/unavailable');
          return;
        }

        const { data: sessionExists } = await supabase
          .from('driver_sessions')
          .select('id')
          .eq('driver_id', profile.id)
          .single();

        if (!sessionExists) {
          await supabase.from('driver_sessions').insert({
            driver_id: profile.id,
            status: 'delivering'
          });
        } else {
          await supabase.from('driver_sessions').update({ status: 'delivering' }).eq('driver_id', profile.id);
        }

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 50,
            timeInterval: 10000,
          },
          async (location) => {
            if (isMounted) {
              setIsGpsActive(true);
              setLocationError(null);
            }
            try {
              const { error } = await supabase.from('driver_sessions').update({
                latest_lat: location.coords.latitude,
                latest_lng: location.coords.longitude,
                updated_at: new Date().toISOString(),
              }).eq('driver_id', profile.id);
              
              if (error && isMounted) {
                setLocationError('Supabase location update failure: ' + error.message);
                setIsGpsActive(false);
              }
            } catch (err: any) {
              if (isMounted) {
                setLocationError('Supabase location update failure: ' + err.message);
                setIsGpsActive(false);
              }
            }
          }
        );
      } catch (err: any) {
        if (isMounted) setLocationError('Location watcher failure: ' + err.message);
      }
    };

    if (isInTransit) {
      startLocationTracking();
    } else {
      setIsGpsActive(false);
    }

    return () => {
      isMounted = false;
      if (locationSub) {
        locationSub.remove();
      }
    };
  }, [isInTransit, profile?.id]);


  const handleClaimTrip = async () => {
    try {
      const { error } = await supabase.rpc('claim_trip', {
        p_trip_id: tripId,
        p_driver_id: profile?.id
      });
      if (error) throw error;
      fetchTripDetails();
    } catch (e: any) {
      Alert.alert('Claim Failed', e.message);
    }
  };

  const handleStartTrip = async () => {
    try {
      const { error } = await supabase.rpc('start_trip', {
        p_trip_id: tripId,
        p_driver_id: profile?.id
      });
      if (error) throw error;
      fetchTripDetails();
    } catch (e: any) {
      Alert.alert('Start Trip Failed', e.message);
    }
  };

  const handleVerifyOtp = async (orderId: string) => {
    const enteredOtp = otpInputs[orderId];
    if (!enteredOtp || enteredOtp.length !== 4) {
      Alert.alert('Invalid OTP', 'Please enter a 4-digit OTP.');
      return;
    }
    
    setVerifying(prev => ({ ...prev, [orderId]: true }));
    try {
      const { error } = await supabase.rpc('mark_order_delivered', {
        p_order_id: orderId,
        p_otp: enteredOtp,
        p_driver_id: profile?.id
      });
      if (error) throw error;
      
      // OTP matched and delivered, reset input and refetch
      setOtpInputs(prev => ({ ...prev, [orderId]: '' }));
      fetchTripDetails();
    } catch (e: any) {
      Alert.alert('Verification Failed', e.message);
    } finally {
      setVerifying(prev => ({ ...prev, [orderId]: false }));
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={{ color: 'white', padding: 20 }}>Loading trip details...</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.container}>
        <Text style={{ color: 'white', padding: 20 }}>Trip not found.</Text>
      </View>
    );
  }

  const isPending = trip.status === 'pending';
  const isAccepted = trip.status === 'accepted';
  const isCompleted = trip.status === 'completed' || trip.status === 'delivered'; 

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>⚡ Rider Fleet Terminal</Text>
          <Text style={styles.headerSub}>GPS Route & Payout Console</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => navigation.goBack()}>
          <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.taskCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.taskTitle}>Trip Status</Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                {trip.status.toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity style={[styles.onlineBtn, !isOnline && { backgroundColor: '#374151' }]}>
              <Text style={styles.onlineBtnText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isPending && (
          <View style={styles.taskCard}>
            <Text style={styles.taskTitle}>Available Trip (Pending)</Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
              Warehouse: {warehouse?.name || 'Unknown'} - {warehouse?.address || ''}
            </Text>
            {isOnline ? (
              <TouchableOpacity style={[styles.jobBtn, { marginTop: 16 }]} onPress={handleClaimTrip}>
                <Text style={styles.jobBtnText}>CLAIM TRIP</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: '#ef4444', marginTop: 16, fontWeight: 'bold' }}>Go online to claim trips.</Text>
            )}
          </View>
        )}

        {isAccepted && (
          <View style={styles.taskCard}>
            <Text style={styles.taskTitle}>Pickup from Warehouse</Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
              Head to {warehouse?.name || 'Unknown'} at {warehouse?.address || ''} to collect the bags.
            </Text>
            
            <View style={styles.jobBox}>
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>Orders to Pick Up: {orders.length}</Text>
              {orders.map((o, idx) => (
                <Text key={o.id} style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                  {idx + 1}. Bag: {o.bag_number || 'Pending'} (Order: {o.id.split('-')[0]})
                </Text>
              ))}
            </View>

            <TouchableOpacity style={[styles.jobBtn, { marginTop: 16 }]} onPress={handleStartTrip}>
              <Text style={styles.jobBtnText}>CONFIRM PICKUP & START DELIVERY</Text>
            </TouchableOpacity>
          </View>
        )}

        {(isInTransit || isCompleted) && (
          <>
            <View style={styles.taskCard}>
              <Text style={styles.taskTitle}>{isCompleted ? 'Delivery Completed' : 'Out for Delivery'}</Text>
              
              {!isCompleted && (
                <View style={{ marginTop: 8, marginBottom: 8 }}>
                  {locationError ? (
                    <Text style={{ color: '#ef4444', fontSize: 12 }}>⚠️ {locationError}</Text>
                  ) : isGpsActive ? (
                    <Text style={{ color: '#10b981', fontSize: 12, fontWeight: 'bold' }}>📡 GPS Broadcasting Active</Text>
                  ) : (
                    <Text style={{ color: '#fbbf24', fontSize: 12 }}>Waiting for GPS signal...</Text>
                  )}
                </View>
              )}
              {isCompleted && (
                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4, marginBottom: 8 }}>
                  All orders delivered. Location broadcasting stopped.
                </Text>
              )}

              {orders.map(order => (
                <View key={order.id} style={styles.jobBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14, flex: 1 }} numberOfLines={2}>
                      Drop: {order.delivery_address}
                    </Text>
                    <Text style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: 12, marginLeft: 8 }}>
                      {order.payment_method === 'cod' ? `COD: ₹${order.total_amount}` : 'PREPAID'}
                    </Text>
                  </View>
                  <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                    Bag Serial: {order.bag_number || 'Pending'} • Order ID: {order.id.split('-')[0]}
                  </Text>

                  {order.payment_method === 'cod' && order.status !== 'delivered' && (
                    <Text style={{ color: '#f87171', fontWeight: 'bold', marginTop: 8 }}>
                      ⚠️ Collect ₹{order.total_amount} from customer!
                    </Text>
                  )}
                  
                  {order.status !== 'delivered' ? (
                    <>
                      <TouchableOpacity style={[styles.jobBtn, { marginTop: 12, backgroundColor: '#3b82f6' }]}>
                        <Text style={styles.jobBtnText}>Open in Maps</Text>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                        <View style={styles.otpVerifyBox}>
                          <TextInput 
                            style={styles.otpInput} 
                            placeholder="Enter 4-digit OTP" 
                            placeholderTextColor="#4b5563" 
                            maxLength={4} 
                            keyboardType="number-pad" 
                            value={otpInputs[order.id] || ''} 
                            onChangeText={(text) => setOtpInputs(prev => ({ ...prev, [order.id]: text }))}
                            editable={!verifying[order.id]}
                          />
                          <TouchableOpacity 
                            style={[styles.otpBtn, verifying[order.id] && { opacity: 0.5 }]} 
                            disabled={verifying[order.id]}
                            onPress={() => handleVerifyOtp(order.id)}
                          >
                            <Text style={styles.otpBtnText}>{verifying[order.id] ? 'Verifying...' : 'Verify'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  ) : (
                    <Text style={{ color: '#10b981', fontWeight: 'bold', marginTop: 12, fontSize: 13 }}>✓ Handover Completed</Text>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.taskCard}>
              <Text style={styles.taskTitle}>Daily Payout Ledger</Text>
              <View style={styles.earningsGrid}>
                <View style={styles.earningsBox}>
                  <Text style={{ color: '#94a3b8', fontSize: 11 }}>Drops Done</Text>
                  <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: 'bold', marginTop: 4 }}>{totalDrops}</Text>
                </View>
                <View style={styles.earningsBox}>
                  <Text style={{ color: '#94a3b8', fontSize: 11 }}>Total Payout</Text>
                  <Text style={{ color: '#10b981', fontSize: 20, fontWeight: 'bold', marginTop: 4 }}>₹{riderEarnings}</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
  headerSub: { fontSize: 11, color: '#94a3b8' },
  logoutBtn: { backgroundColor: 'rgba(239, 68, 68, 0.12)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  scrollBody: { padding: 16 },
  taskCard: { backgroundColor: '#0f172a', borderRadius: 20, borderWidth: 1, borderColor: '#1e293b', padding: 16, marginBottom: 16 },
  taskTitle: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  onlineBtn: { backgroundColor: 'transparent', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: '#374151' },
  onlineBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  jobBox: { backgroundColor: '#030712', borderRadius: 16, borderWidth: 1, borderColor: '#1e293b', padding: 14, marginTop: 12 },
  jobBtn: { backgroundColor: '#10b981', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  jobBtnText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  otpVerifyBox: { flex: 1, flexDirection: 'row', gap: 6 },
  otpInput: { flex: 1.2, backgroundColor: '#030712', borderWidth: 1, borderColor: '#334155', borderRadius: 12, color: '#ffffff', textAlign: 'center' },
  otpBtn: { flex: 1, backgroundColor: '#fbbf24', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  otpBtnText: { color: '#030712', fontSize: 12, fontWeight: 'bold' },
  earningsGrid: { flexDirection: 'row', gap: 12, marginTop: 12 },
  earningsBox: { flex: 1, backgroundColor: '#030712', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', padding: 12 }
});
