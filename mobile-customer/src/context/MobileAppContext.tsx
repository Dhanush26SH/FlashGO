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
}

const MobileAppContext = createContext<MobileAppContextProps | undefined>(undefined);

export const MobileAppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Re-use the existing logic to manage cart, warehouse, and products
  const mobileApp = useMobileApp(sessionUser?.id || null);

  const requireLocationForShopping = () => {
    if (mobileApp.activeAddress) return true;
    if (navigationRef.isReady()) {
      navigationRef.navigate('LocationSelector');
    }
    return false;
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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (error || !data) {
        setSessionUser(null);
        return;
      }
      
      if (data.role !== 'customer') {
        Alert.alert('Unauthorized', 'Access restricted to customers only.');
        await supabase.auth.signOut();
        setSessionUser(null);
        return;
      }

      if (data.is_suspended) {
        Alert.alert('Suspended', 'Your account has been suspended.');
        await supabase.auth.signOut();
        setSessionUser(null);
        return;
      }
      
      setSessionUser(user);
    } catch (err) {
      console.error(err);
      setSessionUser(null);
    } finally {
      setIsLoadingSession(false);
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
