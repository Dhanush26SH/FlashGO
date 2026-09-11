import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../theme';
import ProductCard from '../components/ProductCard';
import FloatingCartBar from '../components/FloatingCartBar';
import { useMobileAppContext } from '../context/MobileAppContext';
import { fetchTrendingByTag } from '../services/api';
import { SeasonalConfig } from '../utils/seasonalMerchandising';

export default function SeasonalBrowserScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const config = route.params?.config as SeasonalConfig;
  
  const { servingWarehouseId, cart, updateCart, requireLocationForShopping } = useMobileAppContext();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config && servingWarehouseId) {
      fetchTrendingByTag(servingWarehouseId, config.tag, 50)
        .then(data => {
          setProducts(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [config, servingWarehouseId]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{config?.title || 'Seasonal Favourites'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : products.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No products available right now.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {products.map((p: any) => (
              <View key={p.id} style={styles.gridItem}>
                <ProductCard 
                  product={p} 
                  quantityInCart={cart[p.id] || 0}
                  onUpdateCart={(id, change) => {
                    if (!requireLocationForShopping()) return;
                    updateCart(id, Math.max(0, (cart[id] || 0) + change));
                  }}
                  cardWidth={'100%' as any}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <FloatingCartBar />
    </View>
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
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    paddingTop: 100,
    alignItems: 'center',
  },
  emptyState: {
    paddingTop: 100,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    marginBottom: 16,
  },
});
