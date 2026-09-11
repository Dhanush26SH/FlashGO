import React, { useState } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import CartSheet from '../components/CartSheet';
import { useMobileAppContext } from '../context/MobileAppContext';
import { getCoupons, processCheckout } from '../services/api';

export default function CartScreen() {
  const navigation = useNavigation<any>();
  const { 
    cart, products, clearCart, walletBalance, setWalletBalance, 
    sessionUser, activeAddress, requireLocationForShopping 
  } = useMobileAppContext();

  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(0); 
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'cod'>('cod');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Derived metrics
  const cartItemsCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = products.find((prod: any) => prod.id === id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  const discountAmount = subtotal * (appliedDiscount / 100);
  const deliveryFee = cartItemsCount === 0 ? 0 : (subtotal > 15 ? 0 : 4.99);
  const totalBill = subtotal - discountAmount + deliveryFee;

  const handleApplyCoupon = async () => {
    if (!couponCode) return;
    try {
      const availableCoupons = await getCoupons();
      const valid = availableCoupons.find((c: any) => c.code === couponCode && c.active);
      if (valid) {
        if (subtotal < (valid.min_order_value || 0)) {
           Alert.alert('Invalid', `Minimum order value for this coupon is ₹${valid.min_order_value}`);
           return;
        }
        let calculatedDiscount = 0;
        if (valid.discount_type === 'percentage') {
          calculatedDiscount = subtotal * (valid.discount_value / 100);
          if (valid.max_discount && calculatedDiscount > valid.max_discount) {
            calculatedDiscount = valid.max_discount;
          }
        } else {
          calculatedDiscount = valid.discount_value;
        }
        setAppliedDiscount(calculatedDiscount);
        Alert.alert('Success', `Coupon applied!`);
      } else {
        Alert.alert('Invalid', 'Invalid or expired coupon code.');
        setAppliedDiscount(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckout = async () => {
    if (isPlacingOrder) return; // prevent double-tap
    
    if (cartItemsCount === 0) {
      Alert.alert('Empty Cart', 'Please add items to your basket before checking out.');
      return;
    }

    if (paymentMethod === 'wallet' && walletBalance < totalBill) {
      Alert.alert('Insufficient Balance', 'Please top up your wallet funds first!');
      return;
    }
    
    if (!requireLocationForShopping()) {
      // requireLocationForShopping shows the location selector if no address set
      return;
    }
    
    if (!activeAddress || !activeAddress.lat || !activeAddress.lng) {
      Alert.alert('No Delivery Address', 'Please set a delivery address with GPS location before ordering.');
      return;
    }

    setIsPlacingOrder(true);
    try {
      // Map cart items using camelCase productId key — matches the RPC's jsonb_to_recordset pattern
      const items = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }));
      
      console.log('[CartScreen] Placing order — user:', sessionUser?.id, 'address lat/lng:', activeAddress.lat, activeAddress.lng, 'items:', items, 'payment:', paymentMethod);
      
      const payload = {
        p_user_id: sessionUser.id,
        p_address: activeAddress.street_address || activeAddress.address_line || activeAddress.locality || 'Delivery Address',
        p_lat: activeAddress.lat,
        p_lng: activeAddress.lng,
        p_items: items,
        // Server computes: delivery fee, product prices, coupon value, total, warehouse
        // Do NOT pass p_discount_val or p_delivery_fee — those are server-authoritative
        p_coupon_code: couponCode || null,
        p_delivery_speed: 'standard',
        p_payment_method: paymentMethod,
        p_idempotency_key: `${sessionUser.id}_${Date.now()}`,
      };

      const orderId = await processCheckout(payload);
      console.log('[CartScreen] Order placed successfully — orderId:', orderId);
      
      await clearCart();
      if (paymentMethod === 'wallet') {
        setWalletBalance(prev => prev - totalBill);
      }

      navigation.replace('Tracking', { orderId });
    } catch (err: any) {
      const msg = err?.message || err?.error_description || JSON.stringify(err);
      console.error('[CartScreen] Checkout error:', err);
      Alert.alert('Unable to place order', msg);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <CartSheet 
        cart={cart} products={products}
        subtotal={subtotal} deliveryFee={deliveryFee}
        appliedDiscount={appliedDiscount} discountAmount={discountAmount} totalBill={totalBill}
        walletBalance={walletBalance} activeAddress={activeAddress}
        couponCode={couponCode} setCouponCode={setCouponCode}
        paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
        handleApplyCoupon={handleApplyCoupon} 
        onClose={() => navigation.goBack()} 
        handleCheckout={handleCheckout}
        isPlacingOrder={isPlacingOrder}
      />
    </View>
  );
}
