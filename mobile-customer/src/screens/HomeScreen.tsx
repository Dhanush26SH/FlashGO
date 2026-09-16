import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions, Alert, Image, BackHandler, Modal, TouchableWithoutFeedback, Animated, ActivityIndicator } from 'react-native';
import { Search, ChevronRight, User, ShoppingBag, Sparkles, X, Bell, ArrowLeft, MapPin, LayoutGrid, Smartphone, Heart, Gift, Baby, Home, Globe, ChevronLeft } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import ProductCard from '../components/ProductCard';
import CartSheet from '../components/CartSheet';
import { useMobileAppContext } from '../context/MobileAppContext';
import { processCheckout, getCoupons } from '../services/api';
import { RootStackParamList } from '../navigation/AppNavigator';
import UnserviceableAreaScreen from './UnserviceableAreaScreen';
import FlashTransition from '../components/FlashTransition';
import FloatingCartBar from '../components/FloatingCartBar';
import { getActiveMerchandising, SeasonalConfig } from '../utils/seasonalMerchandising';
import { fetchTrendingByTag } from '../services/api';
import ActiveOrderBanner from '../components/ActiveOrderBanner';
import FlashGoPageEnd from '../components/FlashGoPageEnd';
import HomeProductSections from '../components/HomeProductSections';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const LAYOUT_SECTIONS = [
  {
    title: "Shop by Category",
    categories: [
      "Vegetables & Fruits",
      "Dairy, Bread & Eggs",
      "Atta, Rice & Dal",
      "Chips & Namkeen",
      "Drinks & Juices",
      "Sweets & Chocolates",
    ]
  },
  {
    title: "Grocery & Kitchen",
    categories: [
      "Vegetables & Fruits",
      "Atta, Rice & Dal",
      "Oil, Ghee & Masala",
      "Dairy, Bread & Eggs",
      "Instant Food",
      "Sauces & Spreads",
      "Kitchenware & Appliances",
      "Chicken, Meat & Fish",
    ]
  },
  {
    title: "Snacks & Beverages",
    categories: [
      "Bakery & Biscuits",
      "Chips & Namkeen",
      "Drinks & Juices",
      "Tea, Coffee & Milk Drinks",
      "Sweets & Chocolates",
      "Ice Creams & Frozen Food",
    ]
  },
  {
    title: "Personal Care",
    categories: [
      "Bath & Body",
      "Hair Care",
      "Skin & Face",
      "Beauty & Cosmetics",
      "Feminine Hygiene",
      "Baby Care",
      "Health & Wellness",
    ]
  },
  {
    title: "Home & More",
    categories: [
      "Cleaners & Repellents",
      "Home & Lifestyle",
      "Stationery & Games",
      "Electronics & Accessories",
      "Pet Care",
    ]
  }
];

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 1024;
  const { 
    products, categories, subcategories, cart, updateCart, clearCart, 
    sessionUser, activeAddress, setActiveAddress, addresses, walletBalance, setWalletBalance, refreshAddresses,
    searchQuery,
    setSearchQuery,
    isResolvingLocation,
    servingWarehouseId,
    requireLocationForShopping,
    refreshServerCart
  } = useMobileAppContext();

  useFocusEffect(
    React.useCallback(() => {
      refreshServerCart();
    }, [refreshServerCart])
  );

  const formatHeaderAddress = (addr: any) => {
    if (!addr) return 'Choose location';
    const parts = [];
    if (addr.locality) parts.push(addr.locality);
    if (addr.city) parts.push(addr.city);
    if (parts.length > 0) return parts.join(', ');
    if (addr.street_address) return addr.street_address;
    if (addr.address_line1) return addr.address_line1;
    if (addr.label) return addr.label;
    return 'Choose location';
  };

  // Diagnostic states
  const [catFetchCount, setCatFetchCount] = useState<number | null>(null);
  const [addressStored, setAddressStored] = useState<string | null>(null);
  const [serviceability, setServiceability] = useState<string | null>(null);
  const [productFetchCount, setProductFetchCount] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Seasonal Merchandising State
  const [seasonalConfig, setSeasonalConfig] = useState<SeasonalConfig | null>(null);
  const [seasonalProducts, setSeasonalProducts] = useState<any[]>([]);

  // Horizontal scroll state for departments
  const departmentsScrollRef = React.useRef<ScrollView>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);

  const handleDepartmentsScroll = (event: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    setShowLeftScroll(contentOffset.x > 5);
    setShowRightScroll(contentOffset.x + layoutMeasurement.width < contentSize.width - 5);
  };

  const handleScrollLeft = () => {
    departmentsScrollRef.current?.scrollTo({ x: 0, animated: true });
  };

  const handleScrollRight = () => {
    departmentsScrollRef.current?.scrollToEnd({ animated: true });
  };

  useEffect(() => {
    const config = getActiveMerchandising();
    setSeasonalConfig(config);
  }, []);

  useEffect(() => {
    if (seasonalConfig && servingWarehouseId) {
      fetchTrendingByTag(servingWarehouseId, seasonalConfig.tag, 8)
        .then(data => setSeasonalProducts(data))
        .catch(err => console.error('Failed to fetch seasonal products', err));
    } else {
      setSeasonalProducts([]);
    }
  }, [seasonalConfig, servingWarehouseId]);

  const handleLiveRefresh = async () => {
    try {
      setLastError('NONE');
      // A. fetch active categories directly
      const { data: catData, error: catErr } = await supabase.from('categories').select('*');
      if (catErr) throw catErr;
      setCatFetchCount(catData?.length || 0);

      // B. read activeAddress from AsyncStorage
      const hasAddress = activeAddress ? 'YES' : 'NO';
      setAddressStored(hasAddress);

      // C & D. getServingWarehouse
      if (activeAddress?.lat && activeAddress?.lng) {
        const { data: whData, error: whErr } = await supabase.rpc('get_serving_warehouse', {
          p_lat: activeAddress.lat,
          p_lng: activeAddress.lng
        });
        if (whErr) throw whErr;
        setServiceability(whData || 'NONE');

        // E. fetch products
        if (whData) {
          const { data: prodData, error: prodErr } = await supabase
            .from('warehouse_stock')
            .select('product_id, sellable_quantity, products(*)')
            .eq('warehouse_id', whData)
            .gt('sellable_quantity', 0);
          if (prodErr) throw prodErr;
          setProductFetchCount(prodData?.length || 0);
        } else {
          setProductFetchCount(0);
        }
      } else {
        setServiceability('NO_COORDS');
        setProductFetchCount(0);
      }
    } catch (e: any) {
      setLastError(e.message || 'ERROR');
    }
  };

  const filteredProducts = products.filter((p: any) => {
    if (searchQuery) return p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });

  const discoverProducts = products.filter((p: any) => p.image_url && p.is_active !== false).slice(0, 8);

  const discoverOpacity = React.useRef(new Animated.Value(0)).current;
  const discoverTranslateY = React.useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!searchQuery && discoverProducts.length > 0) {
      Animated.parallel([
        Animated.timing(discoverOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(discoverTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      discoverOpacity.setValue(0);
      discoverTranslateY.setValue(20);
    }
  }, [searchQuery, discoverProducts.length]);


  return (
    <FlashTransition key={activeAddress?.id || 'default'}>
      <View style={styles.container}>
      {/* Mobile Header */}
      {!isDesktop && (
        <View style={styles.header}>
          <View style={styles.headerGlow1} />
          <View style={styles.headerGlow2} />
          <View style={{flexDirection: 'column', flex: 1, zIndex: 2, justifyContent: 'center', paddingRight: 16}}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.primary, letterSpacing: -0.5, marginBottom: 4 }}>FlashGO</Text>
            <TouchableOpacity 
              style={{ justifyContent: 'center' }}
              onPress={() => navigation.navigate('LocationSelector' as any)}
            >
              <View style={styles.deliveryBadgeContainer}>
                <Text style={styles.deliveryBadge}>Delivery to</Text>
              </View>
              <View style={styles.locationRow}>
                <MapPin size={14} color={theme.colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {formatHeaderAddress(activeAddress)}
                </Text>
                <ChevronRight size={16} color={theme.colors.text} style={{ marginTop: 1 }} />
              </View>
            </TouchableOpacity>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', marginLeft: 12}}>
            <TouchableOpacity style={[styles.profileBtn, { marginRight: 8 }]} onPress={() => navigation.navigate('Notifications')}>
              <Bell size={18} color="#111827" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Profile' as any)}>
              <User size={18} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {isDesktop && (
        <View style={[styles.header, styles.desktopHeader]}>
          <View style={styles.headerGlow1} />
          <View style={styles.headerGlow2} />
          <Text style={[styles.desktopLogo, { zIndex: 2 }]}>FlashGO</Text>
          <TouchableOpacity 
            style={[styles.headerLeft, { zIndex: 2 }]}
            onPress={() => navigation.navigate('LocationSelector' as any)}
          >
            <Text style={[styles.deliveryBadge, {color: theme.colors.primary}]}>Delivery to</Text>
            <View style={styles.locationRow}>
              <Text style={[styles.locationText, {color: theme.colors.text}]} numberOfLines={1}>
                {formatHeaderAddress(activeAddress)}
              </Text>
              <ChevronRight size={16} color={theme.colors.text} />
            </View>
          </TouchableOpacity>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <TouchableOpacity style={[styles.profileBtn, {backgroundColor: theme.colors.background, marginRight: 8}]} onPress={() => navigation.navigate('Notifications')}>
              <Bell size={20} color={theme.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.profileBtn, {backgroundColor: theme.colors.background}]} onPress={() => navigation.navigate('Profile' as any)}>
              <User size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Content Area */}
      <View style={styles.contentWrapper}>
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Search size={20} color={theme.colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder='Search products...'
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <X size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ActiveOrderBanner />

        {activeAddress && !isResolvingLocation && servingWarehouseId === null ? (
          <UnserviceableAreaScreen 
            addressString={formatHeaderAddress(activeAddress)}
            onChooseAnotherLocation={() => navigation.navigate('LocationSelector' as any)}
          />
        ) : isResolvingLocation ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 120 }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={{ marginTop: 16, color: '#6B7280', fontWeight: '500' }}>Checking delivery availability...</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            
          {/* Hero Promotional Banner */}
          {!searchQuery && (
            <View style={styles.heroBannerWrapper}>
              <View style={styles.heroBanner}>
                <View style={styles.heroContent}>
                  <View style={styles.heroBadge}>
                    <Sparkles size={14} color="#ffffff" />
                    <Text style={styles.heroBadgeText}>WELCOME TO FLASHGO</Text>
                  </View>
                  <Text style={styles.heroTitle}>Groceries Delivered Fast!</Text>
                  <Text style={styles.heroSubtitle}>Fresh produce, dairy, snacks, and more delivered straight to you.</Text>
                </View>
              </View>
            </View>
          )}

          {/* Shop by Category Collages */}
          {!searchQuery && (
            <View style={styles.categoriesSection}>
              {LAYOUT_SECTIONS.map((section, sIdx) => {
                const sectionCats = section.categories
                  .map(cName => categories.find((c: any) => c.name === cName))
                  .filter(Boolean);
                
                if (sectionCats.length === 0) return null;

                const colCount = 3; // Strict 3-column mobile layout
                const itemWidth = `${100 / colCount}%`;

                return (
                  <View key={sIdx} style={styles.categoryGroup}>
                    <Text style={styles.categoryGroupTitle}>{section.title}</Text>
                    <View style={styles.categoryGridRow}>
                      {sectionCats.map((cat: any) => {
                        const catProducts = products.filter((p: any) => p.category_id === cat.id);
                        
                        // Distinct by product ID (since we already have a list of products, they are distinct, but we slice the first 4)
                        const displayedProducts = catProducts.slice(0, 4);
                        const collageImages = displayedProducts.map((p: any) => p.image_url || null);
                        
                        while (collageImages.length < 4) {
                          collageImages.push(null);
                        }
                        
                        const remainingCount = catProducts.length - 4;

                        return (
                          <TouchableOpacity 
                            key={cat.id} 
                            style={[styles.categoryGridItem, { width: itemWidth as any }]}
                            onPress={() => navigation.navigate('CategoryBrowser' as any, { categoryId: cat.id })}
                          >
                            <View style={styles.collageContainer}>
                              {collageImages.map((imgUrl, idx) => (
                                <View key={idx} style={styles.collageCell}>
                                  <Image 
                                    source={imgUrl ? { uri: imgUrl as string } : require('../../assets/product-placeholder.png')}
                                    style={styles.collageImg}
                                  />
                                </View>
                              ))}
                              {remainingCount > 0 && (
                                <View style={styles.moreBadge}>
                                  <Text style={styles.moreBadgeText}>+{remainingCount} more</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.categoryGridText} numberOfLines={2}>
                              {cat.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Seasonal / Festive Merchandising Section */}
          {!searchQuery && seasonalConfig && seasonalProducts.length > 0 && servingWarehouseId && (
            <Animated.View style={[styles.discoverSection, { opacity: discoverOpacity, transform: [{ translateY: discoverTranslateY }] }]}>
              <View style={[styles.sectionHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.sectionTitle}>{seasonalConfig.title}</Text>
                  <Text style={styles.sectionSubtitle}>{seasonalConfig.subtitle}</Text>
                </View>
                <TouchableOpacity 
                  onPress={() => navigation.navigate('SeasonalBrowser' as any, { config: seasonalConfig })}
                  style={{ paddingTop: 4 }}
                >
                  <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 14 }}>See all →</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {seasonalProducts.map((p: any) => (
                  <View key={p.id} style={{ marginRight: 16 }}>
                    <ProductCard 
                      product={p} 
                      quantityInCart={cart[p.id] || 0}
                      onUpdateCart={(id, change) => {
                        if (!requireLocationForShopping()) return;
                        updateCart(id, Math.max(0, (cart[id] || 0) + change));
                      }}
                      cardWidth={140}
                    />
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Discover More Section */}
          {!searchQuery && discoverProducts.length > 0 && (
            <Animated.View style={[styles.discoverSection, { opacity: discoverOpacity, transform: [{ translateY: discoverTranslateY }] }]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Discover more</Text>
                <Text style={styles.sectionSubtitle}>More essentials you might need</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {discoverProducts.map((p: any) => (
                  <View key={p.id} style={{ marginRight: 16 }}>
                    <ProductCard 
                      product={p} 
                      quantityInCart={cart[p.id] || 0}
                      onUpdateCart={(id, change) => {
                        if (!requireLocationForShopping()) return;
                        updateCart(id, Math.max(0, (cart[id] || 0) + change));
                      }}
                      cardWidth={140}
                    />
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity 
                style={styles.seeAllBtn} 
                onPress={() => navigation.navigate('Categories' as any)}
              >
                <Text style={styles.seeAllBtnText}>See all products →</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Main Product Grid for Search Results */}
          {!!searchQuery && (
            <View style={styles.gridSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Search Results</Text>
              </View>
              
              {filteredProducts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Search size={48} color={theme.colors.textMuted} />
                  <Text style={styles.emptyStateTitle}>No products found</Text>
                  <Text style={styles.emptyStateSub}>We couldn't find anything matching your search. Try a different keyword or category.</Text>
                  <TouchableOpacity style={styles.emptyStateBtn} onPress={() => setSearchQuery('')}>
                    <Text style={styles.emptyStateBtnText}>Clear Search</Text>
                  </TouchableOpacity>
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
                        variant="compact"
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
          
          <HomeProductSections />
          <FlashGoPageEnd />
        </ScrollView>
        )}
      </View>
      {/* Reusable Floating Cart Bar */}
      <FloatingCartBar onPress={() => navigation.navigate('Cart' as any)} />

      </View>
    </FlashTransition>
    );
  }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  contentWrapper: { flex: 1, maxWidth: 1024, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FAF9F6', paddingTop: 40, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  headerGlow1: { position: 'absolute', top: -40, left: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(16, 185, 129, 0.07)' },
  headerGlow2: { position: 'absolute', top: -30, left: 120, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(16, 185, 129, 0.04)' },
  desktopHeader: { backgroundColor: '#FAF9F6', paddingTop: 16, paddingBottom: 16, alignItems: 'center' },
  desktopLogo: { fontSize: 26, fontWeight: '900', color: theme.colors.primary, marginRight: 24, letterSpacing: -0.5 },
  headerLeft: { flex: 1, justifyContent: 'center' },
  deliveryBadgeContainer: { alignSelf: 'flex-start', marginBottom: 2 },
  deliveryBadge: { color: '#6B7280', fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationText: { color: '#111827', fontSize: 15, fontWeight: '800', marginRight: 2, flexShrink: 1, letterSpacing: -0.2 },
  profileBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 16, height: 48 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, height: '100%', fontSize: 15, fontWeight: '500', color: '#111827' },
  categoriesStrip: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  categoryStripItem: { backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  categoryStripText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  departmentItem: { alignItems: 'center', width: 72, marginRight: 8, position: 'relative' },
  departmentIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  departmentText: { fontSize: 12, fontWeight: '600', color: '#4B5563', textAlign: 'center', lineHeight: 14 },
  departmentTextActive: { color: theme.colors.primary, fontWeight: '800' },
  activeIndicator: { position: 'absolute', bottom: -12, width: 24, height: 3, backgroundColor: theme.colors.primary, borderRadius: 2 },
  heroBannerWrapper: { paddingHorizontal: 16, marginTop: 12 },
  heroBanner: { backgroundColor: theme.colors.primary, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, overflow: 'hidden' },
  heroContent: { zIndex: 1 },
  heroBadge: { backgroundColor: 'rgba(0,0,0,0.2)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  heroBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800', marginLeft: 6, letterSpacing: 0.5 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#ffffff', marginBottom: 4, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '500', lineHeight: 20 },
  categoriesSection: { paddingTop: 12, paddingBottom: 16 },
  categoryGroup: { marginBottom: 24 },
  categoryGroupTitle: { fontSize: 18, fontWeight: '800', color: '#111827', paddingHorizontal: 16, marginBottom: 16, letterSpacing: -0.5 },
  categoryGridRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
  categoryGridItem: { paddingHorizontal: 4, marginBottom: 16, alignItems: 'center' },
  collageContainer: { width: '100%', aspectRatio: 1, backgroundColor: '#F3F4F6', borderRadius: 16, padding: 4, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between' },
  collageCell: { width: '48%', height: '48%', backgroundColor: '#ffffff', borderRadius: 8, padding: 4 },
  moreBadge: { position: 'absolute', bottom: -8, alignSelf: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, zIndex: 10 },
  moreBadgeText: { fontSize: 10, fontWeight: '700', color: '#4B5563' },
  collageImg: { width: '100%', height: '100%', resizeMode: 'contain' },
  categoryGridText: { marginTop: 8, fontSize: 13, fontWeight: '700', color: '#1F2937', textAlign: 'center', lineHeight: 16, paddingHorizontal: 4 },
  horizontalSection: { paddingVertical: 20, backgroundColor: '#ffffff', borderTopWidth: 8, borderTopColor: '#F9FAFB' },
  sectionHeader: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111827', letterSpacing: -0.5 },
  sectionSubtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  discoverSection: { paddingVertical: 20, marginHorizontal: 16, marginBottom: 24, marginTop: 12, backgroundColor: '#F4FAF6', borderRadius: 24, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.06)' },
  seeAllBtn: { marginHorizontal: 16, marginTop: 16, paddingVertical: 14, backgroundColor: '#ffffff', borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  seeAllBtnText: { color: '#111827', fontWeight: '700', fontSize: 15 },
  horizontalScroll: { paddingHorizontal: 16 },
  gridSection: { paddingVertical: 20, backgroundColor: '#ffffff', borderTopWidth: 8, borderTopColor: '#F9FAFB' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16 },
  gridItem: { width: '32%', marginBottom: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyStateTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 16, marginBottom: 8 },
  emptyStateSub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyStateBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyStateBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 16 }
});
