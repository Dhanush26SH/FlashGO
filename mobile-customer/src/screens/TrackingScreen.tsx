import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MapPin, Bike, CheckCircle2, Circle, Clock, PhoneCall, ChevronLeft, ShieldAlert } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import { fetchPendingSubstitutions } from '../services/api';
import SubstitutionModal from '../components/SubstitutionModal';

export default function TrackingScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { orderId } = route?.params || { orderId: null };
  const [driverLocation, setDriverLocation] = useState<{lat: number, lng: number} | null>(null);
  const [status, setStatus] = useState('placed');
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const [pendingSubstitution, setPendingSubstitution] = useState<any>(null);

  useEffect(() => {
    if (!orderId) return;
    
    // Fetch initial status
    supabase.from('orders').select('status, driver_id, total_amount, otp_code').eq('id', orderId).single().then(({ data }) => {
      if (data) {
        setStatus(data.status);
        if (data.otp_code) setOtpCode(data.otp_code);
        if (data.driver_id) {
          fetchDriverInfo(data.driver_id);
          if (['out_for_delivery'].includes(data.status)) {
            fetchDriverLocation(data.driver_id);
            subscribeDriver(data.driver_id);
          }
        }
      }
    });

    // Check for pending substitutions initially
    const loadPendingSubstitutions = async () => {
      try {
        const subs = await fetchPendingSubstitutions(orderId);
        if (subs && subs.length > 0) {
          setPendingSubstitution(subs[0]);
        } else {
          setPendingSubstitution(null);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadPendingSubstitutions();

    // Subscribe to order status
    const orderSub = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
        setStatus(payload.new.status);
        if (payload.new.driver_id && ['out_for_delivery'].includes(payload.new.status) && !driverLocation) {
          fetchDriverInfo(payload.new.driver_id);
          fetchDriverLocation(payload.new.driver_id);
          subscribeDriver(payload.new.driver_id);
        }
      })
      .subscribe();

    const subsSub = supabase
      .channel(`order-subs-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_substitutions', filter: `order_id=eq.${orderId}` }, () => {
        loadPendingSubstitutions();
      })
      .subscribe();

    return () => {
      orderSub.unsubscribe();
      subsSub.unsubscribe();
    };
  }, [orderId]);

  const fetchDriverInfo = async (driverId: string) => {
    const { data } = await supabase.from('users').select('full_name, phone_number').eq('id', driverId).single();
    if (data) setDriverInfo(data);
  };

  const fetchDriverLocation = async (driverId: string) => {
    const { data } = await supabase.from('driver_sessions')
      .select('latest_lat, latest_lng')
      .eq('driver_id', driverId)
      .single();
      
    if (data && data.latest_lat && data.latest_lng) {
      setDriverLocation({ lat: data.latest_lat, lng: data.latest_lng });
    }
  };

  const subscribeDriver = (driverId: string) => {
    // Only subscribe to the exact assigned driver_id
    supabase
      .channel(`driver-${driverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_sessions', filter: `driver_id=eq.${driverId}` }, (payload) => {
        const newData = payload.new as any;
        if (newData.latest_lat && newData.latest_lng) {
          setDriverLocation({ lat: newData.latest_lat, lng: newData.latest_lng });
        }
      })
      .subscribe();
  };

  // Rest of component unchanged
  const getTimelineSteps = () => {
    const steps = [
      { key: 'placed', label: 'Order Placed', icon: Clock },
      { key: 'packed', label: 'Packed & Ready', icon: CheckCircle2 },
      { key: 'driver_assigned', label: 'Driver Assigned', icon: Bike },
      { key: 'out_for_delivery', label: 'Out for Delivery', icon: MapPin },
      { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
    ];

    const currentIndex = steps.findIndex(s => s.key === status);
    
    return steps.map((step, index) => {
      let state: 'done' | 'active' | 'pending' = 'pending';
      if (currentIndex > index) state = 'done';
      if (currentIndex === index) state = 'active';
      if (status === 'delivered') state = 'done';
      
      return { ...step, state };
    });
  };

  if (!orderId) {
    return (
      <View style={styles.errorContainer}>
        <ShieldAlert size={48} color={theme.colors.danger} />
        <Text style={styles.errorText}>No Order Selected</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        {['out_for_delivery', 'delivered'].includes(status) && driverLocation ? (
          <View style={styles.liveMap}>
            <MapPin size={48} color={theme.colors.primary} />
            <View style={styles.mapBadge}>
              <Text style={styles.mapBadgeText}>Live GPS Active</Text>
            </View>
            <Text style={styles.coordsText}>
              {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
            </Text>
          </View>
        ) : (
          <View style={styles.liveMapDisabled}>
            <MapPin size={48} color={theme.colors.border} />
            <Text style={styles.noMapTitle}>Map tracking not yet available</Text>
            <Text style={styles.noMapSub}>Live tracking begins when the order is out for delivery.</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.scrollContent}>
        {/* Driver Card */}
        {driverInfo && ['driver_assigned', 'out_for_delivery'].includes(status) && (
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
        )}

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
                    ]}>
                      {step.state === 'done' ? (
                        <CheckCircle2 size={16} color={theme.colors.surface} />
                      ) : (
                        <Icon size={16} color={step.state === 'active' ? theme.colors.surface : theme.colors.textMuted} />
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
                      step.state === 'pending' && styles.timelineLabelPending
                    ]}>{step.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Support CTA */}
        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>Need Help?</Text>
          <Text style={styles.supportSub}>If you have any issues with your order, we are here to help.</Text>
          <TouchableOpacity style={styles.supportBtn}>
            <Text style={styles.supportBtnText}>Contact Support</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* OTP Display when Out for Delivery */}
      {status === 'out_for_delivery' && otpCode && (
        <View style={styles.otpContainer}>
          <Text style={styles.otpLabel}>Delivery PIN</Text>
          <Text style={styles.otpValue}>{otpCode}</Text>
          <Text style={styles.otpHelper}>Share this with the driver</Text>
        </View>
      )}

        {/* Substitution Modal */}
        <SubstitutionModal 
          visible={!!pendingSubstitution} 
          substitution={pendingSubstitution}
          onResolved={() => {
            setPendingSubstitution(null);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backIconBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  mapArea: {
    height: 250,
    backgroundColor: theme.colors.surface,
  },
  liveMap: {
    flex: 1,
    backgroundColor: '#e2f4ea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    marginTop: theme.spacing.md,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  mapBadgeText: {
    color: theme.colors.surface,
    fontWeight: 'bold',
    fontSize: 12,
  },
  coordsText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  liveMapDisabled: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  noMapTitle: {
    marginTop: theme.spacing.md,
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  noMapSub: {
    marginTop: 4,
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontSize: 13,
  },
  scrollContent: {
    flex: 1,
    padding: theme.spacing.md,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  driverLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInitials: {
    color: theme.colors.primaryDark,
    fontWeight: 'bold',
    fontSize: 18,
  },
  driverName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  driverMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  callBtn: {
    backgroundColor: theme.colors.primary,
    padding: 12,
    borderRadius: theme.radius.full,
  },
  timelineCard: {
    backgroundColor: '#ffffff',
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  timelineContainer: {
    paddingLeft: 8,
  },
  timelineStep: {
    flexDirection: 'row',
    minHeight: 60,
  },
  timelineIconCol: {
    alignItems: 'center',
    width: 30,
    marginRight: 16,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  iconCircleActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  iconCircleDone: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  timelineLine: {
    position: 'absolute',
    top: 32,
    bottom: -8,
    width: 2,
    backgroundColor: theme.colors.border,
    zIndex: 1,
  },
  timelineLineDone: {
    backgroundColor: theme.colors.primary,
  },
  timelineContent: {
    flex: 1,
    paddingTop: 6,
  },
  timelineLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  timelineLabelActive: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  timelineLabelPending: {
    color: theme.colors.textMuted,
  },
  supportCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  stepLabel: {
    fontSize: 15,
    color: theme.colors.text,
  },
  otpContainer: {
    padding: 24,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  otpLabel: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  otpValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.primary,
    letterSpacing: 8,
  },
  otpHelper: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  supportSub: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginVertical: theme.spacing.sm,
  },
  supportBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 8,
  },
  supportBtnText: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  backBtn: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: theme.radius.sm,
  },
  backBtnText: {
    color: theme.colors.surface,
    fontWeight: 'bold',
  }
});
