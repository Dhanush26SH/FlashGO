import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Animated } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Plus, Minus, ShoppingBag, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react-native';

import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import ProductCard from '../components/ProductCard';
import FlashTransition from '../components/FlashTransition';
import FloatingCartBar from '../components/FloatingCartBar';

type ProductDetailsRouteProp = RouteProp<RootStackParamList, 'ProductDetails'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProductDetailsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ProductDetailsRouteProp>();
  const { product } = route.params;

  const { cart, updateCart, products, categories, subcategories, requireLocationForShopping } = useMobileAppContext();
  const quantityInCart = cart[product.id] || 0;

  const isAvailable = (product.is_active !== false) && (product.stock_quantity === undefined || product.stock_quantity > 0);
  const [imgError, setImgError] = React.useState(false);
  
  const [infoExpanded, setInfoExpanded] = useState(true);

  // Derived metrics for Floating Cart
  const cartItemsCount = Object.values(cart).reduce((a: number, b: number) => a + b, 0);
  const subtotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = products.find(prod => prod.id === id);
    return sum + (p ? p.price * qty : 0);
  }, 0);
  const deliveryFee = cartItemsCount === 0 ? 0 : (subtotal > 15 ? 0 : 4.99);
  const totalBill = subtotal + deliveryFee; // simplified since no coupon state here

  const category = categories.find(c => c.id === product.category_id);
  const subcategory = subcategories.find(s => s.id === product.subcategory_id);

  // Recommendations logic
  const relatedProducts = products.filter(
    (p: any) => p.category_id === product.category_id && p.id !== product.id && p.image_url
  ).slice(0, 10);

  const alsoBoughtProducts = products.filter(
    (p: any) => {
      if (product.subcategory_id) {
        return p.subcategory_id === product.subcategory_id && p.id !== product.id && p.image_url;
      }
      return p.category_id === product.category_id && p.id !== product.id && p.image_url;
    }
  ).slice(0, 10);

  // Animation states
  const imgOpacity = React.useRef(new Animated.Value(0)).current;
  const imgScale = React.useRef(new Animated.Value(0.94)).current;
  const detailsOpacity = React.useRef(new Animated.Value(0)).current;
  const detailsTranslateY = React.useRef(new Animated.Value(12)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(imgOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(imgScale, {
        toValue: 1,
        speed: 12,
        bounciness: 2,
        useNativeDriver: true,
      }),
      Animated.timing(detailsOpacity, {
        toValue: 1,
        duration: 200,
        delay: 50,
        useNativeDriver: true,
      }),
      Animated.timing(detailsTranslateY, {
        toValue: 0,
        duration: 250,
        delay: 50,
        useNativeDriver: true,
      })
    ]).start();
  }, [imgOpacity, imgScale, detailsOpacity, detailsTranslateY]);

  return (
    <FlashTransition>
      <SafeAreaView style={styles.container}>
        <View style={styles.contentWrapper}>
          <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
            {/* Top Product Section */}
            <Animated.View style={[styles.imageContainer, { opacity: imgOpacity, transform: [{ scale: imgScale }] }]}>
              <TouchableOpacity style={styles.absoluteBackBtn} onPress={() => navigation.goBack()}>
                <ArrowLeft size={24} color="#000" />
              </TouchableOpacity>
            <Image 
              source={(!imgError && product.image_url) ? { uri: product.image_url } : require('../../assets/product-placeholder.png')}
              style={styles.image} 
              resizeMode="contain" 
              onError={() => setImgError(true)}
            />
            {!isAvailable && (
              <View style={styles.overlay}>
                <Text style={styles.overlayText}>Out of Stock</Text>
              </View>
            )}
          </Animated.View>

          {/* Product Details Area */}
          <Animated.View style={[styles.detailsContainer, { opacity: detailsOpacity, transform: [{ translateY: detailsTranslateY }] }]}>
            <Text style={styles.productName}>{product.name}</Text>
            
            <View style={styles.priceRow}>
              <Text style={styles.price}>₹{product.price.toFixed(2)}</Text>
            </View>
          </Animated.View>
          
          <View style={styles.sectionDivider} />

          {/* Top products in this category */}
          {relatedProducts.length > 0 && (
            <View style={styles.recommendationSection}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[styles.recommendationTitle, { marginBottom: 0 }]}>More in this category</Text>
                <TouchableOpacity onPress={() => navigation.navigate('CategoryBrowser' as any, { categoryId: product.category_id })}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 14, marginRight: 16 }}>See all →</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {relatedProducts.map((p: any) => (
                  <View key={p.id} style={{ marginRight: 16 }}>
                    <ProductCard 
                      product={p} 
                      quantityInCart={cart[p.id] || 0}
                      onUpdateCart={(id, change) => {
                        if (change > 0 && !requireLocationForShopping()) return;
                        const newQty = Math.max(0, (cart[id] || 0) + change);
                        updateCart(id, newQty);
                      }}
                      cardWidth={150}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.sectionDivider} />

          {/* You may also like */}
          {alsoBoughtProducts.length > 0 && (
            <View style={styles.recommendationSection}>
              <Text style={styles.recommendationTitle}>Related products</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {alsoBoughtProducts.map((p: any) => (
                  <View key={p.id} style={{ marginRight: 16 }}>
                    <ProductCard 
                      product={p} 
                      quantityInCart={cart[p.id] || 0}
                      onUpdateCart={(id, change) => {
                        if (change > 0 && !requireLocationForShopping()) return;
                        const newQty = Math.max(0, (cart[id] || 0) + change);
                        updateCart(id, newQty);
                      }}
                      cardWidth={150}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.sectionDivider} />

          {/* Product Information */}
          <View style={styles.infoSection}>
            <TouchableOpacity 
              style={styles.infoHeaderRow} 
              onPress={() => setInfoExpanded(!infoExpanded)}
              activeOpacity={0.7}
            >
              <Text style={styles.infoTitle}>Product Information</Text>
              {infoExpanded ? <ChevronUp size={24} color="#111827" /> : <ChevronDown size={24} color="#111827" />}
            </TouchableOpacity>

            {infoExpanded && (
              <View style={styles.infoContent}>
                {product.description ? (
                  <View style={styles.infoBlock}>
                    <Text style={styles.infoLabel}>Description</Text>
                    <Text style={styles.infoText}>{product.description}</Text>
                  </View>
                ) : null}
                
                {category ? (
                  <View style={styles.infoBlock}>
                    <Text style={styles.infoLabel}>Category</Text>
                    <Text style={styles.infoText}>{category.name}</Text>
                  </View>
                ) : null}
                
                {subcategory ? (
                  <View style={styles.infoBlock}>
                    <Text style={styles.infoLabel}>Subcategory</Text>
                    <Text style={styles.infoText}>{subcategory.name}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Sticky Bottom Cart Bar */}
        <View style={styles.footerArea}>
          {isAvailable ? (
            <View style={styles.footerRow}>
              <View style={styles.footerPriceCol}>
                <Text style={styles.footerPriceText}>₹{product.price.toFixed(2)}</Text>
              </View>

              {quantityInCart > 0 ? (
                <View style={styles.compactCounterGroup}>
                  <TouchableOpacity style={styles.compactCounterBtn} onPress={() => updateCart(product.id, quantityInCart - 1)}>
                    <Minus size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.compactCounterText}>{quantityInCart}</Text>
                  <TouchableOpacity style={styles.compactCounterBtn} onPress={() => {
                    if (!requireLocationForShopping()) return;
                    updateCart(product.id, quantityInCart + 1);
                  }}>
                    <Plus size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.compactAddBtn} onPress={() => {
                  if (!requireLocationForShopping()) return;
                  updateCart(product.id, 1);
                }}>
                  <Text style={styles.compactAddBtnText}>ADD TO CART</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.disabledBtn}>
              <Text style={styles.disabledBtnText}>Currently Unavailable</Text>
            </View>
          )}
          </View>
        </View>
      </SafeAreaView>

      <FloatingCartBar bottomOffset={96} />
    </FlashTransition>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  scrollContent: {
    flex: 1,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 380,
    backgroundColor: '#F8F9FA',
    position: 'relative',
    padding: 32,
  },
  absoluteBackBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  overlayText: {
    fontWeight: '800',
    fontSize: 14,
    color: theme.colors.danger,
    backgroundColor: theme.colors.dangerLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden'
  },
  detailsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
  },
  productName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  price: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },
  sectionDivider: {
    height: 8,
    backgroundColor: '#F3F4F6',
    width: '100%',
  },
  recommendationSection: {
    paddingVertical: 20,
    backgroundColor: '#ffffff',
  },
  recommendationTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    paddingHorizontal: 16,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  horizontalScroll: {
    paddingHorizontal: 16,
  },
  infoSection: {
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  infoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  infoContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  infoBlock: {
    marginTop: 16,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  footerArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerPriceCol: {
    justifyContent: 'center',
  },
  footerPriceText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },
  compactAddBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  compactAddBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  compactCounterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  compactCounterBtn: {
    padding: 4,
  },
  compactCounterText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
    marginHorizontal: 20,
  },
  disabledBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledBtnText: {
    color: '#9CA3AF',
    fontWeight: '800',
    fontSize: 16,
  }
});
