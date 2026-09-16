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
import FlashGoPageEnd from '../components/FlashGoPageEnd';

type DepartmentBrowserRouteProp = RouteProp<RootStackParamList, 'DepartmentBrowser'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function DepartmentBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DepartmentBrowserRouteProp>();
  const { departmentName, categoryNames, filterTag, filterOrigin } = route.params;

  const { products, categories, cart, updateCart, requireLocationForShopping } = useMobileAppContext();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const matchingCategories = categoryNames ? categories.filter((c: any) => categoryNames.includes(c.name)) : [];
  const matchingCategoryIds = matchingCategories.map((c: any) => c.id);

  const filteredProducts = products.filter((p: any) => {
    if (filterTag) {
      if (!p.tags || !p.tags.includes(filterTag)) return false;
    }
    if (filterOrigin === 'imported') {
      if (!p.country_of_origin || p.country_of_origin === 'India') return false;
    }
    
    if (categoryNames) {
      if (selectedCategoryId) return p.category_id === selectedCategoryId;
      return matchingCategoryIds.includes(p.category_id);
    }
    
    return true;
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
              {departmentName || 'Department'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flex: 1, paddingHorizontal: 16 }}>
            {/* Left sidebar: Categories (Only show if categoryNames was provided) */}
            {matchingCategories.length > 0 && (
              <View style={{ width: 85, backgroundColor: '#F3F4F6', borderRadius: 12, marginRight: 12, paddingVertical: 8, height: '100%' }}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <TouchableOpacity 
                    style={[styles.subcatBtn, !selectedCategoryId && styles.subcatBtnActive]}
                    onPress={() => setSelectedCategoryId(null)}
                  >
                    <Text style={[styles.subcatText, !selectedCategoryId && styles.subcatTextActive]}>All</Text>
                  </TouchableOpacity>
                  {matchingCategories.map((cat: any) => (
                    <TouchableOpacity 
                      key={cat.id}
                      style={[styles.subcatBtn, selectedCategoryId === cat.id && styles.subcatBtnActive]}
                      onPress={() => setSelectedCategoryId(cat.id)}
                    >
                      <Text style={[styles.subcatText, selectedCategoryId === cat.id && styles.subcatTextActive]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
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
                <FlashGoPageEnd />
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
