import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useMobileApp } from '../hooks/useMobileApp';
import { navigationRef } from '../navigation/navigationRef';
import { Alert } from 'react-native';

interface MobileAppContextProps {
  sessionUser: any | null;
  isLoadingSession: boolean;
  cart: Record<string, number>;
  updateCart: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshServerCart: () => Promise<void>;
  products: any[];
  categories: any[];
  subcategories: any[];
  servingWarehouseId: string | null;
  addresses: any[];
  activeAddress: any | null;
  setActiveAddress: (addr: any) => void;
  checkoutAddress: any | null;
  setCheckoutAddress: (addr: any) => void;
  walletBalance: number;
  setWalletBalance: React.Dispatch<React.SetStateAction<number>>;
  refreshAddresses: () => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isResolvingLocation: boolean;
  requireLocationForShopping: () => boolean;
  wishlistProductIds: Set<string>;
  toggleWishlistItem: (productId: string) => Promise<void>;
  pendingOrder: any | null;
  refreshPendingOrder: () => Promise<void>;
}

const MobileAppContext = createContext<MobileAppContextProps | undefined>(undefined);

export const MobileAppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [wishlistProductIds, setWishlistProductIds] = useState<Set<string>>(new Set());
  const [pendingOrder, setPendingOrder] = useState<any>(null);

  // Re-use the existing logic to manage cart, warehouse, and products
  const mobileApp = useMobileApp(sessionUser?.id || null);

  const requireLocationForShopping = () => {
    if (mobileApp.activeAddress) return true;
    if (navigationRef.isReady()) {
      navigationRef.navigate('LocationSelector');
    }
    return false;
  };

  const toggleWishlistItem = async (productId: string) => {
    if (!sessionUser) return;
    const isWishlisted = wishlistProductIds.has(productId);
    
    // Optimistic UI update
    setWishlistProductIds(prev => {
      const next = new Set(prev);
      if (isWishlisted) next.delete(productId);
      else next.add(productId);
      return next;
    });

    try {
      const { toggleWishlist } = await import('../services/api');
      await toggleWishlist(sessionUser.id, productId, isWishlisted ? 'remove' : 'add');
    } catch (err) {
      console.error('Failed to toggle wishlist:', err);
      // Revert optimistic update on error
      setWishlistProductIds(prev => {
        const next = new Set(prev);
        if (isWishlisted) next.add(productId);
        else next.delete(productId);
        return next;
      });
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        verifyAndLoadProfile(session.user);
      } else {
        setIsLoadingSession(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        verifyAndLoadProfile(session.user);
      } else {
        setSessionUser(null);
        setIsLoadingSession(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const verifyAndLoadProfile = async (user: any) => {
    try {
      // 1. Force the internal client state to await pending storage syncs before query
      await supabase.auth.getSession();

      let data = null;
      let error = null;
      let retries = 3;

      while (retries > 0) {
        const result = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        data = result.data;
        error = result.error;

        // Bounded retry specifically for transient RLS permission denied (42501)
        if (error && error.code === '42501') {
          retries--;
          if (retries === 0) break;
          // Yield slightly for transient storage sync to complete
          await new Promise(resolve => requestAnimationFrame(resolve));
        } else {
          break; // Exit loop on success or non-transient error
        }
      }
        
      if (error) {
        if (error.code === 'PGRST116') {
          Alert.alert('Profile Not Found', 'Your customer profile could not be found.');
          await supabase.auth.signOut();
          setSessionUser(null);
          setPendingOrder(null);
        } else if (error.code === '42501') {
          Alert.alert('Authentication Sync Error', 'Please try logging in again.');
          await supabase.auth.signOut();
          setSessionUser(null);
          setPendingOrder(null);
        } else {
          Alert.alert('Network Error', error.message || 'Failed to load profile.');
          // Do NOT sign out for genuine network errors; leave session intact for manual retry
        }
        return;
      }

      if (!data) {
        Alert.alert('Profile Error', 'Profile data is missing.');
        await supabase.auth.signOut();
        setSessionUser(null);
        setPendingOrder(null);
        return;
      }
      
      if (data.role !== 'customer') {
        Alert.alert('Unauthorized', 'Access restricted to customers only.');
        await supabase.auth.signOut();
        setSessionUser(null);
        setPendingOrder(null);
        return;
      }

      if (data.is_suspended) {
        Alert.alert('Suspended', 'Your account has been suspended.');
        await supabase.auth.signOut();
        setSessionUser(null);
        setPendingOrder(null);
        return;
      }
      
      setSessionUser(user);
      await refreshPendingOrder(user.id);

      // Load wishlist
      try {
        const { getWishlist } = await import('../services/api');
        const wishlistIds = await getWishlist(user.id);
        setWishlistProductIds(new Set(wishlistIds));
      } catch (err) {
        console.error('Failed to load wishlist:', err);
      }
    } catch (err) {
      console.error(err);
      setSessionUser(null);
      setPendingOrder(null);
    } finally {
      setIsLoadingSession(false);
    }
  };

  const refreshPendingOrder = async (userId: string = sessionUser?.id) => {
    if (!userId) {
      setPendingOrder(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', userId)
        .eq('status', 'payment_pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (!error && data) {
        setPendingOrder(data);
      } else {
        setPendingOrder(null);
      }
    } catch (err) {
      console.error('Failed to fetch pending order:', err);
    }
  };

  return (
    <MobileAppContext.Provider value={{ 
      sessionUser, 
      isLoadingSession, 
      cart: mobileApp.cart,
      updateCart: mobileApp.updateCart,
      clearCart: mobileApp.clearCart,
      refreshServerCart: mobileApp.refreshServerCart,
      products: mobileApp.products,
      categories: mobileApp.categories,
      subcategories: mobileApp.subcategories,
      servingWarehouseId: mobileApp.servingWarehouseId,
      addresses: mobileApp.addresses,
      activeAddress: mobileApp.activeAddress,
      setActiveAddress: mobileApp.setActiveAddress,
      checkoutAddress: mobileApp.checkoutAddress,
      setCheckoutAddress: mobileApp.setCheckoutAddress,
      walletBalance: mobileApp.walletBalance,
      setWalletBalance: mobileApp.setWalletBalance,
      refreshAddresses: mobileApp.refreshAddresses,
      searchQuery: mobileApp.searchQuery,
      setSearchQuery: mobileApp.setSearchQuery,
      isResolvingLocation: mobileApp.isResolvingLocation,
      requireLocationForShopping,
      wishlistProductIds,
      toggleWishlistItem,
      pendingOrder,
      refreshPendingOrder,
    }}>
      {children}
    </MobileAppContext.Provider>
  );
};

export const useMobileAppContext = () => {
  const context = useContext(MobileAppContext);
  if (!context) {
    throw new Error('useMobileAppContext must be used within a MobileAppProvider');
  }
  return context;
};
