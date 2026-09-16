import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, SafeAreaView, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchOrders } from '../services/api';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import ProductCard from '../components/ProductCard';
import FloatingCartBar from '../components/FloatingCartBar';
import FlashGoPageEnd from '../components/FlashGoPageEnd';

export default function OrderAgainScreen() {
  const [loading, setLoading] = useState(true);
  const [pastProducts, setPastProducts] = useState<any[]>([]);
  const [bestSellers, setBestSellers] = useState<any[]>([]);
  const { products, cart, updateCart, requireLocationForShopping, servingWarehouseId, sessionUser } = useMobileAppContext();

  useEffect(() => {
    if (sessionUser) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [products, servingWarehouseId, sessionUser]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const orders = await fetchOrders();
      
      const d = new Date();
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      const day = ist.getDay();
      const diff = ist.getDate() - day + (day === 0 ? -6 : 1);
      ist.setDate(diff);
      ist.setHours(0, 0, 0, 0);
      const mondayUTC = new Date(ist.getTime() - (3600000 * 5.5));

      const uniqueProductIds = new Set<string>();
      orders.forEach((o: any) => {
        if (o.status === 'delivered') {
          const orderDate = new Date(o.created_at);
          if (orderDate >= mondayUTC) {
            if (o.order_items) {
              o.order_items.forEach((item: any) => {
                uniqueProductIds.add(item.product_id);
              });
            }
          }
        }
      });

      const availablePastProducts = products.filter((p: any) => 
        uniqueProductIds.has(p.id) && p.is_active
      );
      setPastProducts(availablePastProducts);

      if (servingWarehouseId) {
        const { data, error } = await supabase.rpc('get_weekly_best_sellers', { p_warehouse_id: servingWarehouseId });
        if (!error && data) {
          const bsProducts = [];
          for (const item of data) {
            const product = products.find(p => p.id === item.product_id);
            if (product && product.is_active) {
              bsProducts.push(product);
            }
          }
          setBestSellers(bsProducts);
        }
      }

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
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Your Purchases This Week</Text>
          {pastProducts.length > 0 ? (
            <View style={styles.productGrid}>
              {pastProducts.map(item => (
                <View key={item.id} style={styles.gridItem}>
                  <ProductCard 
                    product={item} 
                    quantityInCart={cart[item.id] || 0}
                    onUpdateCart={(id, change) => {
                      if (!requireLocationForShopping()) return;
                      updateCart(id, Math.max(0, (cart[id] || 0) + change));
                    }}
                    cardWidth={'100%' as any}
                    variant="compact"
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Reordering will be easy</Text>
              <Text style={styles.emptySub}>Items you order this week will show up here so you can buy them again easily.</Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Best Sellers This Week</Text>
          {!servingWarehouseId ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptySub}>Choose a delivery location to see best sellers near you.</Text>
            </View>
          ) : bestSellers.length > 0 && (
            <View style={styles.productGrid}>
              {bestSellers.map(item => (
                <View key={`bs-${item.id}`} style={styles.gridItem}>
                  <ProductCard 
                    product={item} 
                    quantityInCart={cart[item.id] || 0}
                    onUpdateCart={(id, change) => {
                      if (!requireLocationForShopping()) return;
                      updateCart(id, Math.max(0, (cart[id] || 0) + change));
                    }}
                    cardWidth={'100%' as any}
                    variant="compact"
                  />
                </View>
              ))}
            </View>
          )}

          <FlashGoPageEnd />
        </ScrollView>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '32%',
    marginBottom: 12,
  },
  emptyBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  emptySub: {
    marginTop: 8,
    color: '#6B7280',
    textAlign: 'center',
    fontSize: 14,
  }
});
