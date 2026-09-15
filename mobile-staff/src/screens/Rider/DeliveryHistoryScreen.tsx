import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Package, MapPin, CheckCircle, XCircle, Clock } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function DeliveryHistoryScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<any[]>([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    if (!profile) return;
    try {
      setLoading(true);
      // Fetch genuine logistics trips + orders with snapshot info + earning amount
      const { data, error } = await supabase
        .from('logistics_trips')
        .select(`
          id,
          status,
          delivered_at,
          created_at,
          route_distance_meters,
          warehouses ( name ),
          orders (
            id,
            status,
            customer_snapshot_name,
            customer_snapshot_phone,
            total_amount,
            payment_method
          ),
          driver_financial_ledger (
            amount,
            transaction_type
          )
        `)
        .eq('driver_id', profile.id)
        .in('status', ['completed', 'cancelled', 'in_transit', 'accepted', 'pending'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTrips(data || []);
    } catch (e) {
      console.error('Failed to load delivery history', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return '#10b981';
    if (status === 'cancelled') return '#ef4444';
    return '#f59e0b';
  };

  const getStatusText = (status: string) => {
    if (status === 'completed') return 'Delivered';
    if (status === 'cancelled') return 'Cancelled';
    return 'In Progress';
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delivery History</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
        ) : trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Package size={48} color="#334155" />
            <Text style={styles.emptyText}>No deliveries found.</Text>
          </View>
        ) : (
          trips.map((trip) => {
            const order = trip.orders && trip.orders.length > 0 ? trip.orders[0] : trip.orders;
            const earnings = trip.driver_financial_ledger?.find((l: any) => l.transaction_type === 'delivery_earning');
            
            return (
              <View key={trip.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Package size={18} color="#94a3b8" />
                    <Text style={styles.orderId}>
                      ID: #{order?.id?.slice(0, 8).toUpperCase() || trip.id.slice(0, 8).toUpperCase()}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trip.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(trip.status) }]}>
                      {getStatusText(trip.status)}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <Clock size={14} color="#94a3b8" />
                    <Text style={styles.infoText}>
                      {trip.status === 'completed' && trip.delivered_at 
                        ? formatDate(trip.delivered_at) 
                        : formatDate(trip.created_at)}
                    </Text>
                  </View>
                  
                  {order && (
                    <View style={styles.infoRow}>
                      <MapPin size={14} color="#94a3b8" />
                      <Text style={styles.infoText}>
                        {order.customer_snapshot_name || 'Customer'} • {order.customer_snapshot_phone || 'N/A'}
                      </Text>
                    </View>
                  )}
                  
                  {trip.warehouses && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoText}>From: {trip.warehouses.name}</Text>
                    </View>
                  )}
                </View>

                {earnings && (
                  <View style={styles.earningsRow}>
                    <Text style={styles.earningsLabel}>Delivery Earning</Text>
                    <Text style={styles.earningsValue}>₹{Number(earnings.amount).toFixed(2)}</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e293b'
  },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', marginTop: 60, opacity: 0.7 },
  emptyText: { color: '#94a3b8', marginTop: 12, fontSize: 16 },
  card: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#334155'
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orderId: { color: '#f8fafc', fontWeight: '700', fontSize: 15, fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardBody: { gap: 8, marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { color: '#cbd5e1', fontSize: 14 },
  earningsRow: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12 
  },
  earningsLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  earningsValue: { color: '#10b981', fontSize: 16, fontWeight: '800' }
});
