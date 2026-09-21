import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useMobileAppContext } from '../context/MobileAppContext';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function PendingPaymentRecovery() {
  const { pendingOrder, refreshPendingOrder, refreshServerCart } = useMobileAppContext();
  const navigation = useNavigation<NavigationProp>();
  
  const [isReconciling, setIsReconciling] = useState(true);
  const [reconciliationStatus, setReconciliationStatus] = useState<'checking' | 'pending' | 'paid' | 'error'>('checking');
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (pendingOrder) {
      reconcileOrder(pendingOrder.id);
    }
  }, [pendingOrder]);

  const reconcileOrder = async (orderId: string) => {
    setIsReconciling(true);
    setReconciliationStatus('checking');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Unauthenticated');

      const response = await fetch('https://szpfuommfvrfdliloxcg.supabase.co/functions/v1/reconcile-razorpay-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ orderId })
      });

      if (!response.ok) {
        throw new Error('Reconciliation request failed');
      }

      const data = await response.json();
      
      if (data.status === 'paid' || data.status === 'placed') {
        setReconciliationStatus('paid');
        await refreshPendingOrder(); // It's no longer pending
        navigation.navigate('OrderPlaced', { orderId });
      } else {
        setReconciliationStatus('pending');
      }
    } catch (err) {
      console.error('Reconciliation error:', err);
      setReconciliationStatus('error');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleCancel = async () => {
    if (!pendingOrder) return;
    
    Alert.alert(
      "Cancel Checkout?",
      "Are you sure you want to cancel this checkout and restore your cart? Only do this if your payment failed.",
      [
        { text: "Keep Waiting", style: "cancel" },
        { 
          text: "Cancel & Restore", 
          style: "destructive",
          onPress: async () => {
            setIsCancelling(true);
            try {
              const { error } = await supabase.rpc('fail_pending_payment', {
                p_order_id: pendingOrder.id
              });
              
              if (error) {
                console.error("Failed to cancel pending payment:", error);
                Alert.alert("Error", "Could not cancel the checkout. It may have already been resolved.");
              }
              
              await refreshPendingOrder();
              await refreshServerCart();
            } catch (err) {
              console.error(err);
            } finally {
              setIsCancelling(false);
            }
          }
        }
      ]
    );
  };

  if (!pendingOrder) return null;

  return (
    <View style={styles.container}>
      {isReconciling ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.statusText}>Confirming your payment... We're checking the status of your recent ₹{pendingOrder.total_amount} payment.</Text>
        </View>
      ) : reconciliationStatus === 'pending' || reconciliationStatus === 'error' ? (
        <View style={styles.content}>
          <Text style={styles.title}>Payment Unresolved</Text>
          <Text style={styles.message}>
            We haven't received payment confirmation yet for your ₹{pendingOrder.total_amount} order. 
            If your payment failed or you wish to try again, you can cancel this checkout to restore your cart.
          </Text>
          
          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton, isCancelling && styles.disabledButton]} 
              onPress={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel & Restore Cart</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.retryButton]} 
              onPress={() => reconcileOrder(pendingOrder.id)}
              disabled={isCancelling}
            >
              <Text style={styles.retryButtonText}>Refresh Status</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 12,
    margin: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    fontWeight: '500',
    lineHeight: 20,
  },
  content: {
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
  },
  message: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: theme.colors.danger,
  },
  disabledButton: {
    opacity: 0.7,
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  retryButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
});
