import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, SafeAreaView } from 'react-native';
import { RotateCcw } from 'lucide-react-native';
import { fetchOrders } from '../services/api';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import ProductCard from '../components/ProductCard';
import FloatingCartBar from '../components/FloatingCartBar';

export default function OrderAgainScreen() {
  const [loading, setLoading] = useState(true);
  const [pastProducts, setPastProducts] = useState<any[]>([]);
  const { products, cart, updateCart, requireLocationForShopping } = useMobileAppContext();

  useEffect(() => {
    loadPastItems();
  }, [products]);

  const loadPastItems = async () => {
    try {
      setLoading(true);
      const orders = await fetchOrders();
      
      const uniqueProductIds = new Set<string>();
      orders.forEach((o: any) => {
        if (o.order_items) {
          o.order_items.forEach((item: any) => {
            uniqueProductIds.add(item.product_id);
          });
        }
      });

      // Cross-reference with live catalog to get active/current pricing and availability
      const availablePastProducts = products.filter((p: any) => 
        uniqueProductIds.has(p.id) && p.is_active
      );

      setPastProducts(availablePastProducts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order Again</Text>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={pastProducts}
          keyExtractor={p => p.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <ProductCard 
                product={item} 
                quantityInCart={cart[item.id] || 0}
                onUpdateCart={(id, change) => {
                  if (!requireLocationForShopping()) return;
                  updateCart(id, Math.max(0, (cart[id] || 0) + change));
                }}
                cardWidth={'100%' as any}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <RotateCcw size={48} color={theme.colors.border} />
              <Text style={styles.emptyTitle}>Nothing to reorder yet</Text>
              <Text style={styles.emptySub}>Your previously ordered items will appear here once you make a purchase.</Text>
            </View>
          }
        />
      )}
      <FloatingCartBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FAF9F6',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 8,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  gridItem: {
    width: '48%',
    marginBottom: 16,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  emptySub: {
    marginTop: 8,
    color: '#6B7280',
    textAlign: 'center',
  }
});
