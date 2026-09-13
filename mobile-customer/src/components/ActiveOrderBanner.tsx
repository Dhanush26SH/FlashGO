import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Bike, CheckCircle2, Clock, ChevronRight, Package, Box } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';

export default function ActiveOrderBanner() {
  const navigation = useNavigation<any>();
  const { sessionUser } = useMobileAppContext();
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionUser?.id) {
      setLoading(false);
      return;
    }
    
    fetchActiveOrder();

    // Subscribe to changes in active orders
    const sub = supabase
      .channel('public:orders')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `customer_id=eq.${sessionUser.id}`
      }, () => {
        fetchActiveOrder();
      })
      .subscribe();

    return () => {
      sub.unsubscribe();
    };
  }, [sessionUser?.id]);

  const fetchActiveOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, created_at, expected_delivery_time, total_amount')
        .eq('customer_id', sessionUser?.id)
        .in('status', ['placed', 'confirmed', 'packed', 'driver_assigned', 'out_for_delivery'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      if (!error && data) {
        setActiveOrder(data);
      } else {
        setActiveOrder(null);
      }
    } catch (e) {
      console.error(e);
      setActiveOrder(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (!activeOrder) return null;

  const getStatusDisplay = (status: string) => {
    switch(status) {
      case 'placed':
      case 'confirmed': return { label: 'Order Confirmed', icon: Clock, color: theme.colors.primary };
      case 'packed': return { label: 'Order Packed', icon: Box, color: theme.colors.primary };
      case 'driver_assigned': return { label: 'Driver Assigned', icon: Bike, color: theme.colors.primary };
      case 'out_for_delivery': return { label: 'Out for Delivery', icon: Bike, color: '#f59e0b' }; // Orange for out for delivery
      default: return { label: 'Processing', icon: Clock, color: theme.colors.primary };
    }
  };

  const statusDisplay = getStatusDisplay(activeOrder.status);
  const Icon = statusDisplay.icon;

  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={() => navigation.navigate('Tracking', { orderId: activeOrder.id })}
    >
      <View style={styles.left}>
        <View style={[styles.iconContainer, { backgroundColor: statusDisplay.color + '20' }]}>
          <Icon size={24} color={statusDisplay.color} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{statusDisplay.label}</Text>
          <Text style={styles.subtitle}>
            Order #{activeOrder.id.split('-')[0].toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.viewText}>Track</Text>
        <ChevronRight size={16} color={theme.colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  viewText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginRight: 2,
  }
});
