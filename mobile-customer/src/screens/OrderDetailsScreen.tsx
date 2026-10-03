import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, SafeAreaView, Modal, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Package, RotateCcw, FileText, AlertCircle, RefreshCw, Home } from 'lucide-react-native';
import { theme } from '../theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useMobileAppContext } from '../context/MobileAppContext';
import { cancelOrder, createSupportTicket } from '../services/api';
import { supabase } from '../lib/supabase';

type OrderDetailsRouteProp = RouteProp<RootStackParamList, 'OrderDetails'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function OrderDetailsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<OrderDetailsRouteProp>();
  const { order } = route.params;
  const { updateCart, sessionUser } = useMobileAppContext();
  const [showIssueModal, React_useState] = React.useState(false);
  const [creatingTicket, setCreatingTicket] = React.useState(false);
  const issueSubmitRef = React.useRef(false);

  const ISSUE_OPTIONS = [
    { label: 'Damaged item', category: 'Damaged Item' },
    { label: 'Wrong item', category: 'Wrong Item' },
    { label: 'Missing item', category: 'Missing Item' },
    { label: 'Quality issue', category: 'Quality Issue' },
    { label: 'Other', category: 'Other' }
  ];

  const handleSubmitIssue = async (category: string) => {
    if (issueSubmitRef.current) return;
    
    if (!sessionUser?.id) {
      Alert.alert('Error', 'You must be logged in to report an issue.');
      return;
    }

    issueSubmitRef.current = true;
    try {
      setCreatingTicket(true);
      const t = await createSupportTicket({
        customer_id: sessionUser.id,
        related_order_id: order.id,
        subject: `Order #${order.id.split('-')[0].toUpperCase()} - ${category}`,
        description: `Customer reported: ${category}`,
        category: category,
        priority: 'high',
        status: 'open',
      });
      React_useState(false); // hide modal
      navigation.navigate('SupportStack' as any, { activeTicketId: t.id });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreatingTicket(false);
      issueSubmitRef.current = false;
    }
  };

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
              Alert.alert('Order Cancelled', 'Your order has been cancelled.', [
                { text: 'Go to Home', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] }) }
              ]);
              navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
            } catch (err: any) {
              Alert.alert('Cancel Failed', err.message);
            }
          }
        }
      ]
    );
  };

  const handleReportIssue = () => {
    React_useState(true);
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

      <Modal visible={showIssueModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.colors.background, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: theme.colors.text }}>Report an Issue</Text>
            
            {ISSUE_OPTIONS.map(opt => (
              <TouchableOpacity 
                key={opt.category} 
                style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                onPress={() => handleSubmitIssue(opt.category)}
                disabled={creatingTicket}
              >
                <Text style={{ fontSize: 16, color: theme.colors.text }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity 
              style={{ padding: 16, marginTop: 8, alignItems: 'center' }}
              onPress={() => React_useState(false)}
              disabled={creatingTicket}
            >
              {creatingTicket ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <Text style={{ fontSize: 16, color: theme.colors.danger, fontWeight: '600' }}>Cancel</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

          {/* Back to Home for terminal states */}
          {(order.status === 'delivered' || order.status === 'cancelled') && (
            <TouchableOpacity
              style={[styles.actionBtn, { width: '100%', backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
            >
              <Home size={20} color={theme.colors.surface} />
              <Text style={[styles.actionBtnText, { color: theme.colors.surface }]}>Back to Home</Text>
            </TouchableOpacity>
          )}
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
