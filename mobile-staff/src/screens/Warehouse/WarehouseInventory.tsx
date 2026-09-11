import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Search, MapPin, Package, AlertCircle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface InventoryItem {
  product_id: string;
  name: string;
  barcode: string | null;
  physical_quantity: number;
  reserved_quantity: number;
  sellable_quantity: number;
  location: string | null;
}

export default function WarehouseInventory() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchInventory = async () => {
    if (!profile?.warehouse_id) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch physical stock and product details
      const { data: stockData, error: stockErr } = await supabase
        .from('warehouse_stock')
        .select(`
          quantity,
          product_id,
          products (name, barcode)
        `)
        .eq('warehouse_id', profile.warehouse_id);
      
      if (stockErr) throw stockErr;

      // 2. Fetch locations
      const { data: locations, error: locErr } = await supabase
        .from('inventory_locations')
        .select('product_id, aisle, rack, shelf')
        .eq('warehouse_id', profile.warehouse_id);

      if (locErr) throw locErr;

      const locMap = new Map();
      (locations || []).forEach(loc => {
        const parts = [loc.aisle, loc.rack, loc.shelf].filter(Boolean);
        if (parts.length) {
          locMap.set(loc.product_id, parts.join('-'));
        }
      });

      // 3. Fetch active reservations
      const { data: reservations, error: resErr } = await supabase
        .from('inventory_reservations')
        .select('product_id, quantity')
        .eq('warehouse_id', profile.warehouse_id)
        .eq('status', 'reserved');

      if (resErr) {
        console.warn("Failed to fetch reservations:", resErr);
      }

      const resMap = new Map();
      (reservations || []).forEach(res => {
        const prev = resMap.get(res.product_id) || 0;
        resMap.set(res.product_id, prev + res.quantity);
      });

      const items: InventoryItem[] = (stockData || []).map((s: any) => {
        const physical = s.quantity || 0;
        const reserved = resMap.get(s.product_id) || 0;
        return {
          product_id: s.product_id,
          name: s.products?.name || 'Unknown',
          barcode: s.products?.barcode || null,
          physical_quantity: physical,
          reserved_quantity: reserved,
          sellable_quantity: Math.max(0, physical - reserved),
          location: locMap.get(s.product_id) || 'Unassigned'
        };
      });

      // Sort by name
      items.sort((a, b) => a.name.localeCompare(b.name));
      setInventory(items);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    
    if (profile?.warehouse_id) {
      const channel = supabase.channel(`inventory-ws-${profile.warehouse_id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock', filter: `warehouse_id=eq.${profile.warehouse_id}` }, fetchInventory)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_reservations', filter: `warehouse_id=eq.${profile.warehouse_id}` }, fetchInventory)
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
      </View>
    );
  }

  const filteredInventory = inventory.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (i.barcode && i.barcode.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.productName}>{item.name}</Text>
        {item.barcode && <Text style={styles.barcodeText}>{item.barcode}</Text>}
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Physical</Text>
          <Text style={styles.metricValue}>{item.physical_quantity}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Reserved</Text>
          <Text style={[styles.metricValue, { color: '#f59e0b' }]}>{item.reserved_quantity}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Sellable</Text>
          <Text style={[styles.metricValue, { color: '#10b981' }]}>{item.sellable_quantity}</Text>
        </View>
      </View>

      <View style={styles.locationRow}>
        <MapPin size={14} color="#94a3b8" />
        <Text style={styles.locationText}>{item.location}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Live Inventory</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={20} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or barcode..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : filteredInventory.length === 0 ? (
        <View style={styles.centerContainer}>
          <Package size={48} color="#334155" />
          <Text style={styles.emptyText}>No inventory found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredInventory}
          keyExtractor={(item) => item.product_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#030712' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  searchContainer: { padding: 16, backgroundColor: '#030712' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, paddingHorizontal: 12, height: 48 },
  searchInput: { flex: 1, color: '#f8fafc', fontSize: 16, marginLeft: 8 },
  listContent: { padding: 16, gap: 12 },
  card: { backgroundColor: '#0f172a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e293b' },
  cardHeader: { marginBottom: 12 },
  productName: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  barcodeText: { color: '#64748b', fontSize: 12, marginTop: 4 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, backgroundColor: '#030712', borderRadius: 8, padding: 12 },
  metric: { flex: 1, alignItems: 'center' },
  metricLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  metricValue: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  errorText: { color: '#ffffff', fontSize: 16, marginTop: 16 },
  emptyText: { color: '#64748b', fontSize: 16, marginTop: 16 }
});
