import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Percent } from 'lucide-react-native';
import { theme } from '../theme';

export default function CartSheet({
  cart, products, subtotal, deliveryFee, appliedDiscount, discountAmount, totalBill,
  walletBalance, couponCode, setCouponCode, handleApplyCoupon, handleCheckout,
  onClose, paymentMethod, setPaymentMethod, isPlacingOrder
}: any) {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Overlay Backdrop */}
      <TouchableOpacity style={styles.backdrop} onPress={() => onClose?.()} />
      
      <View style={styles.cartSheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Review Checkout Basket</Text>
          <TouchableOpacity onPress={() => onClose?.()}>
            <Text style={{ color: theme.colors.text, fontWeight: 'bold' }}>Close</Text>
          </TouchableOpacity>
        </View>

        {Object.keys(cart).length === 0 || subtotal === 0 ? (
          <View style={styles.emptyCartContainer}>
            <Text style={styles.emptyCartText}>Your basket is empty.</Text>
            <TouchableOpacity style={styles.continueShoppingBtn} onPress={() => onClose?.()}>
              <Text style={styles.continueShoppingBtnText}>Continue Shopping</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView style={styles.cartItemsScroll} showsVerticalScrollIndicator={false}>
          {Object.entries(cart).map(([id, qty]) => {
            const item = products.find((p: any) => p.id === id);
            if (!item) return null;
            const quantity = qty as number;
            return (
              <View key={id} style={styles.cartItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartItemName}>{item.name}</Text>
                  <Text style={styles.cartItemMeta}>₹{item.price.toFixed(2)} x {quantity}</Text>
                </View>
                <Text style={styles.cartItemTotal}>₹{(item.price * quantity).toFixed(2)}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Coupon Apply */}
        <View style={styles.couponSection}>
          <Percent size={16} color={theme.colors.warning} />
          <TextInput
            style={styles.couponInput}
            placeholder="Enter coupon code"
            placeholderTextColor={theme.colors.textMuted}
            value={couponCode}
            onChangeText={setCouponCode}
            autoCapitalize="characters"
          />
          <TouchableOpacity style={styles.couponBtn} onPress={handleApplyCoupon}>
            <Text style={styles.couponBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>

        {/* Billing Summary */}
        <View style={styles.billBox}>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Basket Subtotal</Text>
            <Text style={styles.billValue}>₹{subtotal.toFixed(2)}</Text>
          </View>
          {appliedDiscount > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, { color: theme.colors.success }]}>Discount ({appliedDiscount}%)</Text>
              <Text style={[styles.billValue, { color: theme.colors.success }]}>-₹{discountAmount.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery Fee</Text>
            <Text style={styles.billValue}>{deliveryFee === 0 ? 'FREE' : `₹${deliveryFee.toFixed(2)}`}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.billRow}>
            <Text style={styles.grandTotalLabel}>Grand Net Total</Text>
            <Text style={styles.grandTotalValue}>₹{totalBill.toFixed(2)}</Text>
          </View>
        </View>

        {/* Payer balance validation & Trigger Checkout */}
        <View style={styles.checkoutSection}>
          <Text style={styles.paymentMethodTitle}>Payment Method</Text>
          <View style={styles.paymentOptions}>
            <TouchableOpacity 
              style={[styles.paymentOption, paymentMethod === 'wallet' && styles.paymentOptionActive]}
              onPress={() => setPaymentMethod('wallet')}
            >
              <Text style={[styles.paymentOptionText, paymentMethod === 'wallet' && styles.paymentOptionTextActive]}>Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.paymentOption, paymentMethod === 'cod' && styles.paymentOptionActive]}
              onPress={() => setPaymentMethod('cod')}
            >
              <Text style={[styles.paymentOptionText, paymentMethod === 'cod' && styles.paymentOptionTextActive]}>Cash on Delivery</Text>
            </TouchableOpacity>
          </View>
          
          {paymentMethod === 'wallet' && (
            <View style={styles.checkoutBalanceRow}>
              <Text style={styles.walletText}>Wallet Balance: ₹{walletBalance.toFixed(2)}</Text>
              {walletBalance < totalBill && (
                <Text style={styles.insufficientText}>Insufficient funds!</Text>
              )}
            </View>
          )}

          <TouchableOpacity 
            style={[styles.checkoutBtn, 
              ((paymentMethod === 'wallet' && walletBalance < totalBill) || isPlacingOrder) && { backgroundColor: theme.colors.border }
            ]} 
            disabled={(paymentMethod === 'wallet' && walletBalance < totalBill) || isPlacingOrder}
            onPress={handleCheckout}
          >
            {isPlacingOrder ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.checkoutBtnText}>
                {paymentMethod === 'cod' ? `Place Order • ₹${totalBill.toFixed(2)}` : `Pay ₹${totalBill.toFixed(2)}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  cartSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },
  cartItemsScroll: {
    maxHeight: 280,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    marginBottom: 16,
  },
  emptyCartContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  emptyCartText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
  },
  continueShoppingBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  continueShoppingBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  cartItemName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  cartItemMeta: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  cartItemTotal: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  couponSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  couponInput: {
    flex: 1,
    color: '#111827',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  couponBtn: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  couponBtnText: {
    color: theme.colors.primaryDark,
    fontWeight: '800',
    fontSize: 13,
  },
  billBox: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  billLabel: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '500',
  },
  billValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: 12,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.primaryDark,
  },
  checkoutSection: {
    paddingBottom: 24,
  },
  checkoutBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
  insufficientText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  checkoutBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  checkoutBtnText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 0.5,
  },
  paymentMethodTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  paymentOption: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  paymentOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  paymentOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  paymentOptionTextActive: {
    color: theme.colors.primaryDark,
  }
});
