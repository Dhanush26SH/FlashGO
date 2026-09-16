import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Alert, AppState, AppStateStatus } from 'react-native';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { Bell, ArrowRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function PickerDashboard() {
  const renderCount = useRef(0);
  renderCount.current += 1;
  const navigation = useNavigation<any>();
  const { profile } = useAuth() as any;
  const isFocused = useIsFocused();

  const [isOnline, setIsOnline] = useState(profile?.is_online || false);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [shiftDetails, setShiftDetails] = useState<any>(null);
  const [earningsData, setEarningsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [currentTime, setCurrentTime] = useState(new Date().getTime());
  const [activeTimeStr, setActiveTimeStr] = useState('0h 0m');
  
  const soundRef = useRef<Audio.Sound | null>(null);
  const notifiedOrders = useRef<Set<string>>(new Set());
  const expiryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const incentivesChannelRef = useRef<any>(null);
  const isExpiringRef = useRef(false);

  // Update current time every 1s for the SLA Timer & Next Slot button ONLY when focused
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => {
        setCurrentTime(new Date().getTime());
      }, 1000);
      return () => clearInterval(interval);
    }, [])
  );

  // Live active time ticker — capped at shift_end
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (shiftDetails?.status === 'active' && isOnline && shiftDetails?.started_at) {
      const updateActiveTime = () => {
        const start = new Date(shiftDetails.started_at).getTime();
        const shiftEnd = new Date(shiftDetails.shift_end).getTime();
        // effectiveEnd = min(now, shift_end) — never accrue time past the slot boundary
        const effectiveEnd = Math.min(new Date().getTime(), shiftEnd);
        const diffMins = Math.floor(Math.max(0, effectiveEnd - start) / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        setActiveTimeStr(`${hours}h ${mins}m`);
      };
      updateActiveTime();
      interval = setInterval(updateActiveTime, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [shiftDetails, isOnline]);

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
          id, status, picker_assigned_at,
          order_items(quantity, status)
        `)
        .eq('picker_id', profile.id)
        .in('status', ['placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data && ['placed', 'picking'].includes(data.status)) {
        if (!notifiedOrders.current.has(data.id)) {
          notifiedOrders.current.add(data.id);
          if (isRealtime) {
            playNewOrderSound();
          }
        }
      }

      console.log('SET_ACTIVE_ORDER', data?.id);
      setActiveOrder(data);
    } catch (err) {
      console.error("Fetch Active Order Error:", err);
    } finally {
      console.log('SET_LOADING', false);
      setLoading(false);
    }
  };

  // 3. Toggle Online
  const toggleOnlineStatus = async (value: boolean) => {
    console.log('SET_IS_ONLINE', value);
    setIsOnline(value);
    if (profile?.id) {
      try {
        const { data, error } = await supabase.rpc('picker_toggle_online', { p_is_online: value });
        if (error) throw error;
        if (data && data.success === false) {
          throw new Error(data.code || 'Failed to update online status');
        }
      } catch (e: any) {
        console.log('SET_IS_ONLINE', !value);
        setIsOnline(!value);
        Alert.alert("Update Failed", e.message || "Failed to update online status");
      }
    }
  };

  // 4a. Perform server-authoritative shift expiry (called when shift_end has passed)
  const performShiftExpiry = useCallback(async (staleShift?: any) => {
    if (isExpiringRef.current) return;
    isExpiringRef.current = true;

    // Clear any pending timer
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    
    if (staleShift) {
      console.log('STALE_ACTIVE_SHIFT', {
        id: staleShift.id,
        status: staleShift.status,
        shift_start: staleShift.shift_start,
        shift_end: staleShift.shift_end,
        now: new Date().toISOString(),
      });
    }

    try {
      console.log('PICKER_EXPIRE_RPC_BEFORE');

      const { data, error } = await supabase.rpc('picker_expire_shift');

      console.log('PICKER_EXPIRE_RPC_AFTER', {
        data,
        error,
      });

      if (error) {
        console.error('PICKER_EXPIRE_RPC_ERROR', error);
      }
    } catch (e) {
      console.error('PICKER_EXPIRE_RPC_THROWN', e);
    } finally {
      isExpiringRef.current = false;
    }
    // Do NOT automatically recursively call fetchShiftAndStatus here!
    // It creates an infinite loop if the RPC fails or doesn't clear the active state.
  }, [profile?.id]);

  // 4b. Schedule a one-shot timer to fire exactly at shift_end
  const scheduleExpiryTimer = useCallback((shiftEndIso: string) => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    const msUntilExpiry = new Date(shiftEndIso).getTime() - Date.now();
    if (msUntilExpiry <= 0) return; // Already expired — caller should have handled it
    expiryTimerRef.current = setTimeout(() => {
      performShiftExpiry();
    }, msUntilExpiry);
  }, [performShiftExpiry]);

  // 4c. Fetch Shift & Online Status
  const fetchShiftAndStatus = useCallback(async () => {
    console.log('LOAD_PICKER_DATA_ENTERED');
    if (!profile?.id) {
      console.log('FOCUS_EARLY_RETURN_REASON', '!profile?.id');
      return;
    }
    
    // Fetch authoritative online status from DB (context is often stale after navigation)
    const { data: dbProfile } = await supabase
      .from('profiles')
      .select('is_online')
      .eq('id', profile.id)
      .single();
      
    const currentIsOnline = dbProfile?.is_online ?? false;
    console.log('SET_IS_ONLINE', currentIsOnline);
    setIsOnline(currentIsOnline);

    // First try to find an active shift
    const { data: activeData } = await supabase
      .from('staff_shifts')
      .select(`
        id, shift_start, shift_end, status, started_at, items_picked, earnings, complaints, 
        work_slot_id, 
        warehouses(name),
        work_slots(picker_incentive_enabled, work_slot_picker_incentives(target_items, reward_amount, sort_order))
      `)
      .eq('staff_id', profile.id)
      .eq('status', 'active')
      .maybeSingle();
      
    if (activeData) {
      const shiftEndTime = new Date(activeData.shift_end).getTime();
      const now = Date.now();

      if (now >= shiftEndTime) {
        console.log('FOCUS_EARLY_RETURN_REASON', 'now >= shiftEndTime for active shift (initiating expiry)');
        // Shift is already expired in wall-clock time but DB may not have reconciled yet.
        // Break the infinite loop by expiring but NOT automatically re-fetching in a loop.
        console.log('SET_SHIFT_DETAILS', null);
        setShiftDetails(null);
        await performShiftExpiry(activeData);
        return; // Stops here for this render cycle. User can pull-to-refresh or navigation handles it.
      } else {
        console.log('FOCUS_EARLY_RETURN_REASON', 'active shift is valid');
        console.log('SET_SHIFT_DETAILS', activeData?.id);
        setShiftDetails(activeData);
        
        // Fetch earnings authoritatively
        const { data: eData } = await supabase.rpc('calculate_picker_shift_earnings', { p_shift_id: activeData.id });
        if (eData?.success) {
           setEarningsData(eData);
        }

        // Schedule the expiry timer precisely
        scheduleExpiryTimer(activeData.shift_end);
      }
    } else {
      // Clear any stale expiry timer
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }

      const nowIso = new Date().toISOString();
      
      console.log('PICKER_AUTH_CONTEXT', {
        profileId: profile?.id,
        profileRole: profile?.role,
      });

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      console.log('PICKER_SESSION', {
        userId: sessionData?.session?.user?.id,
        sessionError,
      });

      console.log('PICKER_SHIFT_QUERY_START');

      const { data: nextData, error: nextError } = await supabase
        .from('staff_shifts')
        .select(`
          id, shift_start, shift_end, status, started_at, items_picked, earnings, complaints, 
          work_slot_id, 
          warehouses(name),
          work_slots(picker_incentive_enabled, work_slot_picker_incentives(target_items, reward_amount, sort_order))
        `)
        .eq('staff_id', profile.id)
        .eq('status', 'scheduled')
        .gt('shift_end', nowIso)
        .order('shift_start', { ascending: true })
        .limit(1)
        .maybeSingle();

      console.log('PICKER_SHIFT_QUERY_RESULT', {
        data: nextData,
        error: nextError,
      });

      console.log('--- RUNTIME INSTRUMENTATION ---');
      console.log('session.user.id:', sessionData?.session?.user?.id || 'NO_SESSION');
      console.log('profile.id:', profile?.id);
      console.log('nowIso:', nowIso);
      console.log('query data:', nextData);
      console.log('query error:', nextError);
      console.log('selected shift:', nextData || null);

      if (nextError) console.error("Error fetching next shift:", nextError);

      console.log('SET_SHIFT_DETAILS', nextData?.id || null);
      setShiftDetails(nextData || null);

      // Reconcile: if picker is online in DB but has no active shift, force them offline securely.
      if (currentIsOnline) {
         try {
           await supabase.rpc('picker_toggle_online', { p_is_online: false });
           console.log('SET_IS_ONLINE', false);
           setIsOnline(false);
         } catch(e) {
           console.error("Failed to force offline on reconciliation", e);
         }
      }
    }
  }, [profile?.id, performShiftExpiry, scheduleExpiryTimer]);

  // Focus-based refresh
  useFocusEffect(
    useCallback(() => {
      console.log('PICKER_TASK_FOCUS_EFFECT_ENTERED');
      console.log('FOCUS_STEP_1', {
        profileExists: !!profile,
        profileId: profile?.id,
        profileRole: profile?.role,
      });
      console.log('FOCUS_CALLING_LOAD');
      fetchShiftAndStatus();
      fetchActiveOrder();
    }, [fetchShiftAndStatus])
  );

  // AppState: handle foreground re-entry (app backgrounded while shift active)
  useEffect(() => {
    let activeRefetchTimer: ReturnType<typeof setTimeout>;
    
    // Cleanup previous channel instance synchronously on remount
    if (incentivesChannelRef.current) {
      supabase.removeChannel(incentivesChannelRef.current);
      incentivesChannelRef.current = null;
    }
    
    // Generate globally unique channel name for this exact mount cycle
    const uniqueChannelName = `picker_incentives_sync_${profile?.id || 'anon'}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(uniqueChannelName);
    incentivesChannelRef.current = channel;

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_slot_picker_incentives' }, () => {
        // Debounce refetch to avoid multiple calls if many rows update
        clearTimeout(activeRefetchTimer);
        activeRefetchTimer = setTimeout(fetchShiftAndStatus, 1000);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'work_slots' }, () => {
        clearTimeout(activeRefetchTimer);
        activeRefetchTimer = setTimeout(fetchShiftAndStatus, 1000);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'staff_shifts', filter: `staff_id=eq.${profile?.id}` }, () => {
        clearTimeout(activeRefetchTimer);
        activeRefetchTimer = setTimeout(fetchShiftAndStatus, 1000);
      })
      .subscribe();
      
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      console.log('APPSTATE_EVENT', nextState);
      if (nextState === 'active') {
        fetchShiftAndStatus();
      }
    });
    return () => {
      subscription.remove();
      if (incentivesChannelRef.current) {
        supabase.removeChannel(incentivesChannelRef.current);
        incentivesChannelRef.current = null;
      }
      clearTimeout(activeRefetchTimer);
    };
  }, [fetchShiftAndStatus]);

  // Cleanup expiry timer on unmount
  useEffect(() => {
    return () => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
      }
    };
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!profile?.id) return;
    const channelName = `picker_active_orders_${profile.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(channelName)
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

  const handleStartPicking = async () => {
    if (!activeOrder) return;
    
    // Check if the order is already in a state that should bypass picking
    if (activeOrder.status === 'picking') {
      navigation.navigate('Picking', { orderId: activeOrder.id });
      return;
    }
    
    // Handover flow routing
    if (['waiting_for_packing', 'packing', 'packed', 'staged'].includes(activeOrder.status)) {
       navigation.navigate('HandoverToDriver', { orderId: activeOrder.id });
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

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const dayStr = d.toLocaleDateString('en-GB', { weekday: 'long' });
    return `${dateStr}, ${dayStr}`;
  };

  const formatTimeRange = (startIso: string, endIso: string) => {
    const start = new Date(startIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const end = new Date(endIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${start} - ${end}`;
  };

  const renderNextSlotButton = () => {
    if (!shiftDetails) {
      return (
        <View>
          <Text style={styles.nextSlotWarehouse}>No booked slot</Text>
          <Text style={styles.nextSlotDate}>Book a slot to start working</Text>
          <TouchableOpacity 
            style={styles.nextSlotButton}
            onPress={() => navigation.navigate('Slots')}
          >
            <Text style={styles.nextSlotButtonText}>Book now</Text>
            <ArrowRight size={16} color="#10b981" />
          </TouchableOpacity>
        </View>
      );
    }

    const start = new Date(shiftDetails.shift_start).getTime();
    const end = new Date(shiftDetails.shift_end).getTime();
    const fiveMinsBefore = start - 5 * 60000;
    const canStart = currentTime >= fiveMinsBefore && currentTime < end;

    return (
      <View>
        <Text style={styles.nextSlotWarehouse}>{shiftDetails.warehouses?.name || 'FlashGO Store'}</Text>
        <Text style={styles.nextSlotDate}>{formatDate(shiftDetails.shift_start)}</Text>
        <Text style={styles.nextSlotTime}>{formatTimeRange(shiftDetails.shift_start, shiftDetails.shift_end)}</Text>
        
        {canStart ? (
          <TouchableOpacity 
            style={[styles.nextSlotButton, { backgroundColor: '#10b981', borderColor: '#059669' }]}
            onPress={() => navigation.navigate('WarehouseQRVerification', { shiftId: shiftDetails.id })}
          >
            <Text style={[styles.nextSlotButtonText, { color: '#ffffff' }]}>Start shift</Text>
            <ArrowRight size={16} color="#ffffff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.nextSlotButton}
            onPress={() => navigation.navigate('Slots', { screen: 'Booked' })}
          >
            <Text style={styles.nextSlotButtonText}>View slot</Text>
            <ArrowRight size={16} color="#10b981" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderOrderPickingCard = () => {
    // Calculate total quantity
    const totalQty = activeOrder.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) || 0;
    const qtyStr = totalQty < 10 ? `0${totalQty}` : `${totalQty}`;

    // SLA Timer Logic
    const slaMs = totalQty * 12 * 1000;
    const targetTime = activeOrder.picker_assigned_at ? new Date(activeOrder.picker_assigned_at).getTime() + slaMs : 0;
    const remainingMs = Math.max(0, targetTime - currentTime);
    const m = Math.floor(remainingMs / 60000);
    const s = Math.floor((remainingMs % 60000) / 1000);
    const mStr = activeOrder.picker_assigned_at && totalQty > 0 ? (m < 10 ? `0${m}` : `${m}`) : '00';
    const sStr = activeOrder.picker_assigned_at && totalQty > 0 ? (s < 10 ? `0${s}` : `${s}`) : '00';
    
    return (
      <View style={[styles.dashboardCard, { padding: 0 }]}>
        <View style={styles.orderCard}>
          <View style={styles.orderCardHeader}>
            <Text style={styles.orderCardTitle}>🛍 Order Picking</Text>
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>IN WORK / NEW ORDER</Text>
            </View>
          </View>

          <View style={styles.orderMetricsRow}>
            <View style={styles.orderMetricCol}>
              <Text style={styles.orderMetricLabel}>Order ID</Text>
              <Text style={styles.orderMetricValue}>#{activeOrder.id.substring(0,8).toUpperCase()}</Text>
            </View>
            
            <View style={styles.orderMetricColCenter}>
              <Text style={styles.orderMetricLabel}>Quantity</Text>
              <Text style={styles.quantityValue}>{qtyStr}</Text>
            </View>

            <View style={styles.orderMetricColRight}>
              <Text style={styles.orderMetricLabelCenter}>{mStr} : {sStr}</Text>
              <View style={styles.timerSubLabels}>
                <Text style={styles.timerSubLabel}>MIN</Text>
                <Text style={styles.timerSubLabel}>SEC</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.startPickingBtn} onPress={handleStartPicking}>
            <Text style={styles.startPickingBtnText}>Start Picking</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderOnlineDashboard = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hi, {profile?.full_name || 'Picker'}</Text>
          <Text style={styles.userDetails}>
            ID: {profile?.id?.substring(0, 8).toUpperCase() || '----'}
          </Text>
          <Text style={styles.warehouseDetails}>{shiftDetails?.warehouses?.name}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.toggleContainer}>
            <Text style={[styles.toggleText, { color: '#10b981' }]}>ONLINE / ACTIVE</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn}>
            <Bell size={24} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Current Work Area or Order Card */}
      {activeOrder && activeOrder.status === 'placed' ? (
        renderOrderPickingCard()
      ) : (
        <View style={styles.dashboardCard}>
          <Text style={styles.dashboardCardTitle}>Current work area</Text>
          {activeOrder ? (
            <View style={styles.activeTaskBox}>
              <Text style={styles.activeTaskText}>Assigned Order #{activeOrder.id.substring(0,8).toUpperCase()}</Text>
              <Text style={styles.activeTaskSub}>Status: {activeOrder.status}</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleStartPicking}>
                <Text style={styles.primaryButtonText}>Resume Task</Text>
              </TouchableOpacity>
            </View>
          ) : (
             <View style={styles.searchingBox}>
               <ActivityIndicator size="small" color="#10b981" style={{ marginRight: 8 }} />
               <Text style={styles.searchingText}>Searching for order...</Text>
             </View>
          )}
        </View>
      )}

      {/* Active Time */}
      <View style={styles.dashboardCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
           <Text style={styles.dashboardCardTitle}>Active Time</Text>
           <Text style={styles.activeTimeText}>{activeTimeStr}</Text>
        </View>
      </View>

      {/* Slot Details */}
      <View style={styles.dashboardCard}>
        <Text style={styles.dashboardCardTitle}>Slot details</Text>
        <Text style={styles.slotDetailsText}>
           {formatTimeRange(shiftDetails.shift_start, shiftDetails.shift_end)}
        </Text>

        <View style={styles.metricsContainer}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Earnings</Text>
            <Text style={styles.metricValue}>₹{earningsData?.base_earnings ?? (shiftDetails.earnings || 0)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Items picked</Text>
            <Text style={styles.metricValue}>{earningsData?.items_picked ?? (shiftDetails.items_picked || 0)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Complaints</Text>
            <Text style={styles.metricValue}>{shiftDetails.complaints || 0}</Text>
          </View>
        </View>
      </View>

      {/* Incentive Section */}
      {shiftDetails?.work_slots?.picker_incentive_enabled && (
        <View style={styles.dashboardCard}>
          <Text style={styles.dashboardCardTitle}>Incentive progress</Text>
          
          {(!shiftDetails.work_slots.work_slot_picker_incentives || shiftDetails.work_slots.work_slot_picker_incentives.length === 0) ? (
            <Text style={styles.emptyIncentiveText}>No incentive configured for this slot.</Text>
          ) : (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
                {shiftDetails.work_slots.work_slot_picker_incentives
                  .sort((a: any, b: any) => a.sort_order - b.sort_order)
                  .map((inc: any, i: number) => (
                    <Text key={`reward-${i}`} style={{ fontSize: 13, fontWeight: 'bold', color: '#10b981', textAlign: 'center', flex: 1 }}>
                      ₹{inc.reward_amount}
                    </Text>
                ))}
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                {shiftDetails.work_slots.work_slot_picker_incentives
                  .sort((a: any, b: any) => a.sort_order - b.sort_order)
                  .map((inc: any, i: number, arr: any[]) => {
                    const isAchieved = (shiftDetails.items_picked || 0) >= inc.target_items;
                    const isLast = i === arr.length - 1;
                    return (
                      <React.Fragment key={`dot-${i}`}>
                        <View style={{ 
                          width: 14, height: 14, borderRadius: 7, 
                          backgroundColor: isAchieved ? '#10b981' : '#d1d5db',
                          borderWidth: 2, borderColor: '#fff',
                          zIndex: 2
                        }} />
                        {!isLast && (
                          <View style={{ 
                            flex: 1, height: 3, 
                            backgroundColor: ((shiftDetails.items_picked || 0) >= arr[i+1].target_items) ? '#10b981' : '#e5e7eb',
                            marginHorizontal: -2,
                            zIndex: 1
                          }} />
                        )}
                      </React.Fragment>
                    );
                })}
              </View>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 }}>
                {shiftDetails.work_slots.work_slot_picker_incentives
                  .sort((a: any, b: any) => a.sort_order - b.sort_order)
                  .map((inc: any, i: number) => (
                    <Text key={`target-${i}`} style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', flex: 1 }}>
                      {inc.target_items}
                    </Text>
                ))}
              </View>
              
              <Text style={{ marginTop: 16, fontSize: 13, color: '#374151', textAlign: 'center', fontWeight: '500' }}>
                Items picked: {shiftDetails.items_picked || 0}
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );

  const renderNormalDashboard = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hi, {profile?.full_name || 'Picker'}</Text>
          <Text style={styles.userDetails}>
            ID: {profile?.id?.substring(0, 8).toUpperCase() || '----'}
          </Text>
          {shiftDetails?.warehouses?.name && (
            <Text style={styles.warehouseDetails}>{shiftDetails.warehouses.name}</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={styles.toggleContainer}>
            <Text style={styles.toggleText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
            <Switch
              trackColor={{ false: '#d1d5db', true: '#10b981' }}
              thumbColor={'#ffffff'}
              onValueChange={toggleOnlineStatus}
              value={isOnline}
            />
          </View>
          <TouchableOpacity style={styles.iconBtn}>
            <Bell size={24} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Next Slot Section */}
      <View style={styles.nextSlotContainer}>
        <Text style={styles.nextSlotHeader}>Next slot</Text>
        <View style={styles.nextSlotCard}>
          {renderNextSlotButton()}
        </View>
      </View>

      {/* General Cards */}
      <View style={styles.cardsContainer}>
        {/* Card 1 — Full-time work */}
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Full-time work</Text>
            <Text style={styles.cardSubtitle}>Explore full-time warehouse opportunities</Text>
          </View>
          <TouchableOpacity style={styles.cardButton}>
            <Text style={styles.cardButtonText}>View opportunities</Text>
            <ArrowRight size={16} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Card 2 — Book a slot */}
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Book a slot</Text>
            <Text style={styles.cardSubtitle}>Choose a work slot at your assigned FlashGO store</Text>
          </View>
          <TouchableOpacity 
            style={styles.cardButton}
            onPress={() => navigation.navigate('Slots')}
          >
            <Text style={styles.cardButtonText}>Book now</Text>
            <ArrowRight size={16} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  // Derive whether the online dashboard should be shown.
  // Both conditions must be true:
  //   1. profile.is_online === true (authoritative, re-fetched on focus)
  //   2. There is an active shift whose end_time has NOT yet passed
  const shiftIsCurrentlyValid =
    shiftDetails?.status === 'active' &&
    new Date(shiftDetails.shift_end).getTime() > Date.now();

  return (
    <SafeAreaView style={styles.container}>
      {(shiftIsCurrentlyValid && isOnline) ? renderOnlineDashboard() : renderNormalDashboard()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6', // Clean light-grey background
  },
  scrollContent: {
    padding: 16,
  },
  nextSlotContainer: {
    marginBottom: 24,
  },
  nextSlotHeader: {
    color: '#111827',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  nextSlotCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  nextSlotWarehouse: {
    color: '#111827',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  nextSlotDate: {
    color: '#4b5563',
    fontSize: 15,
    marginBottom: 4,
  },
  nextSlotTime: {
    color: '#6b7280',
    fontSize: 15,
    marginBottom: 16,
  },
  nextSlotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ecfdf5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1fae5',
    alignSelf: 'flex-start',
  },
  nextSlotButtonText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    color: '#111827',
    fontSize: 22,
    fontWeight: 'bold',
  },
  userDetails: {
    color: '#4b5563',
    fontSize: 14,
    marginTop: 4,
  },
  warehouseDetails: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  iconBtn: {
    padding: 6,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardContent: {
    marginBottom: 20,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  cardSubtitle: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  cardButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  // Online Dashboard Styles
  dashboardCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  dashboardCardTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  activeTimeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
  },
  slotDetailsText: {
    fontSize: 15,
    color: '#4b5563',
    marginBottom: 20,
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 16,
  },
  metricBox: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  emptyIncentiveText: {
    color: '#9ca3af',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
  },
  searchingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  searchingText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '500',
  },
  activeTaskBox: {
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  activeTaskText: {
    color: '#166534',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  activeTaskSub: {
    color: '#15803d',
    fontSize: 14,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  
  // NEW ORDER CARD STYLES
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fafafa',
  },
  orderCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  badgeContainer: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: 'bold',
  },
  orderMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  orderMetricCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  orderMetricColCenter: {
    flex: 1,
    alignItems: 'center',
  },
  orderMetricColRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  orderMetricLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  orderMetricLabelCenter: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  orderMetricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  quantityValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
  },
  timerSubLabels: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingRight: 4,
  },
  timerSubLabel: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: 'bold',
    width: 24,
    textAlign: 'center',
  },
  startPickingBtn: {
    backgroundColor: '#10b981',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  startPickingBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
