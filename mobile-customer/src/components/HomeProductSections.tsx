import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useMobileAppContext } from '../context/MobileAppContext';
import { getCustomerWeeklyPurchases, getWeeklyBestSellers } from '../services/api';
import ProductCard from './ProductCard';

export default function HomeProductSections() {
  const { sessionUser, products, servingWarehouseId, cart, updateCart, requireLocationForShopping } = useMobileAppContext();
  const [weeklyPurchases, setWeeklyPurchases] = useState<any[]>([]);
  const [bestSellers, setBestSellers] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [sessionUser?.id, servingWarehouseId, products]);

  const loadData = async () => {
    try {
      const bestSellerIds = servingWarehouseId 
        ? await getWeeklyBestSellers(servingWarehouseId)
        : [];
      
      const purchaseIds = sessionUser?.id 
        ? await getCustomerWeeklyPurchases()
        : [];
        
      const availableBestSellers = bestSellerIds
        .map((id: string) => products.find((p: any) => p.id === id && p.is_active))
        .filter(Boolean);
        
      const availablePurchases = purchaseIds
        .map((id: string) => products.find((p: any) => p.id === id && p.is_active))
        .filter(Boolean);
        
      setBestSellers(availableBestSellers);
      setWeeklyPurchases(availablePurchases);
    } catch (err) {
      console.error('Failed to load home product sections', err);
    }
  };

  const renderGrid = (items: any[]) => {
    return (
      <View style={styles.grid}>
        {items.map(item => (
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
    );
  };

  if (weeklyPurchases.length === 0 && bestSellers.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {sessionUser && weeklyPurchases.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.title}>Your Purchases This Week</Text>
          {renderGrid(weeklyPurchases)}
        </View>
      )}
      
      {bestSellers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.title}>Bestsellers in your area</Text>
          {renderGrid(bestSellers)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    backgroundColor: '#FAF9F6',
    borderTopWidth: 8,
    borderTopColor: '#F9FAFB',
    paddingVertical: 16,
  },
  section: {
    marginBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  gridItem: {
    width: '32%',
    marginBottom: 16,
  }
});
