import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchLiveProducts, getAddresses, getWalletBalance, getServingWarehouse, fetchWarehouseCatalog, fetchBrowseCatalog, fetchCategories, fetchSubcategories } from '../services/api';

export const useMobileApp = (userId: string | null) => {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [servingWarehouseId, setServingWarehouseId] = useState<string | null>(null);
  const [activeAddress, setActiveAddress] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);

  const refreshAddresses = async () => {
    if (!userId) return;
    try {
      const [addrs, bal] = await Promise.all([
        getAddresses(),
        getWalletBalance(userId)
      ]);
      setAddresses(addrs);
      setWalletBalance(bal);
      let defaultAddr = addrs.length > 0 ? addrs[0] : null;
      try {
        const storedId = await AsyncStorage.getItem(`flashgo_active_address_${userId}`);
        const storedObj = await AsyncStorage.getItem(`flashgo_active_address_obj_${userId}`);
        
        if (storedId === 'current_gps_location' && storedObj) {
          defaultAddr = JSON.parse(storedObj);
        } else if (storedId) {
          const matched = addrs.find((a: any) => a.id === storedId);
          if (matched) defaultAddr = matched;
        }
      } catch(e) {}

      if (defaultAddr && !activeAddress) {
        setActiveAddress(defaultAddr);
      } else if (addrs.length === 0) {
        setActiveAddress(null);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  };

  // Load User Data
  useEffect(() => {
    refreshAddresses();
  }, [userId]);

  // Load Categories & Subcategories on Mount
  useEffect(() => {
    fetchCategories().then(setCategories).catch(console.error);
    fetchSubcategories().then(setSubcategories).catch(console.error);
  }, []);

  // Resolve Warehouse & Catalog when active address or search changes
  useEffect(() => {
    if (!activeAddress) {
      setServingWarehouseId(null);
      setIsResolvingLocation(false);
      
      // Load generic browse-only catalog instead of locking out the user
      fetchBrowseCatalog(searchQuery)
        .then(setProducts)
        .catch(console.error);
        
      return;
    }

    setIsResolvingLocation(true);
    const timer = setTimeout(async () => {
      try {
        const whId = await getServingWarehouse(activeAddress.lat, activeAddress.lng);
        setServingWarehouseId(whId);
        
        if (whId) {
          const catalog = await fetchWarehouseCatalog(whId, searchQuery);
          setProducts(catalog);
          
          // Reconcile Cart against new catalog
          const stored = await AsyncStorage.getItem(`flashgo_cart_${userId}`);
          if (stored) {
            const parsedCart = JSON.parse(stored);
            const newCart = { ...parsedCart };
            let cartChanged = false;
            
            Object.keys(newCart).forEach(pId => {
              const catalogItem = catalog.find((p: any) => p.id === pId);
              if (!catalogItem || catalogItem.sellable_quantity <= 0) {
                delete newCart[pId];
                cartChanged = true;
              } else if (newCart[pId] > catalogItem.sellable_quantity) {
                newCart[pId] = catalogItem.sellable_quantity;
                cartChanged = true;
              }
            });
            
            setCart(newCart);
            if (cartChanged) {
              await AsyncStorage.setItem(`flashgo_cart_${userId}`, JSON.stringify(newCart));
            }
          }
        } else {
          setProducts([]);
          setServingWarehouseId(null);
        }
      } catch (err) {
        console.error('Routing Error:', err);
        setProducts([]);
        setServingWarehouseId(null);
      } finally {
        setIsResolvingLocation(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [activeAddress, userId, searchQuery]);

  const updateCart = async (productId: string, quantity: number) => {
    if (!userId) return;
    const newCart = { ...cart };
    if (quantity <= 0) {
      delete newCart[productId];
    } else {
      newCart[productId] = quantity;
    }
    setCart(newCart);
    await AsyncStorage.setItem(`flashgo_cart_${userId}`, JSON.stringify(newCart));
  };


  const clearCart = async () => {
    if (!userId) return;
    setCart({});
    await AsyncStorage.removeItem(`flashgo_cart_${userId}`);
  };

  return {
    cart,
    updateCart,
    clearCart,
    addresses,
    walletBalance,
    setWalletBalance,
    refreshAddresses,
    products,
    categories,
    subcategories,
    servingWarehouseId,
    activeAddress,
    setActiveAddress: async (addr: any) => {
      setActiveAddress(addr);
      if (userId && addr?.id) {
        try {
          await AsyncStorage.setItem(`flashgo_active_address_${userId}`, addr.id);
          if (addr.id === 'current_gps_location') {
            await AsyncStorage.setItem(`flashgo_active_address_obj_${userId}`, JSON.stringify(addr));
          }
        } catch (e) {}
      }
    },
    searchQuery,
    setSearchQuery,
    isResolvingLocation
  };
};
