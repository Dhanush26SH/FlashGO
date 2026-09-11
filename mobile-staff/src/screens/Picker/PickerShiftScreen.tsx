import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useIsFocused, useRoute } from '@react-navigation/native';
import { Bell, CircleHelp, Package, ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// Helper component for Assigned Order Card
const AssignedOrderCard = ({ order, onStartPicking }: { order: any, onStartPicking: () => void }) => {
  const [starting, setStarting] = useState(false);
  const totalQty = order.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;

  const handlePress = async () => {
    setStarting(true);
    await onStartPicking();
    setStarting(false);
  };

  return (
    <View style={styles.orderCard}>
      <View style={styles.newBadge}>
        <Text style={styles.newBadgeText}>NEW ORDER</Text>
      </View>
      <Text style={styles.orderCardTitle}>Order Picking</Text>
      <View style={styles.qtyContainer}>
        <Text style={styles.qtyLabel}>Quantity</Text>
        <Text style={styles.qtyValue}>{totalQty}</Text>
      </View>
      <Text style={styles.orderId}>Order #{order.id.substring(0, 8).toUpperCase()}</Text>
      
      {/* Visual Timer Placeholder */}
      <View style={styles.timerContainer}>
        <View style={styles.timerBar}>
          <View style={[styles.timerProgress, { width: '80%' }]} />
        </View>
      </View>
      
      <TouchableOpacity 
        style={[styles.startButton, starting && { opacity: 0.7 }]} 
        onPress={handlePress}
        disabled={starting}
      >
        {starting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.startButtonText}>
            {order.status === 'picking' ? 'Resume Picking' : 'Start Picking'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default function PickerShiftScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const shiftId = route.params?.shiftId;
  const { profile } = useAuth() as any;
  const isFocused = useIsFocused();

  const [isOnline, setIsOnline] = useState(profile?.is_online || false);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [shiftDetails, setShiftDetails] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState('0h 0m');
  const [loading, setLoading] = useState(true);
  
  const soundRef = useRef<Audio.Sound | null>(null);
  const notifiedOrders = useRef<Set<string>>(new Set());

  // 1. Play Sound Logic
  const playNewOrderSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=success-1-6297.mp3' },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (e) {
      console.log('Error playing sound', e);
    }
  };

  // 2. Fetch Active Order
  const fetchActiveOrder = async (isRealtime = false) => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, 
          order_items(quantity, status)
        `)
        .eq('picker_id', profile.id)
        .in('status', ['placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      // If we got a new order that we haven't notified for yet
      if (data && ['placed', 'picking'].includes(data.status)) {
        if (!notifiedOrders.current.has(data.id)) {
          notifiedOrders.current.add(data.id);
          if (isRealtime) {
            playNewOrderSound();
          }
        }
      }

      setActiveOrder(data);
    } catch (err) {
      console.error("Fetch Active Order Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // 3. Toggle Online
  const toggleOnlineStatus = async (value: boolean) => {
    setIsOnline(value);
    if (profile?.id) {
      try {
        const { error } = await supabase.from('profiles').update({ is_online: value }).eq('id', profile.id);
        if (error) throw error;
      } catch (e: any) {
        setIsOnline(!value);
        Alert.alert("Update Failed", "Failed to update online status");
      }
    }
  };

  // 4. Fetch Shift
  const fetchShift = async () => {
    if (!shiftId) return;
    const { data } = await supabase
      .from('staff_shifts')
      .select('shift_start, shift_end, status')
      .eq('id', shiftId)
      .maybeSingle();
      
    if (data) {
      setShiftDetails(data);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchShift();
      fetchActiveOrder();
    }
  }, [isFocused]);

  // Realtime subscription
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase.channel('picker-active-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `picker_id=eq.${profile.id}` },
        () => { fetchActiveOrder(true); }
      )
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  // Cleanup Sound
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Update Timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (shiftDetails?.shift_start && shiftDetails?.status === 'active') {
        const diff = new Date().getTime() - new Date(shiftDetails.shift_start).getTime();
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        setElapsedTime(`${Math.max(0, hrs)}h ${Math.max(0, mins)}m`);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [shiftDetails]);

  const handleStartPicking = async () => {
    if (!activeOrder) return;
    if (activeOrder.status === 'picking') {
      navigation.navigate('Picking', { orderId: activeOrder.id });
      return;
    }
    try {
      const { error } = await supabase.rpc('start_picking', {
        p_order_id: activeOrder.id,
        p_picker_id: profile.id
      });
      if (error) throw error;
      
      await fetchActiveOrder();
      navigation.navigate('Picking', { orderId: activeOrder.id });
    } catch (e: any) {
      Alert.alert('Start Picking Failed', e.message);
    }
  };

  // Format shift time
  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hi, {profile?.full_name || 'Picker'}</Text>
          <Text style={styles.userDetails}>ID: {profile?.id?.substring(0,8) || '----'}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.toggleContainer}>
            <Switch
              trackColor={{ false: '#4b5563', true: '#10b981' }}
              thumbColor={'#ffffff'}
              onValueChange={toggleOnlineStatus}
              value={isOnline}
            />
            <Text style={styles.toggleText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn}>
            <Bell size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {/* Active Shift Card */}
        <View style={styles.shiftCard}>
          <View style={styles.shiftRow}>
            <View>
              <Text style={styles.shiftLabel}>ACTIVE TIME</Text>
              <Text style={styles.shiftTime}>{elapsedTime}</Text>
            </View>
            <View style={styles.shiftDetailsBox}>
              <Text style={styles.shiftDetailsText}>
                {shiftDetails ? `${formatTime(shiftDetails.shift_start)} - ${formatTime(shiftDetails.shift_end)}` : '--:-- - --:--'}
              </Text>
              <View style={styles.activeDot} />
            </View>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
        ) : activeOrder ? (
          // Order Assigned
          ['waiting_for_packing', 'packing', 'packed', 'staged'].includes(activeOrder.status) ? (
            <View style={styles.orderCard}>
              <Text style={styles.orderCardTitle}>Packing & Handover</Text>
              <Text style={styles.orderId}>Order #{activeOrder.id.substring(0, 8).toUpperCase()}</Text>
              <TouchableOpacity 
                style={styles.startButton} 
                onPress={() => navigation.navigate('HandoverToDriver', { orderId: activeOrder.id })}
              >
                <Text style={styles.startButtonText}>Resume Handover</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <AssignedOrderCard order={activeOrder} onStartPicking={handleStartPicking} />
          )
        ) : (
          // No Order
          <View style={styles.searchingContainer}>
            <ActivityIndicator color="#10b981" size="large" />
            <Text style={styles.searchingText}>Searching for order...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
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
  headerLeft: {},
  greeting: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userDetails: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  iconBtn: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  shiftCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  shiftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shiftLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  shiftTime: {
    color: '#10b981',
    fontSize: 24,
    fontWeight: 'bold',
  },
  shiftDetailsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  shiftDetailsText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '500',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  searchingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchingText: {
    color: '#10b981',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  orderCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#10b981',
    alignItems: 'center',
  },
  newBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  newBadgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  orderCardTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  qtyContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  qtyLabel: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 4,
  },
  qtyValue: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  orderId: {
    color: '#9ca3af',
    fontSize: 16,
    marginBottom: 24,
  },
  timerContainer: {
    width: '100%',
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    marginBottom: 32,
    overflow: 'hidden',
  },
  timerBar: {
    flex: 1,
  },
  timerProgress: {
    height: '100%',
    backgroundColor: '#10b981',
  },
  startButton: {
    backgroundColor: '#10b981',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
