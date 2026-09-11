import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { X, Search } from 'lucide-react-native';

import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import ProductCard from '../components/ProductCard';
import FlashTransition from '../components/FlashTransition';
import FloatingCartBar from '../components/FloatingCartBar';

type CategoryBrowserRouteProp = RouteProp<RootStackParamList, 'CategoryBrowser'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CategoryBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CategoryBrowserRouteProp>();
  const { categoryId } = route.params;

  const { products, categories, subcategories, cart, updateCart, requireLocationForShopping } = useMobileAppContext();
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  const category = categories.find((c: any) => c.id === categoryId);

  const filteredProducts = products.filter((p: any) => {
    if (selectedSubcategory) return p.subcategory_id === selectedSubcategory;
    return p.category_id === categoryId;
  });

  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <FlashTransition>
      <View style={styles.modalBackdrop}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.modalBackdropTouch} />
        </TouchableWithoutFeedback>
      
      <View style={styles.bottomSheetContainer}>
        <TouchableOpacity style={styles.closeFloatingBtn} onPress={handleClose}>
          <X size={24} color="#000" />
        </TouchableOpacity>

        <View style={styles.bottomSheetContent}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {category?.name || 'Category'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flex: 1, paddingHorizontal: 16 }}>
            {/* Left sidebar: Subcategories */}
            <View style={{ width: 85, backgroundColor: '#F3F4F6', borderRadius: 12, marginRight: 12, paddingVertical: 8, height: '100%' }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <TouchableOpacity 
                  style={[styles.subcatBtn, !selectedSubcategory && styles.subcatBtnActive]}
                  onPress={() => setSelectedSubcategory(null)}
                >
                  <Text style={[styles.subcatText, !selectedSubcategory && styles.subcatTextActive]}>All</Text>
                </TouchableOpacity>
                {subcategories
                  .filter(s => s.category_id === categoryId)
                  .map(sub => (
                  <TouchableOpacity 
                    key={sub.id}
                    style={[styles.subcatBtn, selectedSubcategory === sub.id && styles.subcatBtnActive]}
                    onPress={() => setSelectedSubcategory(sub.id)}
                  >
                    <Text style={[styles.subcatText, selectedSubcategory === sub.id && styles.subcatTextActive]}>{sub.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Right section: Products */}
            <View style={{ flex: 1 }}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {filteredProducts.length === 0 ? (
                  <View style={[styles.emptyState, { marginTop: 24, paddingVertical: 40 }]}>
                    <Search size={40} color={theme.colors.textMuted} />
                    <Text style={styles.emptyStateTitle}>No products found</Text>
                  </View>
                ) : (
                  <View style={styles.productGrid}>
                    {filteredProducts.map((p: any) => (
                      <View key={p.id} style={styles.gridItem}>
                        <ProductCard 
                          product={p} 
                          quantityInCart={cart[p.id] || 0}
                          onUpdateCart={(id, change) => {
                            if (!requireLocationForShopping()) return;
                            updateCart(id, Math.max(0, (cart[id] || 0) + change));
                          }}
                          cardWidth={'100%' as any}
                          animateOnPress={true}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
      
      <FloatingCartBar />
    </View>
    </FlashTransition>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalBackdropTouch: {
    flex: 1,
    width: '100%',
  },
  bottomSheetContainer: {
    height: '88%',
    width: '100%',
    alignItems: 'center',
  },
  closeFloatingBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomSheetContent: {
    flex: 1,
    backgroundColor: '#ffffff',
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingTop: 8,
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  subcatBtn: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  subcatBtnActive: {
    backgroundColor: '#ffffff',
    borderLeftColor: theme.colors.primary,
  },
  subcatText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'center',
  },
  subcatTextActive: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    marginBottom: 16,
  }
});
