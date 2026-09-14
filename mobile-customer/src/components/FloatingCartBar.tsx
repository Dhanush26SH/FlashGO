import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';

interface FloatingCartBarProps {
  onPress?: () => void;
  bottomOffset?: number;
}

export default function FloatingCartBar({ onPress, bottomOffset = 24 }: FloatingCartBarProps) {
  const navigation = useNavigation<any>();
  const { cart, products } = useMobileAppContext();

  const cartItemsCount = Object.values(cart).reduce((a: number, b: number) => a + b, 0);

  if (cartItemsCount === 0) {
    return null;
  }

  const subtotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = products.find(prod => prod.id === id);
    return sum + (p ? p.price * (qty as number) : 0);
  }, 0);

  // Find the last added item's image, or just any item in the cart
  const cartProductIds = Object.keys(cart).filter(id => cart[id] > 0);
  const sampleProductId = cartProductIds[cartProductIds.length - 1];
  const sampleProduct = products.find(p => p.id === sampleProductId);
  const imageUrl = sampleProduct?.image_url || null;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Standard behavior: open cart/checkout sheet if not on home.
      // But we can't easily trigger the sheet from here if it lives on Home.
      // Actually, navigation to a CartScreen if it exists, or just do nothing if not provided and no standard route.
      // In FlashGO, the Cart is often a bottom sheet on Home. Wait, let's look at how it works.
      // On ProductDetails, it calls navigation.goBack() to go home where cart is.
      // I'll emit onPress. If not provided, assume going to Home or a Cart screen.
      navigation.navigate('MainTabs', { screen: 'Home' }); // Fallback
    }
  };

  return (
    <View style={[styles.container, { bottom: bottomOffset }]}>
      <TouchableOpacity style={styles.pill} onPress={handlePress} activeOpacity={0.9}>
        <View style={styles.leftContent}>
          <View style={styles.imageContainer}>
            <Image 
              source={imageUrl ? { uri: imageUrl } : require('../../assets/product-placeholder.png')} 
              style={styles.image} 
              resizeMode="contain" 
            />
          </View>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.title}>View cart</Text>
          <Text style={styles.subtitle}>
            {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'items'} • ₹{subtotal.toFixed(2)}
          </Text>
        </View>

        <View style={styles.rightContent}>
          <ChevronRight size={20} color="#ffffff" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 999, // Pill shape
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    width: '100%',
    maxWidth: 400,
  },
  leftContent: {
    marginRight: 12,
  },
  imageContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: 28,
    height: 28,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  rightContent: {
    marginLeft: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
