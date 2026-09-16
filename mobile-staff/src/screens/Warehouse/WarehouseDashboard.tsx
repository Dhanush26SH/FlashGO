import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LayoutDashboard, AlertTriangle, AlertCircle, TrendingUp, Package } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function WarehouseDashboard() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [warehouseName, setWarehouseName] = useState('Unknown Warehouse');
  const [stats, setStats] = useState({
    totalSkus: 0,
    lowStock: 0,
    outOfStock: 0,
    expiringBatches: 0,
    todayActivity: 0
  });

  const [activeOrder, setActiveOrder] = useState<any>(null);

  const fetchDashboardData = async () => {
    if (!profile?.warehouse_id) {
      setLoading(false);
      return;
    }

    try {
      // 0. Check for Active Picking Task
      const { data: orderData } = await supabase
        .from('orders')
        .select('id, status, bag_number, order_items(count)')
        .eq('picker_id', profile.id)
        .in('status', ['placed', 'picking'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      setActiveOrder(orderData || null);

      // 1. Warehouse Info
      const { data: wData } = await supabase
        .from('warehouses')
        .select('name')
        .eq('id', profile.warehouse_id)
        .single();
      if (wData) setWarehouseName(wData.name);

      // 2. Stock Levels
      const { data: stockData } = await supabase
        .from('warehouse_stock')
        .select('quantity')
        .eq('warehouse_id', profile.warehouse_id);
      
      let totalSkus = 0;
      let lowStock = 0;
      let outOfStock = 0;
      
      if (stockData) {
        totalSkus = stockData.length;
        stockData.forEach(item => {
          if (item.quantity === 0) outOfStock++;
          else if (item.quantity < 15) lowStock++; // Using 15 as low stock threshold
        });
      }

      // 3. Expiring Batches
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const { count: expCount } = await supabase
        .from('product_batches')
        .select('*', { count: 'exact', head: true })
        .eq('warehouse_id', profile.warehouse_id)
        .eq('status', 'active')
        .lte('expiry_date', nextMonth.toISOString());

      // 4. Today's Activity
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: activityCount } = await supabase
        .from('stock_ledgers')
        .select('*', { count: 'exact', head: true })
        .eq('warehouse_id', profile.warehouse_id)
        .gte('created_at', today.toISOString());

      setStats({
        totalSkus,
        lowStock,
        outOfStock,
        expiringBatches: expCount || 0,
        todayActivity: activityCount || 0
      });

    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    if (profile?.warehouse_id) {
      const channelName = `dashboard_ws_${profile.warehouse_id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const channel = supabase.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock', filter: `warehouse_id=eq.${profile.warehouse_id}` }, fetchDashboardData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product_batches', filter: `warehouse_id=eq.${profile.warehouse_id}` }, fetchDashboardData)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_ledgers', filter: `warehouse_id=eq.${profile.warehouse_id}` }, fetchDashboardData)
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile?.warehouse_id]);

  if (!profile?.warehouse_id) {
    return (
      <View style={styles.centerContainer}>
        <AlertCircle size={48} color="#ef4444" />
        <Text style={styles.errorText}>No warehouse assigned.</Text>
        <Text style={styles.errorSub}>Contact your administrator.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LayoutDashboard size={24} color="#10b981" />
          <View>
            <Text style={styles.headerTitle}>Dashboard</Text>
            <Text style={styles.headerSub}>{warehouseName}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {activeOrder && (
          <>
            <Text style={[styles.sectionTitle, { color: '#ef4444' }]}>Urgent Task</Text>
            <View style={[styles.statCard, { borderColor: '#ef4444', borderWidth: 2, marginBottom: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Package size={20} color="#ef4444" style={{ marginRight: 8 }} />
                <Text style={[styles.statLabel, { color: '#ef4444', fontWeight: 'bold' }]}>FALLBACK PICKING ASSIGNED</Text>
              </View>
              <Text style={styles.statValue}>Order #{activeOrder.id.substring(0, 8).toUpperCase()}</Text>
              <Text style={{ color: '#64748b', marginTop: 4 }}>Items: {activeOrder.order_items?.[0]?.count || 0} • Status: {activeOrder.status}</Text>
              
              <TouchableOpacity 
                style={[styles.outlineBtn, { backgroundColor: '#ef4444', borderColor: '#ef4444', marginTop: 12 }]} 
                onPress={async () => {
                  if (activeOrder.status === 'placed') {
                    await supabase.from('orders').update({ status: 'picking' }).eq('id', activeOrder.id);
                  }
                  navigation.navigate('Scanner', { orderId: activeOrder.id, type: 'picking' });
                }}
              >
                <Text style={[styles.outlineBtnText, { color: '#ffffff' }]}>
                  {activeOrder.status === 'picking' ? 'Continue Picking' : 'Start Picking'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Overview</Text>
        
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total SKUs</Text>
            <Text style={styles.statValue}>{stats.totalSkus}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Today's Activity</Text>
            <Text style={[styles.statValue, { color: '#3b82f6' }]}>{stats.todayActivity}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Alerts</Text>
        
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <AlertTriangle size={20} color="#f59e0b" />
            <Text style={styles.alertTitle}>Low Stock Items</Text>
          </View>
          <Text style={styles.alertDesc}>
            {stats.lowStock} products are running low (below 15 units).
          </Text>
        </View>

        <View style={[styles.alertCard, { borderColor: '#ef4444' }]}>
          <View style={styles.alertHeader}>
            <AlertCircle size={20} color="#ef4444" />
            <Text style={[styles.alertTitle, { color: '#ef4444' }]}>Out of Stock</Text>
          </View>
          <Text style={styles.alertDesc}>
            {stats.outOfStock} products are completely depleted.
          </Text>
        </View>

        <View style={[styles.alertCard, { borderColor: '#8b5cf6' }]}>
          <View style={styles.alertHeader}>
            <TrendingUp size={20} color="#8b5cf6" />
            <Text style={[styles.alertTitle, { color: '#8b5cf6' }]}>Expiring Batches</Text>
          </View>
          <Text style={styles.alertDesc}>
            {stats.expiringBatches} active batches expire within 30 days.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712'
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#030712',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold'
  },
  headerSub: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600'
  },
  scrollBody: {
    padding: 16
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center'
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 8
  },
  statValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold'
  },
  alertCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  alertTitle: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: 'bold'
  },
  alertDesc: {
    color: '#94a3b8',
    fontSize: 14
  },
  errorText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center'
  },
  errorSub: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center'
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 2,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    color: '#1f2937',
    fontSize: 14,
    fontWeight: '600',
  },
});
