import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Pressable, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { theme } from '../theme';
import { Plus, Minus } from 'lucide-react-native';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    price: number;
    image_url: string;
    stock_quantity?: number;
    is_active?: boolean;
  };
  quantityInCart: number;
  onUpdateCart: (id: string, change: number) => void;
  cardWidth: number;
  animateOnPress?: boolean;
}

export default function ProductCard({ product, quantityInCart, onUpdateCart, cardWidth, animateOnPress = false }: ProductCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isAvailable = (product.is_active !== false) && (product.stock_quantity === undefined || product.stock_quantity > 0);
  const [imgError, setImgError] = React.useState(false);

  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!animateOnPress) return;
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    if (!animateOnPress) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  const lastPress = React.useRef(0);

  const navigateToDetails = () => {
    const now = Date.now();
    if (now - lastPress.current < 500) return;
    lastPress.current = now;
    navigation.navigate('ProductDetails', { product });
  };

  return (
    <Animated.View style={[styles.card, { width: cardWidth, transform: [{ scale: scaleAnim }] }]}>
      <Pressable 
        onPress={navigateToDetails}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={styles.imageContainer}>

          <Image 
            source={(!imgError && product.image_url) ? { uri: product.image_url } : require('../../assets/product-placeholder.png')}
            style={styles.image} 
            resizeMode="cover" 
            onError={() => setImgError(true)}
          />
          {!isAvailable && (
            <View style={styles.overlay}>
              <Text style={styles.overlayText}>Out of Stock</Text>
            </View>
          )}
        </View>

        <View style={styles.contentTop}>
          <Text style={styles.title} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.unit}>1 pc</Text>
        </View>
      </Pressable>
      
      <View style={styles.contentBottom}>
        <View style={styles.footer}>
          <Text style={styles.price}>₹{product.price.toFixed(2)}</Text>
          
          {isAvailable ? (
            quantityInCart > 0 ? (
              <View style={styles.counterGroup}>
                <TouchableOpacity style={styles.counterBtn} onPress={() => onUpdateCart(product.id, -1)}>
                  <Minus size={14} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.counterText}>{quantityInCart}</Text>
                <TouchableOpacity style={styles.counterBtn} onPress={() => onUpdateCart(product.id, 1)}>
                  <Plus size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addBtn} onPress={() => onUpdateCart(product.id, 1)}>
                <Text style={styles.addBtnText}>ADD</Text>
              </TouchableOpacity>
            )
          ) : (
            <View style={styles.disabledBtn}>
              <Text style={styles.disabledBtnText}>N/A</Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    paddingBottom: 8,
  },
  imageContainer: {
    aspectRatio: 1,
    width: '100%',
    backgroundColor: '#F8F9FA',
    position: 'relative',
    padding: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.sm,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  overlayText: {
    fontWeight: '800',
    color: theme.colors.danger,
    backgroundColor: theme.colors.dangerLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
  },
  contentTop: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  contentBottom: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
    lineHeight: 18,
    minHeight: 36,
  },
  unit: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  price: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  addBtn: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: {
    color: theme.colors.primaryDark,
    fontWeight: '800',
    fontSize: 12,
  },
  counterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  counterBtn: {
    padding: 4,
  },
  counterText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    marginHorizontal: 8,
  },
  disabledBtn: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  disabledBtnText: {
    color: '#9CA3AF',
    fontWeight: '700',
    fontSize: 11,
  }
});
