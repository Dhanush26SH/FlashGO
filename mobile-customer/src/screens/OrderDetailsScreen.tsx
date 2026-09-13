import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Package, RotateCcw, FileText, AlertCircle, RefreshCw } from 'lucide-react-native';
import { theme } from '../theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useMobileAppContext } from '../context/MobileAppContext';
import { cancelOrder } from '../services/api';

type OrderDetailsRouteProp = RouteProp<RootStackParamList, 'OrderDetails'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function OrderDetailsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<OrderDetailsRouteProp>();
  const { order } = route.params;
  const { updateCart } = useMobileAppContext();

  const handleReorder = () => {
    order.order_items.forEach((item: any) => {
      updateCart(item.product_id, item.quantity);
    });
    Alert.alert('Success', 'Items added to cart!');
    navigation.navigate('MainTabs');
  };

  const handleCancel = async () => {
    Alert.alert(
      "Cancel Order",
      "Are you sure you want to cancel this order?",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive", 
          onPress: async () => {
            try {
              await cancelOrder(order.id, order.payment_method);
              Alert.alert('Success', 'Order cancelled successfully');
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Cancel Failed', err.message);
            }
          }
        }
      ]
    );
  };

  const handleReportIssue = () => {
    Alert.alert('Report Issue', 'Please contact support with order ID: ' + order.id);
    navigation.navigate('MainTabs', { screen: 'Support' } as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order #{order.id.split('-')[0].toUpperCase()}</Text>
          <Text style={styles.metaText}>Placed on {new Date(order.created_at).toLocaleString()}</Text>
          <View style={[styles.statusBadge, { backgroundColor: theme.colors.primaryLight }]}>
            <Text style={styles.statusText}>{order.status.replace(/_/g, ' ').toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {order.order_items.map((item: any) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.products?.name || 'Unknown Item'}</Text>
                <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
              </View>
              <Text style={styles.itemPrice}>₹{(item.price * item.quantity).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Amount</Text>
            <Text style={styles.summaryValue}>₹{order.total_amount.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Payment Method</Text>
            <Text style={styles.summaryValue}>{order.payment_method.toUpperCase()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Payment Status</Text>
            <Text style={styles.summaryValue}>{order.payment_status.toUpperCase()}</Text>
          </View>
          {order.refund_status && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Refund Status</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.warning }]}>{order.refund_status.toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.actionGrid}>
          {['placed', 'picking', 'packed'].includes(order.status) && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleCancel}>
              <AlertCircle size={20} color={theme.colors.danger} />
              <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>Cancel Order</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.actionBtn} onPress={handleReorder}>
            <RotateCcw size={20} color={theme.colors.primary} />
            <Text style={[styles.actionBtnText, { color: theme.colors.primary }]}>Reorder</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleReportIssue}>
            <AlertCircle size={20} color={theme.colors.text} />
            <Text style={styles.actionBtnText}>Issue/Return</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionBtn} onPress={() => Alert.alert('Invoice', 'Invoice will be downloaded.')}>
            <FileText size={20} color={theme.colors.text} />
            <Text style={styles.actionBtnText}>Invoice</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#ffffff',
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  metaText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    marginTop: 4,
  },
  statusText: {
    color: theme.colors.primaryDark,
    fontWeight: 'bold',
    fontSize: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  itemQty: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  summaryValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  actionBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnText: {
    fontWeight: '600',
    fontSize: 14,
    color: theme.colors.text,
  },
});
