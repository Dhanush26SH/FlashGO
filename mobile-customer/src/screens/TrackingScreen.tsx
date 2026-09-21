import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { MapPin, Bike, CheckCircle2, Clock, PhoneCall, ChevronLeft, ShieldAlert, CreditCard, XCircle, Banknote, Box, Package } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

export default function TrackingScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { orderId } = route?.params || { orderId: null };
  const webViewRef = useRef<WebView>(null);

  const [order, setOrder] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{lat: number, lng: number} | null>(null);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [warehouseLocation, setWarehouseLocation] = useState<{lat: number, lng: number} | null>(null);
  const [customerLocation, setCustomerLocation] = useState<{lat: number, lng: number} | null>(null);
  const [deliveryOtp, setDeliveryOtp] = useState<string | null>(null);

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const driverChannelRef = useRef<any>(null);
  const subscribedDriverIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    fetchOrderDetails();

    const orderSub = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
        setOrder(payload.new);
        if (payload.new.driver_id && ['staged', 'handed_off', 'out_for_delivery'].includes(payload.new.status) && !driverLocation) {
          fetchDriverInfo(payload.new.driver_id);
          fetchDriverLocation(payload.new.driver_id);
          subscribeDriver(payload.new.driver_id);
        }
        if (payload.new.status === 'out_for_delivery' && payload.new.total_amount > 1000) {
           // Allow trigger to insert notification
           setTimeout(async () => {
              const otp = await fetchOrderOtpFromNotification(orderId);
              setDeliveryOtp(otp);
           }, 1000);
        }
        if (payload.new.status === 'delivered') {
           if (driverChannelRef.current) {
             supabase.removeChannel(driverChannelRef.current);
             driverChannelRef.current = null;
             subscribedDriverIdRef.current = null;
           }
           setDeliveryOtp(null);
        }
      })
      .subscribe();

    return () => {
      orderSub.unsubscribe();
      if (driverChannelRef.current) {
        supabase.removeChannel(driverChannelRef.current);
        driverChannelRef.current = null;
        subscribedDriverIdRef.current = null;
      }
    };
  }, [orderId]);

  const fetchOrderOtpFromNotification = async (id: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('message')
      .eq('entity_id', id)
      .eq('type', 'DELIVERY_OTP')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data && data.message) {
      const match = data.message.match(/is (\d{6})/);
      if (match) return match[1];
    }
    return null;
  };

  const fetchOrderDetails = async () => {
    const { data: orderData } = await supabase.from('orders')
      .select('*, delivery_address, total_amount, payment_status, payment_method, warehouse_id')
      .eq('id', orderId)
      .single();

    if (orderData) {
      setOrder(orderData);
      
      const lat = Number(orderData.delivery_lat);
      const lng = Number(orderData.delivery_lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setCustomerLocation({ lat, lng });
      } else {
        console.warn('Invalid customer delivery coordinates on order');
      }

      if (orderData.warehouse_id) {
        const { data: ctx } = await supabase.rpc('customer_get_order_tracking_context', { p_order_id: orderId });
        if (ctx && ctx.length > 0) {
          const wh = ctx[0];
          if (wh.warehouse_lat && wh.warehouse_lng) {
            setWarehouseLocation({ lat: wh.warehouse_lat, lng: wh.warehouse_lng });
          }
        }
      }

      if (['out_for_delivery'].includes(orderData.status) && orderData.total_amount > 1000) {
        const otp = await fetchOrderOtpFromNotification(orderId);
        setDeliveryOtp(otp);
      }

      if (orderData.driver_id) {
        fetchDriverInfo(orderData.driver_id);
        if (['out_for_delivery', 'handed_off', 'staged'].includes(orderData.status)) {
          fetchDriverLocation(orderData.driver_id);
          subscribeDriver(orderData.driver_id);
        }
      }
    }
  };

  const fetchDriverInfo = async (driverId: string) => {
    const { data } = await supabase.from('profiles').select('full_name, phone').eq('id', driverId).maybeSingle();
    if (data) setDriverInfo(data);
  };

  const fetchDriverLocation = async (driverId: string) => {
    console.log('[TRACKING] fetchDriverLocation called for driverId:', driverId);
    const { data, error } = await supabase.from('driver_sessions')
      .select('latest_lat, latest_lng')
      .eq('driver_id', driverId)
      .eq('status', 'active')
      .maybeSingle();
      
    console.log('[TRACKING] initial SELECT result:', { data, error });
    if (data && data.latest_lat && data.latest_lng) {
      setDriverLocation({ lat: data.latest_lat, lng: data.latest_lng });
    }
  };

  const subscribeDriver = (driverId: string | null) => {
    console.log('[TRACKING] Setting up subscription for driverId:', driverId);
    if (!driverId) {
      if (driverChannelRef.current) {
        supabase.removeChannel(driverChannelRef.current);
        driverChannelRef.current = null;
        subscribedDriverIdRef.current = null;
      }
      return;
    }

    if (driverId === subscribedDriverIdRef.current) {
      return;
    }

    if (driverChannelRef.current) {
      supabase.removeChannel(driverChannelRef.current);
      driverChannelRef.current = null;
      subscribedDriverIdRef.current = null;
    }

    const channelName = `driver-${driverId}`;
    console.log('[TRACKING] Channel name:', channelName);
    const filter = `driver_id=eq.${driverId}`;
    console.log('[TRACKING] postgres_changes filter:', filter);

    const channel = supabase.channel(channelName);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'driver_sessions', filter }, (payload) => {
        console.log('[TRACKING] Received EVENT:', payload.eventType, 'payload:', payload);
        const newData = payload.new as any;
        if (newData.latest_lat && newData.latest_lng) {
          console.log('[TRACKING] Valid coords received, updating map to', newData.latest_lat, newData.latest_lng);
          setDriverLocation({ lat: newData.latest_lat, lng: newData.latest_lng });
          // Update webview map if available
          const js = `updateDriverLocation(${newData.latest_lat}, ${newData.latest_lng}); true;`;
          console.log('[TRACKING] Injecting JS:', js);
          webViewRef.current?.injectJavaScript(js);
        } else {
          console.log('[TRACKING] Coordinates missing in payload.new');
        }
    });
    
    channel.subscribe((status) => {
        console.log('[TRACKING] Subscription status:', status);
    });
    driverChannelRef.current = channel;
    subscribedDriverIdRef.current = driverId;

    // Temporary diagnostic subscription without filter
    const channelNoFilter = supabase.channel(`driver-no-filter-${driverId}`);
    channelNoFilter.on('postgres_changes', { event: '*', schema: 'public', table: 'driver_sessions' }, (payload) => {
        console.log('[TRACKING NO_FILTER] Received EVENT:', payload.eventType, 'payload:', payload);
    });
    channelNoFilter.subscribe((status) => {
        console.log('[TRACKING NO_FILTER] Subscription status:', status);
    });
  };

  const handlePayOnline = async () => {
    // Navigate to Razorpay Checkout component with order details
    navigation.navigate('RazorpayCheckout', { 
      orderId: order.id, 
      amount: order.total_amount,
      isConversion: true 
    });
  };

  const handleCancelOrder = () => {
    Alert.alert(
      "Cancel Order",
      "Are you sure you want to cancel this order?",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: async () => {
            setIsCancelling(true);
            try {
              const { error } = await supabase.functions.invoke('customer-cancel-order', {
                body: { orderId: order.id, reason: 'Customer requested cancellation' }
              });
              if (error) throw error;
              fetchOrderDetails();
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Could not cancel order. It may be too late to cancel.');
            } finally {
              setIsCancelling(false);
            }
          }
        }
      ]
    );
  };

  const getTimelineSteps = () => {
    const steps = [
      { key: 'placed', label: 'Order Placed', icon: Clock },
      { key: 'picking', label: 'Picking', icon: Box },
      { key: 'packed', label: 'Packed & Ready', icon: CheckCircle2 },
      { key: 'staged', label: 'Order Staged', icon: Package },
      { key: 'driver_assigned', label: 'Driver Assigned', icon: Bike },
      { key: 'handed_off', label: 'Driver Picked Up', icon: MapPin },
      { key: 'out_for_delivery', label: 'Out for Delivery', icon: Bike },
      { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
    ];
    
    if (order?.status === 'cancelled') {
      return [{ key: 'cancelled', label: 'Order Cancelled', icon: XCircle, state: 'done' }];
    }

    const orderStatusSteps = steps.filter(s => s.key !== 'driver_assigned');
    const currentStatusIndex = orderStatusSteps.findIndex(s => s.key === order?.status);
    
    return steps.map((step) => {
      let state: 'done' | 'active' | 'pending' = 'pending';
      
      if (step.key === 'driver_assigned') {
        if (order?.driver_id) state = 'done';
      } else {
        const stepIndex = orderStatusSteps.findIndex(s => s.key === step.key);
        if (currentStatusIndex > stepIndex) state = 'done';
        if (currentStatusIndex === stepIndex) state = 'active';
      }
      
      if (order?.status === 'delivered') state = 'done';
      return { ...step, state };
    });
  };

  if (!orderId || !order) {
    return (
      <View style={styles.errorContainer}>
        <ShieldAlert size={48} color={theme.colors.danger} />
        <Text style={styles.errorText}>Loading Order...</Text>
      </View>
    );
  }



  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { padding: 0; margin: 0; }
          #map { width: 100%; height: 100vh; }
          .leaflet-control-attribution {
            font-size: 9px !important;
            opacity: 0.5;
            background: rgba(255, 255, 255, 0.7) !important;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([${customerLocation?.lat || 0}, ${customerLocation?.lng || 0}], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }).addTo(map);
          
          var bounds = [];
          
          // Customer Marker
          ${customerLocation ? `
            var custMarker = L.marker([${customerLocation.lat}, ${customerLocation.lng}]).addTo(map);
            bounds.push([${customerLocation.lat}, ${customerLocation.lng}]);
          ` : ''}

          // Warehouse Marker
          ${warehouseLocation ? `
            var whMarker = L.circleMarker([${warehouseLocation.lat}, ${warehouseLocation.lng}], { color: 'blue', radius: 6 }).addTo(map);
            bounds.push([${warehouseLocation.lat}, ${warehouseLocation.lng}]);
          ` : ''}

          // Driver Marker
          var driverMarker = null;
          ${driverLocation ? `
            driverMarker = L.circleMarker([${driverLocation.lat}, ${driverLocation.lng}], { color: 'red', radius: 8 }).addTo(map);
            bounds.push([${driverLocation.lat}, ${driverLocation.lng}]);
          ` : ''}

          if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [30, 30] });
          }

          function updateDriverLocation(lat, lng) {
            if (driverMarker) {
              driverMarker.setLatLng([lat, lng]);
            } else {
              driverMarker = L.circleMarker([lat, lng], { color: 'red', radius: 8 }).addTo(map);
            }
          }
        </script>
      </body>
    </html>
  `;

  const isCODUnpaid = order.payment_method === 'cod' && order.payment_status === 'pending';
  const showOTP = order.total_amount > 1000 && order.status === 'out_for_delivery';
  const canCancel = ['placed'].includes(order.status);

  return (
    <View style={styles.container}>
      <View style={styles.contentWrapper}>
        {/* Header */}
        <View style={styles.header}>
          {navigation.canGoBack() && (
            <TouchableOpacity style={styles.backIconBtn} onPress={() => navigation.goBack()}>
              <ChevronLeft size={24} color={theme.colors.text} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Order #{orderId.split('-')[0].toUpperCase()}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Map Area */}
        <View style={styles.mapArea}>
          {customerLocation ? (
            Platform.OS === 'web' ? (
              React.createElement('iframe', {
                srcDoc: mapHtml,
                style: { width: '100%', height: '100%', border: 'none', flex: 1 },
                title: "Tracking Map"
              })
            ) : (
              <WebView
                ref={webViewRef}
                source={{ html: mapHtml }}
                style={{ flex: 1 }}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              />
            )
          ) : (
             <View style={styles.liveMapDisabled}>
               <ActivityIndicator color={theme.colors.primary} />
             </View>
          )}
        </View>

        <ScrollView style={styles.scrollContent}>
          {/* Driver Card */}
          {order.driver_id && driverInfo && ['staged', 'handed_off', 'out_for_delivery'].includes(order.status) ? (
            <View style={styles.driverCard}>
              <View style={styles.driverLeft}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverInitials}>{driverInfo.full_name?.substring(0, 2).toUpperCase() || 'DR'}</Text>
                </View>
                <View>
                  <Text style={styles.driverName}>{driverInfo.full_name || 'FlashGO Driver'}</Text>
                  <Text style={styles.driverMeta}>Your Delivery Partner</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.callBtn}>
                <PhoneCall size={20} color={theme.colors.surface} />
              </TouchableOpacity>
            </View>
          ) : ['placed', 'packed'].includes(order.status) ? (
            <View style={styles.driverCard}>
              <View style={styles.driverLeft}>
                <View style={[styles.driverAvatar, { backgroundColor: theme.colors.border }]}>
                  <Text style={styles.driverInitials}>?</Text>
                </View>
                <View>
                  <Text style={styles.driverName}>Finding a delivery partner...</Text>
                  <Text style={styles.driverMeta}>Please wait</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Timeline */}
          <View style={styles.timelineCard}>
            <Text style={styles.timelineTitle}>Order Status</Text>
            
            <View style={styles.timelineContainer}>
              {getTimelineSteps().map((step, idx, arr) => {
                const Icon = step.icon;
                const isLast = idx === arr.length - 1;
                
                return (
                  <View key={step.key} style={styles.timelineStep}>
                    <View style={styles.timelineIconCol}>
                      <View style={[
                        styles.iconCircle, 
                        step.state === 'done' && styles.iconCircleDone,
                        step.state === 'active' && styles.iconCircleActive,
                        step.key === 'cancelled' && { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger }
                      ]}>
                        {step.state === 'done' && step.key !== 'cancelled' ? (
                          <CheckCircle2 size={16} color={theme.colors.surface} />
                        ) : (
                          <Icon size={16} color={step.state === 'active' || step.key === 'cancelled' ? theme.colors.surface : theme.colors.textMuted} />
                        )}
                      </View>
                      {!isLast && (
                        <View style={[
                          styles.timelineLine,
                          step.state === 'done' && styles.timelineLineDone
                        ]} />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[
                        styles.timelineLabel,
                        step.state === 'active' && styles.timelineLabelActive,
                        step.state === 'pending' && styles.timelineLabelPending,
                        step.key === 'cancelled' && { color: theme.colors.danger }
                      ]}>{step.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* COD Payment Card */}
          {isCODUnpaid && order.status !== 'cancelled' && (
            <View style={styles.codCard}>
              <View style={styles.codHeader}>
                <Banknote size={24} color={theme.colors.primary} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.codTitle}>Pay ₹{order.total_amount.toFixed(2)} before or on delivery</Text>
                  <Text style={styles.codSub}>Please keep exact change available or avoid the hassle by paying online.</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.payOnlineBtn} onPress={handlePayOnline}>
                <CreditCard size={18} color="#fff" style={{ marginRight: 8 }}/>
                <Text style={styles.payOnlineBtnText}>Pay online</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* OTP Card */}
          {showOTP && (
            <View style={styles.otpCard}>
              <View style={styles.otpHeader}>
                <ShieldAlert size={24} color={theme.colors.warning} />
                <Text style={styles.otpTitle}>Delivery verification</Text>
              </View>
              {deliveryOtp ? (
                <>
                  <Text style={styles.otpSub}>Share this OTP with your FlashGO delivery partner only when you receive your order.</Text>
                  <View style={styles.otpValueContainer}>
                    <Text style={styles.otpValue}>{deliveryOtp}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.otpSub}>Delivery verification will appear when your order is out for delivery.</Text>
              )}
            </View>
          )}

          {/* Cancellation */}
          {canCancel && (
            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={handleCancelOrder}
              disabled={isCancelling}
            >
              {isCancelling ? <ActivityIndicator color={theme.colors.danger} /> : <Text style={styles.cancelBtnText}>Cancel Order</Text>}
            </TouchableOpacity>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contentWrapper: { flex: 1, width: '100%', maxWidth: 1024, alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.md, backgroundColor: theme.colors.surface,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backIconBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  mapArea: { height: 250, backgroundColor: '#f3f4f6' },
  liveMapDisabled: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flex: 1, padding: theme.spacing.md },
  
  driverCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', padding: theme.spacing.lg, borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  driverLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  driverInitials: { color: theme.colors.primaryDark, fontWeight: 'bold', fontSize: 18 },
  driverName: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  driverMeta: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  callBtn: { backgroundColor: theme.colors.primary, padding: 12, borderRadius: theme.radius.full },

  timelineCard: {
    backgroundColor: '#ffffff', padding: theme.spacing.lg, borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  timelineTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.lg },
  timelineContainer: { paddingLeft: 8 },
  timelineStep: { flexDirection: 'row', minHeight: 60 },
  timelineIconCol: { alignItems: 'center', width: 30, marginRight: 16 },
  iconCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.background,
    borderWidth: 2, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', zIndex: 2,
  },
  iconCircleActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primaryDark },
  iconCircleDone: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  timelineLine: {
    position: 'absolute', top: 32, bottom: -8, width: 2, backgroundColor: theme.colors.border, zIndex: 1,
  },
  timelineLineDone: { backgroundColor: theme.colors.primary },
  timelineContent: { flex: 1, paddingTop: 6 },
  timelineLabel: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  timelineLabelActive: { fontWeight: 'bold', color: theme.colors.primary },
  timelineLabelPending: { color: theme.colors.textMuted },
  
  codCard: {
    backgroundColor: '#fffbeb', padding: 16, borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md, borderWidth: 1, borderColor: '#fde68a',
  },
  codHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, paddingRight: 32 },
  codTitle: { fontSize: 16, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  codSub: { fontSize: 13, color: '#92400e', opacity: 0.8 },
  payOnlineBtn: {
    backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', padding: 12, borderRadius: 8,
  },
  payOnlineBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  
  otpCard: {
    backgroundColor: '#eff6ff', padding: 16, borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md, borderWidth: 1, borderColor: '#bfdbfe',
  },
  otpHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  otpTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e40af', marginLeft: 8 },
  otpSub: { fontSize: 13, color: '#1e3a8a', marginBottom: 12 },
  otpValueContainer: { backgroundColor: '#fff', padding: 12, borderRadius: 8, alignItems: 'center' },
  otpValue: { fontSize: 28, fontWeight: '900', letterSpacing: 8, color: '#1e40af' },

  cancelBtn: {
    marginTop: 8, padding: 16, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.danger, alignItems: 'center',
  },
  cancelBtnText: { color: theme.colors.danger, fontWeight: 'bold', fontSize: 15 },
  
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginTop: 12 }
});
