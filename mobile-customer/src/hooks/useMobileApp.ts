import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAddresses, getWalletBalance,
  getServingWarehouse, fetchWarehouseCatalog, fetchBrowseCatalog,
  fetchCategories, fetchSubcategories,
  upsertCartItem, getServerCart,
} from '../services/api';

// ─── Persistence keys ────────────────────────────────────────────────────────
// Home browsing location — set only when user explicitly selects a location on Home screen
const HOME_ADDRESS_KEY = (uid: string) => `flashgo_home_address_${uid}`;
const HOME_ADDRESS_GPS_KEY = (uid: string) => `flashgo_home_address_gps_${uid}`;

// Legacy key (written in older builds) — read-once for migration, then cleared
const LEGACY_ACTIVE_KEY = (uid: string) => `flashgo_active_address_${uid}`;
const LEGACY_ACTIVE_OBJ_KEY = (uid: string) => `flashgo_active_address_obj_${uid}`;
// ─────────────────────────────────────────────────────────────────────────────

export const useMobileApp = (userId: string | null) => {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [servingWarehouseId, setServingWarehouseId] = useState<string | null>(null);
  const [activeAddress, _setActiveAddress] = useState<any>(null); // Home browsing — never auto-set from saved delivery addrs
  const [checkoutAddress, _setCheckoutAddress] = useState<any>(null); // Current checkout — never persists to Home
  const [searchQuery, setSearchQuery] = useState('');
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);

  // ── Diagnostic setter wrappers ────────────────────────────────────────────
  const setActiveAddress = useCallback((addr: any, source: string = 'unknown') => {
    console.log(`SET_ACTIVE_ADDRESS source=${source} locality=${addr?.locality || addr?.street_address || addr?.name || 'null'} id=${addr?.id || 'null'}`);
    _setActiveAddress(addr);
  }, []);

  const setCheckoutAddress = useCallback((addr: any, source: string = 'unknown') => {
    console.log(`SET_CHECKOUT_ADDRESS source=${source} locality=${addr?.locality || addr?.street_address || addr?.name || 'null'} id=${addr?.id || 'null'}`);
    _setCheckoutAddress(addr);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const refreshAddresses = async () => {
    if (!userId) return;
    try {
      const [addrs, bal] = await Promise.all([
        getAddresses(),
        getWalletBalance(userId)
      ]);
      setAddresses(addrs);
      setWalletBalance(bal);

      // ── Restore Home browsing location from DEDICATED key only ────────────
      // We intentionally do NOT fall back to addrs[0] or any saved delivery address.
      // The Home browsing location must be explicitly selected by the user.
      try {
        // One-time migration: check if legacy key exists and move it, then clear
        const legacyId = await AsyncStorage.getItem(LEGACY_ACTIVE_KEY(userId));
        const legacyObj = await AsyncStorage.getItem(LEGACY_ACTIVE_OBJ_KEY(userId));
        const newHomeRaw = await AsyncStorage.getItem(HOME_ADDRESS_KEY(userId));
        const newHomeGPS = await AsyncStorage.getItem(HOME_ADDRESS_GPS_KEY(userId));

        let restoredHome: any = null;

        if (newHomeRaw) {
          // New key exists — use it directly
          if (newHomeRaw === 'current_gps_location' && newHomeGPS) {
            restoredHome = JSON.parse(newHomeGPS);
            console.log(`ACTIVE_ADDRESS_INIT source=new_key_gps locality=${restoredHome?.locality || restoredHome?.name}`);
          } else {
            // It's a saved address ID stored under the new key
            const matched = addrs.find((a: any) => a.id === newHomeRaw);
            if (matched) {
              restoredHome = matched;
              console.log(`ACTIVE_ADDRESS_INIT source=new_key_saved id=${matched.id} locality=${matched.locality}`);
            } else {
              // Saved address was deleted — clear stale key
              await AsyncStorage.removeItem(HOME_ADDRESS_KEY(userId));
              console.log(`ACTIVE_ADDRESS_INIT source=new_key_stale_deleted — clearing`);
            }
          }
        } else if (legacyId) {
          // Legacy key exists — migrate ONLY if it doesn't match any saved delivery address
          // (to avoid migrating a checkout-selected address as Home)
          if (legacyId === 'current_gps_location' && legacyObj) {
            // GPS location selected via Home — safe to migrate
            restoredHome = JSON.parse(legacyObj);
            await AsyncStorage.setItem(HOME_ADDRESS_KEY(userId), 'current_gps_location');
            await AsyncStorage.setItem(HOME_ADDRESS_GPS_KEY(userId), legacyObj);
            console.log(`ACTIVE_ADDRESS_INIT source=migrated_gps locality=${restoredHome?.locality || restoredHome?.name}`);
          } else {
            // Legacy id matches a saved address — this is AMBIGUOUS (could be Home or Checkout).
            // Discard it rather than risk polluting Home with a checkout address.
            console.log(`ACTIVE_ADDRESS_INIT source=legacy_discarded id=${legacyId} — ambiguous (could be checkout), not restoring`);
          }
          // Either way, clear the legacy key to prevent future re-reads
          await AsyncStorage.removeItem(LEGACY_ACTIVE_KEY(userId));
          await AsyncStorage.removeItem(LEGACY_ACTIVE_OBJ_KEY(userId));
        } else {
          console.log(`ACTIVE_ADDRESS_INIT source=none — user has not selected a Home browsing location`);
        }

        if (restoredHome && !activeAddress) {
          setActiveAddress(restoredHome, 'refreshAddresses_restore');
        }
        console.log(`CHECKOUT_ADDRESS_INIT source=in-memory value=${checkoutAddress?.locality || 'null'} (never persisted across sessions)`);
      } catch(e) {
        console.error('Address restore error:', e);
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

  // ── Bootstrap server cart on login ────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setCart({});
      return;
    }
    loadServerCart();
  }, [userId]);

  const loadServerCart = useCallback(async () => {
    if (!userId) {
      setCart({});
      return;
    }
    try {
      const serverCart = await getServerCart();
      if (!serverCart?.items) return;
      const rebuilt: Record<string, number> = {};
      for (const item of serverCart.items) {
        if (item.product_id && item.quantity > 0) {
          rebuilt[item.product_id] = item.quantity;
        }
      }
      
      setCart(prev => {
        // Prevent unnecessary state updates if cart is identical
        const prevKeys = Object.keys(prev);
        const newKeys = Object.keys(rebuilt);
        if (prevKeys.length === newKeys.length && prevKeys.every(k => prev[k] === rebuilt[k])) {
          return prev;
        }
        console.log(`SERVER_CART_BOOTSTRAP items=${newKeys.length}`);
        return rebuilt;
      });
      
    } catch (err: any) {
      console.warn('Server cart bootstrap failed — starting empty:', err?.message);
      setCart({});
    }
  }, [userId]);
  // ─────────────────────────────────────────────────────────────────────────

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
          
          // ── Reconcile local cart state against the new catalog ─────────
          // Server cart is authoritative for quantities; we just keep local
          // state tidy to avoid showing phantom items in the UI.
          setCart(prev => {
            const newCart = { ...prev };
            let changed = false;
            Object.keys(newCart).forEach(pId => {
              const catalogItem = catalog.find((p: any) => p.id === pId);
              if (!catalogItem || catalogItem.sellable_quantity <= 0) {
                delete newCart[pId];
                changed = true;
              } else if (newCart[pId] > catalogItem.sellable_quantity) {
                newCart[pId] = catalogItem.sellable_quantity;
                changed = true;
              }
            });
            return changed ? newCart : prev;
          });
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

  /**
   * Update cart quantity for a product.
   * Optimistically updates local state then syncs to server.
   * quantity <= 0 removes the item.
   */
  const updateCart = async (productId: string, quantity: number) => {
    if (!userId) return;

    // Optimistic local update
    setCart(prev => {
      const next = { ...prev };
      if (quantity <= 0) {
        delete next[productId];
      } else {
        next[productId] = quantity;
      }
      return next;
    });

    // Sync to server — errors are logged but do not roll back the local state
    // because the server will be the source of truth on next bootstrap.
    try {
      await upsertCartItem(productId, quantity);
    } catch (err: any) {
      console.error(`SERVER_CART_SYNC_ERROR product=${productId} qty=${quantity}:`, err?.message);
    }
  };

  const clearCart = async () => {
    if (!userId) return;
    setCart({});
    // Legacy AsyncStorage cleanup (belt-and-suspenders)
    await AsyncStorage.removeItem(`flashgo_cart_${userId}`).catch(() => {});
  };

  return {
    cart,
    updateCart,
    clearCart,
    refreshServerCart: loadServerCart,
    addresses,
    walletBalance,
    setWalletBalance,
    refreshAddresses,
    products,
    categories,
    subcategories,
    servingWarehouseId,
    activeAddress,
    checkoutAddress,
    // setCheckoutAddress — exposed as a plain pass-through; checkout flows must ONLY call this
    setCheckoutAddress: (addr: any) => setCheckoutAddress(addr, 'external_call'),
    // setActiveAddress — persists to the dedicated Home key; only Home-selection flows should call this
    setActiveAddress: async (addr: any) => {
      setActiveAddress(addr, 'external_call');
      if (userId) {
        try {
          if (addr?.id) {
            await AsyncStorage.setItem(HOME_ADDRESS_KEY(userId), addr.id);
            if (addr.id === 'current_gps_location') {
              await AsyncStorage.setItem(HOME_ADDRESS_GPS_KEY(userId), JSON.stringify(addr));
            }
          } else if (addr === null) {
            await AsyncStorage.removeItem(HOME_ADDRESS_KEY(userId));
            await AsyncStorage.removeItem(HOME_ADDRESS_GPS_KEY(userId));
          }
        } catch (e) {}
      }
    },
    searchQuery,
    setSearchQuery,
    isResolvingLocation
  };
};
