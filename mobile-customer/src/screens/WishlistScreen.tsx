import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Heart, ShoppingBag } from 'lucide-react-native';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import ProductCard from '../components/ProductCard';
import FlashGoPageEnd from '../components/FlashGoPageEnd';
import { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function WishlistScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  
  const { products, cart, updateCart, wishlistProductIds } = useMobileAppContext();

  const wishlistedProducts = useMemo(() => {
    return products.filter(p => wishlistProductIds.has(p.id));
  }, [products, wishlistProductIds]);

  const numColumns = isDesktop ? 4 : 3;
  const cardWidth = ((isDesktop ? Math.min(width, 1200) : width) - (theme.spacing.md * 2) - (theme.spacing.sm * (numColumns - 1))) / numColumns;

  return (
    <View style={styles.container}>
      <View style={[styles.header, isDesktop && styles.headerDesktop]}>
        {!isDesktop && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={24} color="#000" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>My Wishlist</Text>
      </View>

      {wishlistedProducts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Heart size={64} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
          <Text style={styles.emptySubtitle}>Save items you love to view them later.</Text>
          <TouchableOpacity 
            style={styles.browseBtn}
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Home' })}
          >
            <Text style={styles.browseBtnText}>Start Browsing</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={[
            styles.scrollContent,
            isDesktop && styles.scrollContentDesktop
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.productGrid}>
            {wishlistedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                quantityInCart={cart[product.id] || 0}
                onUpdateCart={updateCart}
                cardWidth={cardWidth}
                variant={!isDesktop ? "compact" : "default"}
              />
            ))}
          </View>
          <FlashGoPageEnd />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  headerDesktop: {
    paddingHorizontal: '20%',
    paddingVertical: theme.spacing.lg,
  },
  backBtn: {
    padding: theme.spacing.xs,
    marginRight: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: 100,
  },
  scrollContentDesktop: {
    paddingHorizontal: '20%',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  browseBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  browseBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  }
});
