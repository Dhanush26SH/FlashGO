import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated, Easing } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CheckCircle2 } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

export default function OrderPlacedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId } = route.params || {};

  const [orderData, setOrderData] = useState<any>(null);
  
  // Animations
  const scaleAnim = new Animated.Value(0);
  const fadeAnim = new Animated.Value(0);

  useEffect(() => {
    // Fetch order address snapshot
    const fetchOrder = async () => {
      const { data } = await supabase
        .from('orders')
        .select('delivery_address, customer_id')
        .eq('id', orderId)
        .single();
      
      if (data) {
        // We'll also fetch the user's name (recipient)
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.customer_id)
          .single();
          
        setOrderData({
          address: data.delivery_address,
          recipient: profile?.full_name || 'Customer'
        });
      }
    };
    if (orderId) fetchOrder();
  }, [orderId]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.elastic(1.2),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-navigate to Order Tracking after 3.5 seconds
    const timer = setTimeout(() => {
      navigation.replace('Tracking', { orderId });
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  const getFormattedAddress = (addr: any) => {
    if (!addr) return '';
    if (typeof addr === 'string') return addr; // If simple text
    const parts = [];
    if (addr.flat_house_no) parts.push(addr.flat_house_no);
    if (addr.street_address) parts.push(addr.street_address);
    if (addr.locality) parts.push(addr.locality);
    return Array.from(new Set(parts.filter(Boolean))).join(', ');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Animated.View style={[styles.iconContainer, { transform: [{ scale: scaleAnim }] }]}>
          <CheckCircle2 size={100} color={theme.colors.primary} />
        </Animated.View>
        
        <Animated.Text style={[styles.title, { opacity: scaleAnim }]}>
          ORDER PLACED
        </Animated.Text>
        
        {orderData && (
          <Animated.View style={[styles.detailsContainer, { opacity: fadeAnim }]}>
            <Text style={styles.deliveringFor}>Delivering for {orderData.recipient}</Text>
            <Text style={styles.addressSnapshot}>{getFormattedAddress(orderData.address)}</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.colors.primary,
    letterSpacing: 1,
    marginBottom: 32,
  },
  detailsContainer: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
    borderRadius: 16,
    width: '100%',
  },
  deliveringFor: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  addressSnapshot: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  }
});
