import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, SafeAreaView, Platform, Alert, TextInput } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Minus, Plus, Share, Clock, MapPin, Home as HomeIcon, Briefcase, Tag, FileText, ChevronRight, AlertTriangle } from 'lucide-react-native';
import { useMobileAppContext } from '../context/MobileAppContext';
import { getCartCheckoutQuote } from '../services/api';
import { theme } from '../theme';

export default function CartScreen() {
  const navigation = useNavigation<any>();
  const { cart, products, updateCart, activeAddress, checkoutAddress, refreshServerCart } = useMobileAppContext();
  const displayAddress = checkoutAddress || activeAddress;

  const [quote, setQuote] = useState<any>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [deliveryInstruction, setDeliveryInstruction] = useState<string>('');
  const [customInstruction, setCustomInstruction] = useState<string>('');

  const deliveryEtaText = displayAddress 
    ? "Delivery estimate available soon" 
    : "Delivery estimate after address selection";
  const cartItemsCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const cartProducts = Object.entries(cart).map(([id, qty]) => {
    return {
      product: products.find((p: any) => p.id === id),
      quantity: qty as number
    };
  }).filter(item => item.product != null);

  const unavailableCartIds = Object.keys(cart).filter(id => !products.find((p: any) => p.id === id));
  const hasUnavailableItems = unavailableCartIds.length > 0;

  // Recommendations: real catalog products not in cart
  const recommendations = products.filter(p => !cart[p.id]).slice(0, 5);

  useFocusEffect(
    React.useCallback(() => {
      refreshServerCart();
    }, [refreshServerCart])
  );

  useEffect(() => {
    const fetchQuote = async () => {
      if (cartItemsCount === 0 || !displayAddress?.id || hasUnavailableItems) {
        setQuote(null);
        return;
      }
      
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(displayAddress.id);
      if (!isUUID) {
        setQuote(null);
        return;
      }
      
      try {
        const q = await getCartCheckoutQuote(displayAddress.id, couponCode);
        setQuote(q);
      } catch (err) {
        console.error('Error fetching quote:', err);
      }
    };
    
    fetchQuote();
  }, [cart, couponCode, displayAddress?.id, hasUnavailableItems]);

  const getAddressIcon = (label: string) => {
    if (!label) return <MapPin size={20} color={theme.colors.primary} />;
    const l = label.toLowerCase();
    if (l === 'home') return <HomeIcon size={20} color={theme.colors.primary} />;
    if (l === 'work') return <Briefcase size={20} color={theme.colors.primary} />;
    return <MapPin size={20} color={theme.colors.primary} />;
  };

  const getFormattedAddress = (addr: any) => {
    if (!addr) return '';
    const parts = [];
    if (addr.flat_house_no) parts.push(addr.flat_house_no);
    if (addr.street_address) parts.push(addr.street_address);
    else if (addr.address_line) parts.push(addr.address_line);
    if (addr.locality) parts.push(addr.locality);
    if (addr.city) parts.push(addr.city);

    // Filter duplicates and empty values
    return Array.from(new Set(parts.filter(Boolean))).join(', ');
  };

  const handleUpdateQuantity = async (productId: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    await updateCart(productId, newQuantity);
  };

  const clearUnavailableItems = async () => {
    for (const id of unavailableCartIds) {
      await updateCart(id, 0);
    }
  };

  const instructionOptions = ['Leave at door', 'Ring bell', 'Call on arrival', 'Do not ring bell'];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Share size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Delivery Section */}
        <View style={styles.deliverySection}>
          <View style={styles.deliveryIconRow}>
            <Clock size={20} color={theme.colors.primary} />
            <Text style={styles.deliveryEta}>{deliveryEtaText}</Text>
          </View>
          <Text style={styles.deliverySubtext}>Shipment of {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'items'}</Text>
        </View>

        {hasUnavailableItems && (
          <View style={styles.unavailableWarning}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
              <AlertTriangle size={20} color={theme.colors.danger} style={{ marginRight: 8, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.unavailableText}>
                  {unavailableCartIds.length} {unavailableCartIds.length === 1 ? 'item is' : 'items are'} out of stock or unavailable at this location.
                </Text>
                <TouchableOpacity onPress={clearUnavailableItems} style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>Remove unavailable items</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Product List */}
        <View style={styles.cartList}>
          {cartProducts.length === 0 ? (
            <Text style={styles.emptyText}>Your cart is empty.</Text>
          ) : (
            cartProducts.map(({ product, quantity }) => (
              <View key={product.id} style={styles.cartItem}>
                <Image source={{ uri: product.image_url }} style={styles.itemImage} />
                <View style={styles.itemDetails}>
                  <Text style={styles.itemName} numberOfLines={2}>{product.name}</Text>
                  {product.variant ? <Text style={styles.itemVariant}>{product.variant}</Text> : null}
                  <Text style={styles.itemPrice}>₹{product.price.toFixed(2)}</Text>
                </View>
                <View style={styles.quantityControls}>
                  <TouchableOpacity 
                    style={styles.qtyBtn} 
                    onPress={() => handleUpdateQuantity(product.id, quantity - 1)}
                  >
                    <Minus size={16} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{quantity}</Text>
                  <TouchableOpacity 
                    style={styles.qtyBtn} 
                    onPress={() => handleUpdateQuantity(product.id, quantity + 1)}
                  >
                    <Plus size={16} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <View style={styles.recommendationsSection}>
            <Text style={styles.recommendationsTitle}>Before you checkout</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {recommendations.map(product => (
                <View key={product.id} style={styles.recCard}>
                  <Image source={{ uri: product.image_url }} style={styles.recImage} />
                  <Text style={styles.recName} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.recPrice}>₹{(product.discount_price || product.price).toFixed(2)}</Text>
                  <TouchableOpacity 
                    style={styles.recAddBtn}
                    onPress={() => handleUpdateQuantity(product.id, 1)}
                  >
                    <Text style={styles.recAddBtnText}>ADD</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Use Coupons */}
        {cartItemsCount > 0 && (
          <View style={styles.couponSection}>
            <TouchableOpacity style={styles.couponBtn} onPress={() => Alert.alert('Coupons', 'Coupon selection coming soon.')}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Tag size={20} color={theme.colors.primary} style={{ marginRight: 12 }} />
                <Text style={styles.couponBtnText}>Use Coupons</Text>
              </View>
              <ChevronRight size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Delivery Instructions */}
        {cartItemsCount > 0 && (
          <View style={styles.instructionsSection}>
            <Text style={styles.sectionTitle}>Delivery Instructions</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
              {instructionOptions.map(opt => (
                <TouchableOpacity 
                  key={opt}
                  style={[styles.instructionBadge, deliveryInstruction === opt && styles.instructionBadgeActive]}
                  onPress={() => setDeliveryInstruction(deliveryInstruction === opt ? '' : opt)}
                >
                  <Text style={[styles.instructionText, deliveryInstruction === opt && styles.instructionTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={styles.customInstructionInput}
              placeholder="Any other instructions? (Optional)"
              placeholderTextColor={theme.colors.textMuted}
              value={customInstruction}
              onChangeText={setCustomInstruction}
            />
          </View>
        )}

        {/* Bill Details */}
        {quote && (
          <View style={styles.billSection}>
            <Text style={styles.sectionTitle}>Bill Details</Text>
            
            <View style={styles.billRow}>
              <View style={styles.billRowIcon}>
                <FileText size={16} color={theme.colors.textMuted} />
                <Text style={styles.billRowLabel}>Items Total</Text>
              </View>
              <Text style={styles.billRowValue}>₹{quote.requested_subtotal?.toFixed(2) || '0.00'}</Text>
            </View>

            {quote.delivery_fee > 0 && (
              <View style={styles.billRow}>
                <View style={styles.billRowIcon}>
                  <Text style={styles.billRowLabel}>Delivery Fee</Text>
                </View>
                <Text style={styles.billRowValue}>₹{quote.delivery_fee?.toFixed(2) || '0.00'}</Text>
              </View>
            )}

            {quote.discount_amount > 0 && (
              <View style={styles.billRow}>
                <View style={styles.billRowIcon}>
                  <Text style={[styles.billRowLabel, { color: theme.colors.primary }]}>Coupon Discount</Text>
                </View>
                <Text style={[styles.billRowValue, { color: theme.colors.primary }]}>-₹{quote.discount_amount?.toFixed(2) || '0.00'}</Text>
              </View>
            )}
            
            {/* Wallet Applied would go here if wallet logic is handled at quote level */}

            <View style={styles.billDivider} />
            
            <View style={styles.billTotalRow}>
              <Text style={styles.billTotalLabel}>Grand Total</Text>
              <Text style={styles.billTotalValue}>₹{quote.total_payable?.toFixed(2) || '0.00'}</Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Sticky Bottom CTA */}
      <View style={styles.footer}>
        {!displayAddress || displayAddress.id.startsWith('custom_loc_') ? (
          <TouchableOpacity 
            style={[styles.checkoutBtn, (cartItemsCount === 0 || hasUnavailableItems) && styles.checkoutBtnDisabled]}
            disabled={cartItemsCount === 0 || hasUnavailableItems}
            onPress={() => {
              if (displayAddress && displayAddress.id.startsWith('custom_loc_')) {
                navigation.navigate('AddressDetails', {
                  lat: displayAddress.lat,
                  lng: displayAddress.lng,
                  name: displayAddress.locality || displayAddress.label || 'Current Location',
                  address: displayAddress.street_address || 'Current Location'
                });
              } else {
                navigation.navigate('Addresses', { origin: 'checkout_address' });
              }
            }}
          >
            <Text style={styles.checkoutBtnText}>
              {displayAddress ? 'Add address details at next step' : 'Choose address at next step'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View>
            <View style={styles.addressSummaryContainer}>
              <View style={styles.addressSummaryIcon}>
                <MapPin size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.addressSummaryTextCol}>
                <Text style={styles.addressSummaryLabel}>Delivery address</Text>
                <Text style={styles.addressSummaryDetail} numberOfLines={1}>
                  {getFormattedAddress(displayAddress)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Addresses', { origin: 'checkout_address' })}>
                <Text style={styles.addressChangeText}>Change</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity 
              style={[styles.checkoutBtn, (cartItemsCount === 0 || hasUnavailableItems) && styles.checkoutBtnDisabled]}
              disabled={cartItemsCount === 0 || hasUnavailableItems}
              onPress={() => {
                console.log('--- CHECKOUT BUTTON PRESSED ---');
                console.log('displayAddress ID:', displayAddress?.id);
                console.log('hasReceiverName:', !!displayAddress?.receiver_name);
                console.log('hasReceiverPhone:', !!displayAddress?.receiver_phone);

                if (!displayAddress.receiver_name || typeof displayAddress.receiver_name !== 'string' || !displayAddress.receiver_name.trim() || !displayAddress.receiver_phone || typeof displayAddress.receiver_phone !== 'string' || !displayAddress.receiver_phone.trim()) {
                  if (Platform.OS === 'web') {
                    const confirmUpdate = window.confirm('Incomplete Address\n\nThis delivery address needs a receiver name and phone number. Click OK to update it.');
                    if (confirmUpdate) {
                      navigation.navigate('AddressDetails', {
                        lat: displayAddress.lat,
                        lng: displayAddress.lng,
                        name: displayAddress.locality || displayAddress.label || 'Current Location',
                        address: displayAddress.street_address || 'Current Location',
                        existingAddress: displayAddress
                      });
                    }
                  } else {
                    Alert.alert(
                      'Incomplete Address',
                      'This delivery address needs a receiver name and phone number.',
                      [{ 
                        text: 'Update Address', 
                        onPress: () => navigation.navigate('AddressDetails', {
                          lat: displayAddress.lat,
                          lng: displayAddress.lng,
                          name: displayAddress.locality || displayAddress.label || 'Current Location',
                          address: displayAddress.street_address || 'Current Location',
                          existingAddress: displayAddress
                        }) 
                      }]
                    );
                  }
                  return;
                }

                const finalInstruction = [deliveryInstruction, customInstruction].filter(Boolean).join(' | ');
                navigation.navigate('PaymentOptions', { 
                  quote, 
                  couponCode, 
                  deliveryInstruction: finalInstruction 
                });
              }}
            >
              <Text style={styles.checkoutBtnText}>Select payment option</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  deliverySection: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  deliveryIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  deliveryEta: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  deliverySubtext: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginLeft: 28,
  },
  cartList: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  unavailableWarning: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#FCA5A5'
  },
  unavailableText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  itemVariant: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  qtyBtn: {
    padding: 6,
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
    paddingHorizontal: 8,
  },
  recommendationsSection: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 16,
  },
  recommendationsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  recScroll: {
    paddingHorizontal: 12,
  },
  recCard: {
    width: 110,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recImage: {
    width: '100%',
    height: 64,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  recName: {
    fontSize: 11,
    color: theme.colors.text,
    fontWeight: '500',
    marginBottom: 2,
    height: 32,
  },
  recVariant: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginBottom: 6,
  },
  recPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  recAddBtn: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  recAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  footer: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  checkoutBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutBtnDisabled: {
    backgroundColor: theme.colors.textMuted,
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  addressSummaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addressSummaryIcon: {
    marginRight: 12,
  },
  addressSummaryTextCol: {
    flex: 1,
  },
  addressSummaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  addressSummaryDetail: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  addressChangeText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
    marginLeft: 12,
  },
  couponSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  couponBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  couponBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  instructionsSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  instructionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
    backgroundColor: theme.colors.surface,
  },
  instructionBadgeActive: {
    backgroundColor: '#F0FDF4',
    borderColor: theme.colors.primary,
  },
  instructionText: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '500',
  },
  instructionTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  customInstructionInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: '#F9FAFB',
    marginTop: 12,
  },
  billSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: theme.colors.surface,
    marginBottom: 16,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  billRowIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billRowLabel: {
    fontSize: 14,
    color: theme.colors.text,
    marginLeft: 8,
  },
  billRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  billDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  billTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  billTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  billTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  }
});
