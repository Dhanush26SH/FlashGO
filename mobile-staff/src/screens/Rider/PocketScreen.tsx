import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { User, IndianRupee, Wallet } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

export default function PocketScreen({ navigation }: any) {
  const { profile } = useAuth() as any;
  const [isOnline, setIsOnline] = useState(profile?.is_online || false);
  
  const [weeklyEarnings, setWeeklyEarnings] = useState(0);
  const [unsettledCod, setUnsettledCod] = useState(0);
  const [pendingCodOrders, setPendingCodOrders] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (profile?.id) {
        fetchPocketData();
      }
    }, [profile?.id])
  );

  const fetchPocketData = async () => {
    try {
      // 1. Fetch Authoritative Summaries
      const { data: rawData, error } = await supabase
        .from('driver_financial_summary')
        .select('*')
        .eq('driver_id', profile.id)
        .maybeSingle();
      const data = rawData as any;
        
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching pocket summary', error);
      }
      
      if (data) {
        setWeeklyEarnings(Number(data.weekly_earnings) || 0);
        setUnsettledCod(Number(data.unsettled_cod) || 0);
      } else {
        setWeeklyEarnings(0);
        setUnsettledCod(0);
      }

      // 2. Fetch Pending COD Details
      const { data: codData, error: codError } = await supabase
        .from('cod_collections')
        .select('order_id, amount, created_at, status, orders(order_number)')
        .eq('driver_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (codError) {
        console.error('Error fetching pending COD orders', codError);
      }

      if (codData) {
        setPendingCodOrders(codData);
      } else {
        setPendingCodOrders([]);
      }

    } catch (e) {
      console.error('Exception fetching pocket summary', e);
    }
  };

  const handleToggleOnline = async (value: boolean) => {
    setIsOnline(value);
    try {
      const response = (await supabase.from('profiles').update({ is_online: value }).eq('id', profile?.id)) as any;
      if (response.error) throw response.error;
    } catch (e: any) {
      setIsOnline(!value);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.onlineBadge}>
          <Text style={styles.onlineText}>{isOnline ? 'Online' : 'Offline'}</Text>
          <Switch 
            value={isOnline} 
            onValueChange={handleToggleOnline}
            trackColor={{ false: '#3f3f46', true: '#10b981' }}
            thumbColor={'#ffffff'}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.profileCircle} 
            onPress={() => navigation.navigate('Profile')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <User color="#9ca3af" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        
        {/* Weekly Earnings Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IndianRupee color="#10b981" size={20} />
            <Text style={styles.cardTitle}>Current Week Earnings</Text>
          </View>
          <Text style={styles.mainAmount}>₹{weeklyEarnings.toFixed(2)}</Text>
          <Text style={styles.subText}>Qualifying deliveries this week</Text>
        </View>

        {/* COD Cash in Hand Card */}
        <View style={[styles.card, { borderColor: '#334155', borderWidth: 1, marginTop: 8 }]}>
          <View style={styles.cardHeader}>
            <Wallet color="#f59e0b" size={20} />
            <Text style={styles.cardTitle}>COD Cash in Hand</Text>
          </View>
          <Text style={[styles.mainAmount, { color: '#f59e0b' }]}>₹{unsettledCod.toFixed(2)}</Text>
          
          {unsettledCod > 0 ? (
            <Text style={styles.subText}>Cash collected from COD customers • Pending handover</Text>
          ) : (
            <Text style={styles.subText}>No cash pending handover</Text>
          )}
        </View>

        {/* Pending Handover List */}
        {pendingCodOrders.length > 0 && (
          <View style={styles.pendingListContainer}>
            <Text style={styles.sectionTitle}>Pending Handover</Text>
            {pendingCodOrders.map((item, index) => {
              // Extract order number robustly depending on Supabase join structure
              let orderNumber = item.order_id?.substring(0, 8).toUpperCase();
              if (item.orders && !Array.isArray(item.orders) && item.orders.order_number) {
                 orderNumber = item.orders.order_number;
              } else if (Array.isArray(item.orders) && item.orders[0]?.order_number) {
                 orderNumber = item.orders[0].order_number;
              }

              return (
                <View key={item.order_id || index} style={styles.pendingItem}>
                  <View style={styles.pendingItemHeader}>
                    <Text style={styles.pendingItemTitle}>#{orderNumber}</Text>
                    <Text style={styles.pendingItemAmount}>₹{Number(item.amount).toFixed(2)}</Text>
                  </View>
                  <View style={styles.pendingItemFooter}>
                    <Text style={styles.pendingItemStatus}>Pending Handover</Text>
                    <Text style={styles.pendingItemDate}>Collected {formatDate(item.created_at)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{height: 100}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 4,
  },
  onlineText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  profileCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  scrollBody: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  mainAmount: {
    color: '#10b981',
    fontSize: 36,
    fontWeight: '800',
  },
  subText: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 4,
  },
  pendingListContainer: {
    marginTop: 16,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  pendingItem: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pendingItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pendingItemTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  pendingItemAmount: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '700',
  },
  pendingItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingItemStatus: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  pendingItemDate: {
    color: '#94a3b8',
    fontSize: 12,
  },
});
