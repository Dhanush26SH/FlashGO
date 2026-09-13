import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Truck, User, Phone, Hash, Package, ChevronLeft, CheckCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface OrderData {
  id: string;
  status: string;
  driver_id: string | null;
  trip_id: string | null;
  bag_number: string | null;
  order_number: string | null;
  driver: DriverProfile | null;
}

interface DriverProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  employee_id: string | null;
}

export default function HandoverToDriverScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const orderId: string = route.params?.orderId;
  const { profile } = useAuth() as any;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<OrderData | null>(null);

  // ─── Fetch order + driver profile (called on mount and on realtime updates) ───
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const { data, error } = await supabase.rpc('get_order_handover_context', {
        p_order_id: orderId,
      });

      if (error) throw error;
      
      const formattedData: OrderData = {
        id: orderId,
        status: data.order_status,
        driver_id: data.driver_id,
        trip_id: data.trip_status === 'accepted' || data.trip_status === 'in_transit' ? 'trip' : null,
        bag_number: data.bag_number,
        order_number: data.order_number,
        driver: data.driver_id ? {
          id: data.driver_id,
          full_name: data.full_name,
          phone: data.phone,
          employee_id: data.employee_id
        } : null
      };

      setOrder(formattedData);
    } catch (e: any) {
      console.error('[HandoverToDriverScreen] fetchOrder error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // ─── Initial load ───
  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // ─── Realtime: watch for driver_id and status changes on this order ───
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`handover-order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        () => {
          // Immediately refetch so driver card always reflects authoritative backend state
          fetchOrder();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, fetchOrder]);

  // ─── Handover action ───
  const handleHandover = async () => {
    if (!order?.driver_id) {
      Alert.alert('Not Ready', 'Driver has not been assigned yet.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('execute_worker_handover', {
        p_order_id: orderId,
        p_picker_id: profile.id,
      });
      if (error) throw error;

      // Picker is now FREE — return to the main Picker tab dashboard (Task tab → PickerDashboard).
      // Use reset so back-press cannot return to the handover screen for a completed order.
      // IMPORTANT: navigate to 'MainTabs' (the bottom-tab root), NOT 'PickerShift' (a bare stack
      // screen without tabs). MainTabs renders PickerDashboard as the Task tab, which correctly
      // reconciles shift state via its focus effect and shows the idle state within the full tab UI.
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (e: any) {
      Alert.alert('Handover Failed', e.message);
      setSubmitting(false);
    }
  };

  // ─── Derived display values ───
  const driver = order?.driver ?? null;
  const driverAssigned = !!(order?.driver_id && driver);
  const handoverReady = driverAssigned && order?.status === 'packed';

  const displayOrderId = order?.order_number
    ? `#${order.order_number}`
    : orderId
    ? `#${orderId.substring(0, 8).toUpperCase()}`
    : '#—';

  const displayDriverId = driver?.employee_id
    ? `FGDRV-${driver.employee_id}`
    : driver?.id
    ? `FGDRV-${driver.id.substring(0, 8).toUpperCase()}`
    : '—';

  // ─── Loading skeleton ───
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Loading handover details...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
        >
          <ChevronLeft color="#fff" size={26} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Handover order to rider</Text>
          <Text style={styles.headerOrderId}>{displayOrderId}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Driver card ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Truck color="#10b981" size={20} />
            <Text style={styles.cardTitle}>Assigned Rider</Text>
          </View>

          {driverAssigned ? (
            <View style={styles.driverGrid}>
              {/* Driver ID row */}
              <View style={styles.driverRow}>
                <View style={styles.driverIconWrap}>
                  <Hash color="#6b7280" size={16} />
                </View>
                <View style={styles.driverRowContent}>
                  <Text style={styles.driverRowLabel}>Driver ID</Text>
                  <Text style={styles.driverRowValue}>{displayDriverId}</Text>
                </View>
              </View>

              {/* Name row */}
              <View style={styles.driverRow}>
                <View style={styles.driverIconWrap}>
                  <User color="#6b7280" size={16} />
                </View>
                <View style={styles.driverRowContent}>
                  <Text style={styles.driverRowLabel}>Driver Name</Text>
                  <Text style={styles.driverRowValue}>
                    {driver?.full_name || '—'}
                  </Text>
                </View>
              </View>

              {/* Phone row */}
              <View style={[styles.driverRow, { borderBottomWidth: 0 }]}>
                <View style={styles.driverIconWrap}>
                  <Phone color="#6b7280" size={16} />
                </View>
                <View style={styles.driverRowContent}>
                  <Text style={styles.driverRowLabel}>Phone</Text>
                  <Text style={styles.driverRowValue}>
                    {driver?.phone || '—'}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.waitingContainer}>
              <ActivityIndicator color="#10b981" style={{ marginBottom: 12 }} />
              <Text style={styles.waitingTitle}>Finding delivery partner...</Text>
              <Text style={styles.waitingSubtitle}>
                A driver is being automatically assigned. This updates live.
              </Text>
            </View>
          )}
        </View>

        {/* ── Bag card — only if bag_number is non-null ── */}
        {order?.bag_number ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Package color="#10b981" size={20} />
              <Text style={styles.cardTitle}>Bag Information</Text>
            </View>
            <View style={styles.bagRow}>
              <Text style={styles.bagLabel}>Bag Number</Text>
              <Text style={styles.bagValue}>{order.bag_number}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Status indicator ── */}
        {driverAssigned && (
          <View style={styles.statusRow}>
            <CheckCircle color="#10b981" size={18} />
            <Text style={styles.statusText}>
              Driver accepted — ready for handover
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.handoverButton,
            (!handoverReady || submitting) && styles.handoverButtonDisabled,
          ]}
          onPress={handleHandover}
          disabled={!handoverReady || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text
              style={[
                styles.handoverButtonText,
                (!handoverReady) && styles.handoverButtonTextDisabled,
              ]}
            >
              {driverAssigned ? 'Handover Order' : 'Waiting for Driver...'}
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
  loadingText: {
    color: '#9ca3af',
    fontSize: 15,
    marginTop: 12,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#059669',        // FlashGO green header
    borderBottomWidth: 1,
    borderBottomColor: '#047857',
  },
  backButton: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerOrderId: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 14,
  },

  // ── Cards ──
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Driver rows ──
  driverGrid: {
    gap: 0,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    gap: 12,
  },
  driverIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverRowContent: {
    flex: 1,
  },
  driverRowLabel: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  driverRowValue: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Waiting state ──
  waitingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  waitingTitle: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  waitingSubtitle: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Bag card ──
  bagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bagLabel: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  bagValue: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Status indicator ──
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#052e16',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#065f46',
  },
  statusText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Footer ──
  footer: {
    padding: 16,
    paddingBottom: 20,
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  handoverButton: {
    backgroundColor: '#10b981',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  handoverButtonDisabled: {
    backgroundColor: '#1f2937',
  },
  handoverButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  handoverButtonTextDisabled: {
    color: '#4b5563',
  },
});
