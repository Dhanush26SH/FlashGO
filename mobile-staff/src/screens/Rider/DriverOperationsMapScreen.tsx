import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Switch, Platform, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { MapPin, Navigation, ExternalLink, ChevronLeft, AlertTriangle, HelpCircle, User, LogOut } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function DriverOperationsMapScreen() {
  const navigation = useNavigation<any>();
  const { profile, setRole } = useAuth() as any;

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isTesterGeofenceAccount, setIsTesterGeofenceAccount] = useState(false);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [pendingTrip, setPendingTrip] = useState<any>(null);
  
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isAccepting, setIsAccepting] = useState(false);
  const slideAnim = useState(new Animated.Value(300))[0]; // Bottom sheet slide up animation

  const fetchActiveSession = async () => {
    try {
      if (!profile?.id) return;

      const { data: activeSession, error: sessionErr } = await supabase
        .from('driver_sessions')
        .select(`
          id,
          status,
          staff_shifts (
            id,
            status,
            warehouses (
              id,
              name,
              lat,
              lng
            )
          )
        `)
        .eq('driver_id', profile.id)
        .eq('status', 'active')
        .single();

      if (sessionErr) {
        if (sessionErr.code === 'PGRST116') {
          // No active session found
          navigation.reset({ index: 0, routes: [{ name: 'DriverMainTabs' }] });
          return;
        }
        throw sessionErr;
      }

      setSessionData(activeSession);
      
      // We read actual online status from the DB to be authoritative
      const { data: profData } = await supabase
        .from('profiles')
        .select('is_online')
        .eq('id', profile.id)
        .single();
        
      if (profData) {
        setIsOnline(profData.is_online);
      }
      
      const { data: testData } = await supabase.rpc('get_my_dev_test_flags');
      if (testData?.success && testData?.flags?.bypass_geofence) {
        setIsTesterGeofenceAccount(true);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to fetch session.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied.');
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      setLocation(loc);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTrips = async () => {
    if (!profile?.id) return;
    
    try {
      const { data, error } = await supabase.rpc('get_driver_operations_feed');
      if (error) throw error;
      
      if (data && data.success) {
        // Calculate offset: local_time - server_time
        const serverTime = new Date(data.server_now).getTime();
        const localTime = new Date().getTime();
        const offset = localTime - serverTime;
        setServerTimeOffset(offset);

        if (data.active_trip) {
          setActiveTrip(data.active_trip);
          setPendingTrip(null);
          // Hide overlay if any
          Animated.timing(slideAnim, { toValue: 300, duration: 300, useNativeDriver: true }).start();
          
          if (data.active_trip.status === 'accepted') {
            navigation.navigate('DriverPickup');
          } else if (data.active_trip.status === 'in_transit') {
            if (data.active_trip.arrived_at) {
              navigation.navigate('DriverDropOrder');
            } else {
              navigation.navigate('DriverReachDrop');
            }
          } else if (data.active_trip.status === 'completed') {
            if (!data.active_trip.completion_acknowledged_at) {
               navigation.navigate('DriverDeliveryCompleteScreen');
            } else {
               // Check if there is an active return task
               const { data: returnTask } = await supabase
                 .from('driver_return_tasks')
                 .select('id')
                 .eq('driver_id', profile.id)
                 .eq('status', 'required')
                 .maybeSingle();
                 
               if (returnTask) {
                 navigation.navigate('DriverReturnToStoreScreen');
               }
            }
          }
        } else if (data.pending_offer) {
          setActiveTrip(null);
          setPendingTrip(data.pending_offer);
          // Calculate initial remaining
          const expiresAt = new Date(data.pending_offer.offer_expires_at).getTime();
          const trueCurrentTime = new Date().getTime() - offset;
          const remaining = Math.max(0, expiresAt - trueCurrentTime);
          setTimeRemaining(remaining);
          
          if (remaining > 0) {
            Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
          }
        } else {
          // No active trip, no pending offer. Check for return task.
          const { data: returnTask } = await supabase
            .from('driver_return_tasks')
            .select('id')
            .eq('driver_id', profile.id)
            .eq('status', 'required')
            .maybeSingle();
            
          if (returnTask) {
             navigation.navigate('DriverReturnToStoreScreen');
          }
          
          setActiveTrip(null);
          setPendingTrip(null);
          Animated.timing(slideAnim, { toValue: 300, duration: 300, useNativeDriver: true }).start();
        }
      } else {
        // Feed returned ineligible or error
        setActiveTrip(null);
        setPendingTrip(null);
        Animated.timing(slideAnim, { toValue: 300, duration: 300, useNativeDriver: true }).start();
      }
    } catch (err) {
      console.error('Feed error:', err);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (pendingTrip) {
      interval = setInterval(() => {
        const expiresAt = new Date(pendingTrip.offer_expires_at).getTime();
        const trueCurrentTime = new Date().getTime() - serverTimeOffset;
        const remaining = Math.max(0, expiresAt - trueCurrentTime);
        
        setTimeRemaining(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
          Animated.timing(slideAnim, { toValue: 300, duration: 300, useNativeDriver: true }).start(() => {
             setPendingTrip(null);
          });
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [pendingTrip, serverTimeOffset]);

  const handleAcceptOrder = async () => {
    if (isAccepting || !pendingTrip) return;
    setIsAccepting(true);
    try {
      const { data, error } = await supabase.rpc('claim_trip', {
        p_trip_id: pendingTrip.id,
        p_driver_id: profile.id
      });
      if (error) throw error;
      
      // On success, refetch feed to sync active trip
      await fetchTrips();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('EXPIRED_OFFER') || err.message?.includes('already claimed')) {
         Alert.alert('Offer Expired', 'Order no longer available.');
      } else {
         Alert.alert('Failed to accept', err.message);
      }
      // Hide sheet and clear
      Animated.timing(slideAnim, { toValue: 300, duration: 300, useNativeDriver: true }).start(() => {
        setPendingTrip(null);
      });
    } finally {
      setIsAccepting(false);
    }
  };

  useEffect(() => {
    fetchActiveSession();
    fetchLocation();
    
    if (profile?.id) {
      const channel = supabase.channel('driver_status_sync')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
          (payload) => {
            setIsOnline(payload.new.is_online);
          }
        )
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchTrips();
    if (profile?.id) {
      const channel = supabase.channel('operations_trips_feed')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'logistics_trips' },
          () => fetchTrips()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'driver_trip_offers', filter: `driver_id=eq.${profile.id}` },
          () => fetchTrips()
        )
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [profile?.id, isOnline, sessionData]);

  const handleToggleOnline = async (value: boolean) => {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    // Optimistic UI update
    const previousState = isOnline;
    setIsOnline(value);
    
    try {
      const { data, error } = await supabase.rpc('driver_toggle_break_status', {
        p_is_online: value
      });

      if (error) throw error;
      if (!data.success) {
        throw new Error(data.code || 'Failed to update status');
      }
    } catch (err: any) {
      console.error('Toggle Error:', err);
      // Revert on failure
      setIsOnline(previousState);
      
      if (err.message?.includes('ACTIVE_DELIVERY_IN_PROGRESS')) {
        Alert.alert('Cannot go offline', 'You have an active delivery in progress.');
      } else {
        Alert.alert('Status Update Failed', err.message);
      }
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleEndShift = () => {
    Alert.alert(
      'End Shift',
      'Are you sure you want to end your current shift and go offline?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Shift', 
          style: 'destructive',
          onPress: async () => {
            setUpdatingStatus(true);
            try {
              if (!location) throw new Error("Location required to end shift");
              
              const { data, error } = await supabase.rpc('end_driver_shift', {
                p_lat: location.coords.latitude,
                p_lng: location.coords.longitude
              });

              if (error) throw error;
              if (!data.success) {
                throw new Error(data.code || 'Failed to end shift');
              }
              
              navigation.reset({ index: 0, routes: [{ name: 'DriverMainTabs' }] });
            } catch (err: any) {
              console.error('End Shift Error:', err);
              if (err.message?.includes('ACTIVE_DELIVERY_IN_PROGRESS')) {
                Alert.alert('Cannot end shift', 'You have an active delivery in progress.');
              } else {
                Alert.alert('Error', err.message);
              }
            } finally {
              setUpdatingStatus(false);
            }
          }
        }
      ]
    );
  };

  const generateMapHTML = () => {
    if (!location) return '';

    let driverLat = location.coords.latitude;
    let driverLng = location.coords.longitude;
    
    // Fallback if session data isn't ready
    const whLat = sessionData?.staff_shifts?.warehouses?.lat || driverLat;
    const whLng = sessionData?.staff_shifts?.warehouses?.lng || driverLng;
    const hasWarehouse = !!sessionData?.staff_shifts?.warehouses;

    if (isTesterGeofenceAccount && hasWarehouse) {
      driverLat = whLat;
      driverLng = whLng;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
              body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #f3f4f6; }
              #map { width: 100%; height: 100%; }
              .custom-div-icon {
                  background-color: #3b82f6;
                  border: 3px solid #fff;
                  border-radius: 50%;
                  box-shadow: 0 0 10px rgba(0,0,0,0.5);
              }
              .wh-div-icon {
                  background-color: #10b981;
                  border: 3px solid #fff;
                  border-radius: 50%;
                  box-shadow: 0 0 10px rgba(0,0,0,0.5);
              }
          </style>
      </head>
      <body>
          <div id="map"></div>
          <script>
              const map = L.map('map', { zoomControl: false }).setView([${driverLat}, ${driverLng}], 14);
              
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '&copy; OpenStreetMap contributors',
                  maxZoom: 19
              }).addTo(map);

              const driverIcon = L.divIcon({ className: 'custom-div-icon', iconSize: [20, 20], iconAnchor: [10, 10] });

              ${hasWarehouse && isTesterGeofenceAccount ? `
                L.marker([${driverLat}, ${driverLng}], { icon: driverIcon }).addTo(map).bindPopup('You (Test: At ${sessionData.staff_shifts.warehouses.name})').openPopup();
              ` : `
                L.marker([${driverLat}, ${driverLng}], { icon: driverIcon }).addTo(map).bindPopup('You').openPopup();
                ${hasWarehouse ? `
                  const whIcon = L.divIcon({ className: 'wh-div-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
                  L.marker([${whLat}, ${whLng}], { icon: whIcon }).addTo(map).bindPopup('${sessionData.staff_shifts.warehouses.name}');
                ` : ''}
              `}
          </script>
      </body>
      </html>
    `;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Restoring session...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Header Overlay */}
      <View style={styles.header}>
        <View style={styles.onlineBadge}>
          <Text style={styles.onlineText}>{isOnline ? 'Online' : 'Offline / On Break'}</Text>
          <Switch 
            value={isOnline} 
            onValueChange={handleToggleOnline}
            disabled={updatingStatus}
            trackColor={{ false: '#3f3f46', true: '#10b981' }}
            thumbColor={'#ffffff'}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconCircle} onPress={handleEndShift} disabled={updatingStatus}>
            <LogOut color="#ef4444" size={16} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconCircle}>
            <AlertTriangle color="#f59e0b" size={16} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconCircle}>
            <HelpCircle color="#9ca3af" size={16} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileCircle} onPress={() => navigation.navigate('Profile')}>
            <User color="#fff" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        {!location && !errorMsg && (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.loadingText}>Locating you...</Text>
          </View>
        )}
        
        {errorMsg ? (
          <View style={styles.mapPlaceholder}>
            <AlertTriangle color="#ef4444" size={32} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : location ? (
          <WebView
            style={styles.map}
            source={{ html: generateMapHTML() }}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        ) : null}
      </View>

      {/* Bottom Store Card */}
      <View style={styles.bottomCard}>
        <View style={styles.cardHeader}>
          <View style={styles.storeIconBg}>
            <MapPin color="#3b82f6" size={24} />
          </View>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>
              {sessionData?.staff_shifts?.warehouses?.name || 'FlashGO Store'}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: isOnline ? '#10b981' : '#f59e0b' }]} />
              <Text style={styles.statusText}>Checked in • {isOnline ? 'Online' : 'On Break'}</Text>
            </View>
          </View>
        </View>
        
        {isOnline ? (
          <View style={styles.waitingState}>
            <ActivityIndicator size="small" color="#10b981" style={{marginRight: 8}} />
            <Text style={styles.waitingText}>Waiting for trips...</Text>
          </View>
        ) : (
          <View style={styles.waitingState}>
            <Text style={[styles.waitingText, { color: '#f59e0b' }]}>You are currently on break. Go online to receive trips.</Text>
          </View>
        )}
    </View>

      {/* Trips Overlay */}
      <View style={styles.tripsOverlay} pointerEvents="box-none">
        {activeTrip ? (
          <TouchableOpacity style={[styles.tripBanner, { backgroundColor: '#3b82f6' }]} onPress={() => navigation.navigate('RiderDashboard', { tripId: activeTrip.id })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.tripIconBg}>
                 <Text style={{fontSize: 16}}>🚀</Text>
              </View>
              <View>
                <Text style={styles.tripTitle}>Active Trip ({activeTrip.status.toUpperCase()})</Text>
                <Text style={styles.tripStore}>View Route & Details</Text>
              </View>
            </View>
            <ChevronLeft color="#ffffff" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        ) : pendingTrip ? (
          <Animated.View style={[styles.offerSheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.offerHeader}>
              <Text style={styles.offerNewText}>New order</Text>
              
              <View style={styles.timerContainer}>
                <Svg width="80" height="80" viewBox="0 0 100 100">
                  {/* Background Circle */}
                  <Circle cx="50" cy="50" r="45" stroke="#27272a" strokeWidth="6" fill="transparent" />
                  {/* Progress Circle */}
                  <Circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="#10b981"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray="282.74"
                    strokeDashoffset={282.74 - (Math.max(0, timeRemaining) / 60000) * 282.74}
                    strokeLinecap="round"
                    rotation="-90"
                    origin="50, 50"
                  />
                </Svg>
                <View style={styles.timerTextContainer}>
                  <Text style={styles.timerText}>{Math.ceil(Math.max(0, timeRemaining) / 1000)}s</Text>
                </View>
              </View>

              <Text style={styles.offerOrderId}>ORDER ID</Text>
              <Text style={styles.offerOrderIdValue}>{pendingTrip.order_number || pendingTrip.order_id?.slice(0,8).toUpperCase()}</Text>
            </View>
            
            <View style={styles.offerDetails}>
              <View style={styles.offerDetailRow}>
                 <User color="#9ca3af" size={16} style={{marginRight: 12}} />
                 <View>
                   <Text style={styles.offerDetailLabel}>Picker</Text>
                   <Text style={styles.offerDetailValue}>{pendingTrip.picker_name}</Text>
                 </View>
              </View>
              
              <View style={styles.offerDetailRow}>
                 <MapPin color="#9ca3af" size={16} style={{marginRight: 12}} />
                 <View>
                   <Text style={styles.offerDetailLabel}>Pickup</Text>
                   <Text style={styles.offerDetailValue}>{pendingTrip.warehouse_name}</Text>
                   <Text style={styles.offerDetailSub}>{pendingTrip.warehouse_address}</Text>
                 </View>
              </View>
            </View>
            
            <TouchableOpacity 
              style={[styles.acceptBtn, isAccepting && {opacity: 0.7}]} 
              onPress={handleAcceptOrder}
              disabled={isAccepting}
            >
              {isAccepting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.acceptBtnText}>Accept order →</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tripsOverlay: {
    position: 'absolute',
    bottom: 20, 
    left: 16,
    right: 16,
    zIndex: 30,
    justifyContent: 'flex-end',
  },
  offerSheet: {
    backgroundColor: '#18181b',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#27272a',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  offerHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  offerNewText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  timerContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  timerTextContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: {
    color: '#10b981',
    fontSize: 24,
    fontWeight: 'bold',
  },
  offerOrderId: {
    color: '#9ca3af',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
  },
  offerOrderIdValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  offerDetails: {
    backgroundColor: '#0f0f11',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 16,
  },
  offerDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offerDetailLabel: {
    color: '#9ca3af',
    fontSize: 12,
  },
  offerDetailValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  offerDetailSub: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  acceptBtn: {
    backgroundColor: '#10b981',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  tripBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  tripIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  tripStore: { color: '#f3f4f6', fontSize: 12, marginTop: 2 },
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9ca3af', marginTop: 12, fontSize: 16 },
  errorText: { color: '#ef4444', marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(24, 24, 27, 0.9)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  onlineText: { color: '#fff', fontSize: 14, fontWeight: '600', marginRight: 4 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(24, 24, 27, 0.9)',
    borderWidth: 1,
    borderColor: '#3f3f46',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#171717',
  },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#171717',
  },
  bottomCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  storeIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  storeInfo: { flex: 1 },
  storeName: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { color: '#9ca3af', fontSize: 14 },
  waitingState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
    paddingVertical: 12,
    borderRadius: 8,
  },
  waitingText: { color: '#10b981', fontSize: 15, fontWeight: '600' }
});
