import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, CreditCard, Smartphone, Banknote, ChevronRight, CheckCircle2, ShieldCheck } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useMobileAppContext } from '../context/MobileAppContext';
import { processCheckoutV2 } from '../services/api';
import { theme } from '../theme';

export default function PaymentOptionsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { quote, couponCode, deliveryInstruction } = route.params || {};
  const { activeAddress, checkoutAddress, sessionUser, clearCart } = useMobileAppContext();
  
  const [selectedMethod, setSelectedMethod] = useState<'cod' | 'razorpay_google_pay' | 'razorpay_other_upi' | 'razorpay_card' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string>('');

  useEffect(() => {
    if (!idempotencyKeyRef.current && sessionUser?.id) {
      idempotencyKeyRef.current = `checkout_${sessionUser.id}_${Date.now()}`;
    }
  }, [sessionUser?.id]);

  const displayAddress = checkoutAddress || activeAddress;
  const grandTotal = quote?.total_payable || 0;

  const handlePlaceOrder = async () => {
    if (!selectedMethod || !displayAddress || !sessionUser) return;
    if (submitLockRef.current) return;

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(displayAddress.id);
    if (!isUUID) {
      Alert.alert(
        'Incomplete Address',
        'Please save your delivery address before placing the order.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }

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

    submitLockRef.current = true;
    setIsProcessing(true);
    try {
      // Map UI payment method to backend value
      const backendMethod = selectedMethod === 'cod' ? 'cod'
        : selectedMethod === 'razorpay_card' ? 'card'
        : 'upi'; // google_pay and other_upi both map to 'upi'

      // V2: identity from auth.uid(), cart from server, address by ID only
      const orderId = await processCheckoutV2({
        p_address_id:      displayAddress.id,
        p_delivery_speed:  'standard',
        p_payment_method:  backendMethod,
        p_coupon_code:     couponCode ?? null,
        p_idempotency_key: idempotencyKeyRef.current,
      });

      if (selectedMethod === 'cod') {
        // COD: order is immediately placed; clear the cart and navigate
        await clearCart();
        navigation.replace('OrderPlaced', { orderId });
      } else {
        // Prepaid (UPI / Card): order is payment_pending.
        // Cart items were already removed from the server cart by process_checkout_v2.
        await clearCart();
        // Navigate to Razorpay WebView to complete payment.
        navigation.navigate('RazorpayCheckout', { orderId, amount: grandTotal });
      }

    } catch (error: any) {
      const errMsg = error?.message || '';
      if (errMsg.includes('Address is missing receiver name') || errMsg.includes('Address is missing receiver phone')) {
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
      } else {
        console.error('Checkout error:', error?.message || error);
        Alert.alert('Checkout Failed', errMsg || 'An unexpected error occurred during checkout.');
      }
      submitLockRef.current = false;
      setIsProcessing(false);
    }
  };

  const renderPaymentOption = (id: typeof selectedMethod, title: string, subtitle: string, Icon: any) => {
    const isSelected = selectedMethod === id;
    return (
      <TouchableOpacity 
        style={[styles.paymentOption, isSelected && styles.paymentOptionActive]} 
        onPress={() => setSelectedMethod(id)}
      >
        <View style={styles.paymentOptionLeft}>
          <View style={[styles.iconContainer, isSelected && styles.iconContainerActive]}>
            <Icon size={24} color={isSelected ? theme.colors.primary : theme.colors.textMuted} />
          </View>
          <View style={styles.paymentOptionTexts}>
            <Text style={[styles.paymentOptionTitle, isSelected && styles.paymentOptionTitleActive]}>{title}</Text>
            {subtitle ? <Text style={styles.paymentOptionSubtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        <View style={styles.radioArea}>
          {isSelected ? (
            <CheckCircle2 size={24} color={theme.colors.primary} fill="#DCFCE7" />
          ) : (
            <View style={styles.radioCircle} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const getSelectedLabel = () => {
    if (selectedMethod === 'cod') return 'Cash on Delivery';
    if (selectedMethod === 'razorpay_google_pay') return 'Google Pay';
    if (selectedMethod === 'razorpay_other_upi') return 'UPI';
    if (selectedMethod === 'razorpay_card') return 'Credit / Debit Card';
    return '';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerLogo}>FlashGO</Text>
        </View>
        <Text style={styles.headerTitle}>Payment Options</Text>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.billTotalBanner}>
          <Text style={styles.billTotalLabel}>Bill total</Text>
          <Text style={styles.billTotalAmount}>₹{grandTotal.toFixed(2)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommended UPI</Text>
          {renderPaymentOption('razorpay_google_pay', 'Google Pay', 'Pay using Google Pay', Smartphone)}
          {renderPaymentOption('razorpay_other_upi', 'Other UPI Apps', 'Choose another UPI app', Smartphone)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cards</Text>
          {renderPaymentOption('razorpay_card', 'Credit / Debit Card', 'Secure card payment', CreditCard)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pay on Delivery</Text>
          {renderPaymentOption('cod', 'Cash on Delivery', 'Pay when your order arrives', Banknote)}
        </View>
        
        <View style={styles.secureFooter}>
          <ShieldCheck size={16} color={theme.colors.textMuted} />
          <Text style={styles.secureFooterText}>Secure payments powered by Razorpay</Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {selectedMethod && (
        <View style={styles.footer}>
          {selectedMethod === 'cod' && (
            <View style={styles.footerSummary}>
              <Text style={styles.footerSummaryLabel}>PAY USING</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Banknote size={16} color={theme.colors.text} style={{marginRight: 6}}/>
                <Text style={styles.footerSummaryValue} numberOfLines={1}>
                  Cash on Delivery
                </Text>
              </View>
            </View>
          )}
          
          <TouchableOpacity 
            style={[styles.placeOrderBtn, selectedMethod !== 'cod' && { flex: 1 }, isProcessing && styles.placeOrderBtnDisabled]}
            disabled={isProcessing}
            onPress={handlePlaceOrder}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.placeOrderRow}>
                <View>
                  <Text style={styles.placeOrderTotal}>₹{grandTotal.toFixed(2)} TOTAL</Text>
                  <Text style={styles.placeOrderText}>
                    {selectedMethod === 'cod' ? 'Place Order' : `Pay ₹${grandTotal.toFixed(2)}`}
                  </Text>
                </View>
                <ChevronRight size={24} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    backgroundColor: '#fff',
  },
  headerBtn: { padding: 8, marginRight: 4 },
  headerLogo: { fontSize: 22, fontWeight: '900', color: theme.colors.primary, letterSpacing: -0.5 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, paddingRight: 16 },
  container: { flex: 1 },
  billTotalBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18, backgroundColor: '#fff', marginBottom: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  billTotalLabel: { fontSize: 16, color: theme.colors.text, fontWeight: '700' },
  billTotalAmount: { fontSize: 20, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5 },
  section: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 16, marginBottom: 12,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F3F4F6'
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5
  },
  paymentOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  paymentOptionActive: {
    backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 12, marginHorizontal: -12, 
    borderBottomWidth: 0, borderColor: '#BBF7D0', borderWidth: 1
  },
  paymentOptionLeft: {
    flexDirection: 'row', alignItems: 'center', flex: 1,
  },
  iconContainer: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  iconContainerActive: {
    backgroundColor: '#DCFCE7',
  },
  paymentOptionTexts: {
    flex: 1,
  },
  paymentOptionTitle: {
    fontSize: 16, fontWeight: '600', color: theme.colors.text,
  },
  paymentOptionTitleActive: {
    fontWeight: '700', color: '#111827',
  },
  paymentOptionSubtitle: {
    fontSize: 13, color: theme.colors.textMuted, marginTop: 3,
  },
  radioArea: {
    paddingLeft: 12,
  },
  radioCircle: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB',
  },
  secureFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 24, opacity: 0.7
  },
  secureFooterText: {
    fontSize: 13, color: theme.colors.textMuted, fontWeight: '600', marginLeft: 6
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border,
    paddingBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 10,
  },
  footerSummary: {
    flex: 1, marginRight: 16,
  },
  footerSummaryLabel: {
    fontSize: 11, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.5
  },
  footerSummaryValue: {
    fontSize: 15, fontWeight: '800', color: theme.colors.text,
  },
  placeOrderBtn: {
    backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    minWidth: 170, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
  },
  placeOrderBtnDisabled: {
    backgroundColor: theme.colors.textMuted, shadowOpacity: 0, elevation: 0
  },
  placeOrderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%',
  },
  placeOrderTotal: {
    fontSize: 11, color: '#DCFCE7', fontWeight: '800', marginBottom: 2, letterSpacing: 0.5
  },
  placeOrderText: {
    fontSize: 17, color: '#fff', fontWeight: '800',
  }
});
