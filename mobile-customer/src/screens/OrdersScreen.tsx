import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Package, Clock, XCircle, CheckCircle, ChevronRight, RefreshCw, FileText } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { fetchOrders, cancelOrder } from '../services/api';
import { theme } from '../theme';

export default function OrdersScreen() {
  const navigation = useNavigation<any>();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'past' | 'cancelled'>('active');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      Alert.alert('Error', 'Could not load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (orderId: string, paymentMethod: string) => {
    Alert.alert(
      "Cancel Order",
      "Are you sure you want to cancel this order?",
      [
        { text: "No, Keep It", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive", 
          onPress: async () => {
            try {
              setLoading(true);
              await cancelOrder(orderId, paymentMethod);
              Alert.alert('Success', 'Order cancelled successfully');
              loadOrders();
            } catch (err: any) {
              setLoading(false);
              Alert.alert('Cancel Failed', err.message);
            }
          }
        }
      ]
    );
  };

  const filteredOrders = orders.filter(o => {
    if (filter === 'active') return ['placed', 'picking', 'packed', 'out_for_delivery'].includes(o.status);
    if (filter === 'past') return o.status === 'delivered';
    if (filter === 'cancelled') return o.status === 'cancelled';
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'placed': return theme.colors.primary;
      case 'out_for_delivery': return theme.colors.warning;
      case 'delivered': return theme.colors.success;
      case 'cancelled': return theme.colors.danger;
      default: return theme.colors.primaryDark;
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Package size={20} color={theme.colors.text} />
          <Text style={styles.id}>Order #{item.id.split('-')[0].toUpperCase()}</Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status.replace(/_/g, ' ').toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Total Amount:</Text>
          <Text style={styles.detailValue}>₹{item.total_amount.toFixed(2)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Payment Method:</Text>
          <Text style={styles.detailValue}>{item.payment_method.toUpperCase()}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Payment Status:</Text>
          <Text style={[styles.detailValue, item.payment_status === 'paid' ? styles.paidText : styles.unpaidText]}>
            {item.payment_status.toUpperCase()}
          </Text>
        </View>
        {item.refund_status && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Refund Status:</Text>
            <Text style={[styles.detailValue, { color: theme.colors.warning }]}>{item.refund_status.toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <TouchableOpacity style={styles.receiptBtn} onPress={() => navigation.navigate('OrderDetails', { order: item })}>
          <FileText size={16} color={theme.colors.textMuted} />
          <Text style={styles.receiptBtnText}>View Details / Receipt</Text>
        </TouchableOpacity>

        {filter === 'active' && (
          <View style={styles.actionRow}>
            {(item.status === 'placed' || item.status === 'packing') && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item.id, item.payment_method)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.trackBtn} onPress={() => navigation.navigate('Tracking', { orderId: item.id })}>
              <Text style={styles.trackBtnText}>Track Order</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
      </View>
      <View style={styles.contentWrapper}>
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, filter === 'active' && styles.activeTab]} onPress={() => setFilter('active')}>
            <Text style={[styles.tabText, filter === 'active' && styles.activeTabText]}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, filter === 'past' && styles.activeTab]} onPress={() => setFilter('past')}>
            <Text style={[styles.tabText, filter === 'past' && styles.activeTabText]}>Past</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, filter === 'cancelled' && styles.activeTab]} onPress={() => setFilter('cancelled')}>
            <Text style={[styles.tabText, filter === 'cancelled' && styles.activeTabText]}>Cancelled</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Fetching your orders...</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={styles.centerBox}>
            <Clock size={48} color={theme.colors.border} />
            <Text style={styles.emptyTitle}>No {filter} orders</Text>
            <Text style={styles.emptySub}>You don't have any orders in this category yet.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredOrders}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={loading}
            onRefresh={loadOrders}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: theme.colors.background 
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl, // Safe area
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  tabs: { 
    flexDirection: 'row', 
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1, 
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.sm
  },
  tab: { 
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { 
    borderBottomColor: theme.colors.primary,
  },
  tabText: { 
    color: theme.colors.textMuted,
    fontWeight: '500',
    fontSize: 14,
  },
  activeTabText: { 
    color: theme.colors.primary, 
    fontWeight: 'bold',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  emptyTitle: {
    marginTop: theme.spacing.md,
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  emptySub: {
    marginTop: theme.spacing.xs,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    padding: theme.spacing.md,
  },
  card: { 
    backgroundColor: '#ffffff',
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg, 
    marginBottom: theme.spacing.lg,
    borderWidth: 1, 
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  id: { 
    fontWeight: 'bold', 
    fontSize: 16,
    color: theme.colors.text,
  },
  statusChip: { 
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardBody: {
    marginBottom: theme.spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  detailValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  paidText: {
    color: theme.colors.success,
  },
  unpaidText: {
    color: theme.colors.warning,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: theme.spacing.sm,
  },
  receiptBtnText: {
    color: theme.colors.textMuted,
    fontWeight: '500',
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: { 
    backgroundColor: theme.colors.dangerLight, 
    paddingHorizontal: 16,
    paddingVertical: 10, 
    borderRadius: theme.radius.md, 
    alignItems: 'center' 
  },
  cancelBtnText: { 
    color: theme.colors.danger, 
    fontWeight: '800' 
  },
  trackBtn: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: 'center'
  },
  trackBtnText: {
    color: theme.colors.primaryDark,
    fontWeight: '800',
  }
});
