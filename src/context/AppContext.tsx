import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}
import { FlashGoDB } from '../services/db';
import type { 
  Product, Category, Order, UserRole, Vendor, 
  ProcurementOrder, ProductBatch, Profile, OrderSubstitution,
  LogisticsTrip, DarkStore, OrderStatus, Coupon
} from '../types';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface AppContextType {
  // Authentication & Profile
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  currentUser: Profile | undefined;
  updateCurrentUserProfile: (profile: Profile) => void;
  addWalletFunds: (userId: string, amount: number) => void;
  isAuthenticated: boolean;
  login: (role: UserRole) => void;
  logout: () => void;
  fallbackState: { type: 'none' | 'partial' | 'full', failedModules: string[] };

  // Catalog Data
  categories: Category[];
  products: Product[];
  coupons: Coupon[];
  orders: Order[];
  vendors: Vendor[];
  procurementOrders: ProcurementOrder[];
  batches: ProductBatch[];
  substitutions: OrderSubstitution[];
  trips: LogisticsTrip[];
  logisticsTrips: LogisticsTrip[];
  darkStores: DarkStore[];
  profiles: Profile[];
  refreshData: () => void;

  // Shopping Cart Logic
  cart: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, qty: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartSubtotal: number;
  cartDiscount: number;
  cartDeliveryFee: number;
  baseDeliveryFee: number;
  freeDeliveryThreshold: number;
  cartTotal: number;
  appliedCoupon: Coupon | null;
  applyCouponCode: (code: string) => { success: boolean; message: string };
  removeCouponCode: () => void;

  // Orders & Simulation
  createOrder: (address: string, speed?: 'express' | 'eco', paymentMethod?: 'wallet' | 'cod' | 'upi' | 'card', lat?: number, lng?: number) => Promise<Order | null>;
  assignPicker: (orderId: string, pickerId: string) => void;
  pickItem: (orderId: string, itemId: string, qty: number, oos?: boolean) => void;

  verifyDeliveryOTP: (orderId: string, otp: string, driverId: string) => Promise<boolean>;
  reconcileDriverCOD: (driverId: string) => void;

  // New Features
  createBatch: (productId: string, batchNumber: string, expiryDate: string, qty: number) => void;
  proposeSubstitution: (orderId: string, originalId: string, suggestedId: string, qty: number, orderItemId: string) => Promise<void>;
  respondToSubstitution: (subId: string, action: 'approved' | 'rejected' | 'auto_refund') => Promise<void>;
  completePicking: (orderId: string, pickerId: string) => Promise<void>;
  packOrder: (orderId: string, bagNumber: string) => Promise<void>;
  assignDriver: (orderId: string, driverId: string) => void;
  createLogisticsTrip: (orderIds: string[]) => void;
  assignTripDriver: (tripId: string, driverId: string) => void;

  // Dark/Light Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Procurement Management
  createProcurementOrder: (vendorId: string, items: { product_id: string; quantity: number; cost_per_unit: number; }[]) => void;
  approveProcurementOrder: (id: string) => void;
  adjustStock: (productId: string, quantityChange: number) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;

  // Toast notifications & ratings
  toasts: Toast[];
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
  rateOrder: (orderId: string, rating: number, productRatings: { productId: string; rating: number }[]) => boolean;


  // Data State
  isLoadingData: boolean;
  dataLoadError: string | null;
  loadCatalogForWarehouse: (warehouseId: string | null) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('flashgo_role');
    return (saved as UserRole) || 'customer';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('flashgo_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Platform Settings State
  const [baseDeliveryFee, setBaseDeliveryFee] = useState(2.99);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(15.00);

  useEffect(() => {
    // Fetch platform settings
    import('../services/api/SettingsService').then(({ SettingsService }) => {
      SettingsService.getSettings().then(settings => {
        if (settings) {
          setBaseDeliveryFee(settings.base_delivery_fee);
          setFreeDeliveryThreshold(settings.free_delivery_threshold);
        }
      });
    });
  }, []);

  const login = (role: UserRole) => {
    setActiveRole(role);
    setIsAuthenticated(true);
    localStorage.setItem('flashgo_auth', 'true');
    localStorage.setItem('flashgo_role', role);
    addToast(`Successfully logged in as ${role.replace('_', ' ')}`, 'success');
  };

  const logout = async () => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn("Error signing out of Supabase", e);
    }
    setIsAuthenticated(false);
    setCurrentUser(undefined);
    localStorage.removeItem('flashgo_role');
    setCart([]);
    addToast('Logged out successfully', 'info');
  };

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = 'toast-' + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const rateOrder = (orderId: string, rating: number, productRatings: { productId: string; rating: number }[]): boolean => {
    const success = FlashGoDB.rateOrder(orderId, rating, productRatings);
    if (success) {
      addToast('⭐ Thank you! Review submitted. Earned +15 Loyalty points!', 'success');
      loadDatabaseData();
    }
    return success;
  };

  // React-reactive states sourced from FlashGoDB
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [procurementOrders, setProcurementOrders] = useState<ProcurementOrder[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [substitutions, setOrderSubstitutions] = useState<OrderSubstitution[]>([]);
  const [trips, setTrips] = useState<LogisticsTrip[]>([]);
  const [logisticsTrips, setLogisticsTrips] = useState<LogisticsTrip[]>([]);
  const [darkStores, setDarkStores] = useState<DarkStore[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | undefined>(undefined);
  
  // App Global Loading State
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [fallbackState, setFallbackState] = useState<{ type: 'none' | 'partial' | 'full', failedModules: string[] }>({ type: 'none', failedModules: [] });

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const cartLoadedRef = useRef(false);

  useEffect(() => {
    // Load cart from localStorage when user changes
    const cartKey = currentUser ? `flashgo_cart_${currentUser.id}` : 'flashgo_cart_anon';
    const savedCart = localStorage.getItem(cartKey);
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        setCart([]);
      }
    } else {
      setCart([]);
    }
    cartLoadedRef.current = true;
  }, [currentUser]);

  // Reconcile cart against live products when products array updates
  useEffect(() => {
    if (products.length > 0 && cartLoadedRef.current && cart.length > 0) {
      setCart(prev => {
        let modified = false;
        const reconciled = prev.map(item => {
          const liveProd = products.find(p => p.id === item.product.id);
          if (!liveProd) {
            modified = true;
            addToast(`"${item.product.name}" is no longer available. Removed from cart.`, 'warning');
            return null;
          }
          if (item.quantity > liveProd.stock_quantity) {
            modified = true;
            addToast(`Only ${liveProd.stock_quantity} units available for ${liveProd.name}. Adjusted cart.`, 'warning');
            return { ...item, product: liveProd, quantity: liveProd.stock_quantity };
          }
          if (liveProd.price !== item.product.price || liveProd.discount_price !== item.product.discount_price) {
            modified = true;
            return { ...item, product: liveProd };
          }
          return item;
        }).filter(Boolean) as CartItem[];
        return modified ? reconciled : prev;
      });
    }
  }, [products]);

  useEffect(() => {
    // Save cart to localStorage when it changes
    if (!cartLoadedRef.current) return;
    const cartKey = currentUser ? `flashgo_cart_${currentUser.id}` : 'flashgo_cart_anon';
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, currentUser]);



  // Load and refresh initial data
  const loadDatabaseData = async () => {
    setIsLoadingData(true);
    setDataLoadError(null);
    try {
      const { CategoriesService } = await import('../services/api/CategoriesService');
      const { ProductsService } = await import('../services/api/ProductsService');
      const { OrdersService } = await import('../services/api/OrdersService');
      const { UsersService } = await import('../services/api/UsersService');
      const { supabase } = await import('../services/api/supabaseClient');
      
      // If Supabase is not configured, fall back to synchronous FlashGoDB mock data
      if (!supabase) {
        setCategories(FlashGoDB.getCategories());
        setProducts(FlashGoDB.getProducts());
        setOrders(FlashGoDB.getOrders());
        setCoupons(FlashGoDB.getCoupons());
        setVendors(FlashGoDB.getVendors());
        setProcurementOrders(FlashGoDB.getProcurements());
        setBatches(FlashGoDB.getBatches());
        setOrderSubstitutions(FlashGoDB.getSubstitutions());
        setTrips(FlashGoDB.getLogisticsTrips());
        setDarkStores(FlashGoDB.getDarkStores());
        
        const profs = FlashGoDB.getProfiles();
        setProfiles(profs);
        const profileMap: Record<UserRole, string> = {
          customer: 'u-cust',
          picker: 'u-pick',
          driver: 'u-driv',
          warehouse_staff: 'u-whse',
          warehouse_manager: 'u-whse_mgr',
          admin: 'u-admin'
        };
        setCurrentUser(profs.find(p => p.id === profileMap[activeRole]));
        setIsLoadingData(false);
        setFallbackState({ type: 'full', failedModules: [] });
        return;
      }
      
      const { CouponsService } = await import('../services/api/CouponsService');
      const { VendorsService } = await import('../services/api/VendorsService');
      const { ProcurementService } = await import('../services/api/ProcurementService');
      const { LogisticsService } = await import('../services/api/LogisticsService');
      const { InventoryService } = await import('../services/api/InventoryService');
      
      let failedModules: string[] = [];
      const [cats, ords, profs, coups, vends, procs, ltrips, liveBatches] = await Promise.all([
        CategoriesService.getCategories().catch(e => { console.warn('Categories fallback', e); failedModules.push('Categories'); return FlashGoDB.getCategories(); }),
        OrdersService.getOrders().catch(e => { console.warn('Orders fallback', e); failedModules.push('Orders'); return FlashGoDB.getOrders(); }),
        UsersService.getProfiles().catch(e => { console.warn('Profiles fallback', e); failedModules.push('Profiles'); return FlashGoDB.getProfiles(); }),
        CouponsService.getCoupons().catch(e => { console.warn('Coupons fallback', e); failedModules.push('Coupons'); return FlashGoDB.getCoupons(); }),
        VendorsService.getVendors().catch(e => { console.warn('Vendors fallback', e); failedModules.push('Vendors'); return FlashGoDB.getVendors(); }),
        ProcurementService.getProcurementOrders().catch(e => { console.warn('Procurement fallback', e); failedModules.push('Procurement'); return FlashGoDB.getProcurements(); }),
        LogisticsService.getLogisticsTrips().catch((e: any) => { console.warn('Logistics fallback', e); failedModules.push('Logistics'); return FlashGoDB.getLogisticsTrips(); }),
        InventoryService.getBatches().catch((e: any) => { console.warn('Batches fallback', e); failedModules.push('Batches'); return FlashGoDB.getBatches(); })
      ]);

      // Load products based on warehouse assignment
      const { data: { session } } = await supabase.auth.getSession();
      let authenticatedProfile = null;
      if (session) {
         authenticatedProfile = profs.find((p: any) => p.id === session.user.id);
      }

      if (authenticatedProfile && (authenticatedProfile as any).is_suspended) {
        supabase.auth.signOut();
        addToast('Your account has been suspended by an administrator.', 'error');
        authenticatedProfile = null;
      }

      let loadedProducts = [] as any[];
      if (authenticatedProfile?.warehouse_id) {
        loadedProducts = await InventoryService.getWarehouseStock(authenticatedProfile.warehouse_id).catch((e: any) => { console.warn('Inventory fallback', e); failedModules.push('WarehouseStock'); return FlashGoDB.getProducts(); });
      } else {
        loadedProducts = await ProductsService.getProducts().catch((e: any) => { console.warn('Products fallback', e); failedModules.push('Products'); return FlashGoDB.getProducts(); });
      }

      // Check if critical endpoints failed which would constitute a full fallback
      if (failedModules.includes('Orders') && failedModules.includes('Products') && failedModules.includes('Profiles')) {
        setFallbackState({ type: 'full', failedModules });
      } else if (failedModules.length > 0) {
        setFallbackState({ type: 'partial', failedModules });
      } else {
        setFallbackState({ type: 'none', failedModules: [] });
      }

      setCategories(cats);
      setProducts(loadedProducts);
      setOrders(ords);
      setCoupons(coups);
      setVendors(vends);
      setProcurementOrders(procs);
      setLogisticsTrips(ltrips);
      setBatches(liveBatches);
      setOrderSubstitutions(FlashGoDB.getSubstitutions());
      setTrips(FlashGoDB.getLogisticsTrips());
      setDarkStores(FlashGoDB.getDarkStores());
      setProfiles(profs);

      if (authenticatedProfile) {
         setCurrentUser(authenticatedProfile);
         setIsAuthenticated(true);
         setActiveRole(authenticatedProfile.role);
         localStorage.setItem('flashgo_role', authenticatedProfile.role);
      } else {
         if (activeRole !== 'customer') {
           const profileMap: Record<UserRole, string> = {
             customer: 'u-cust', // Legacy, unused
             picker: 'u-pick',
             driver: 'u-driv',
             warehouse_staff: 'u-whse',
             warehouse_manager: 'u-whse_mgr',
             admin: 'u-admin'
           };
           // Look up current profile from real users (or mock profiles if auth not set up)
           setCurrentUser(profs.find((p: any) => p.role === activeRole) || FlashGoDB.getProfiles().find((p: any) => p.id === profileMap[activeRole]));
         } else {
           setCurrentUser(undefined);
           setIsAuthenticated(false);
         }
      }
    } catch (e: any) {
      console.error('Failed to load Supabase data:', e);
      setDataLoadError(e.message || 'Network request failed');
      addToast('Failed to load live data. Check Supabase connection.', 'error');
    } finally {
      setIsLoadingData(false);
    }
  };

  // Sync profile when activeRole changes
  useEffect(() => {
    loadDatabaseData();
  }, [activeRole]);

  // Subscribe to DB notifications for real-time updates
  useEffect(() => {
    loadDatabaseData();
    
    let warehouseStockChannel: any = null;
    let procurementChannel: any = null;
    let profilesChannel: any = null;
    let substitutionsChannel: any = null;
    let logisticsTripsChannel: any = null;
    let productBatchesChannel: any = null;
    let paymentTransactionsChannel: any = null;
    let stockLedgersChannel: any = null;
    let supabaseInstance: any = null;
    let isMounted = true;

    const setupSupabaseRealtime = async () => {
      try {
        const { supabase } = await import('../services/api/supabaseClient');
        if (!supabase || !isMounted) return;
        supabaseInstance = supabase;
        // Orders Realtime is now handled in a separate useEffect that respects currentUser

          warehouseStockChannel = supabase.channel('public:warehouse_stock')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
              loadDatabaseData();
            })
            .subscribe();
            
          procurementChannel = supabase.channel('public:procurement_orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'procurement_orders' }, () => {
              loadDatabaseData();
            })
            .subscribe();

          profilesChannel = supabase.channel('public:profiles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
              loadDatabaseData();
            })
            .subscribe();

          substitutionsChannel = supabase.channel('public:order_substitutions')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_substitutions' }, () => {
              loadDatabaseData();
            })
            .subscribe();

          logisticsTripsChannel = supabase.channel('public:logistics_trips')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logistics_trips' }, () => {
              loadDatabaseData();
            })
            .subscribe();

          productBatchesChannel = supabase.channel('public:product_batches')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_batches' }, () => {
              loadDatabaseData();
            })
            .subscribe();

          paymentTransactionsChannel = supabase.channel('public:payment_transactions')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, (payload: any) => {
              window.dispatchEvent(new CustomEvent('supabase_payment_transactions_change', { detail: payload }));
            })
            .subscribe();

          stockLedgersChannel = supabase.channel('public:stock_ledgers')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_ledgers' }, (payload: any) => {
              window.dispatchEvent(new CustomEvent('supabase_stock_ledgers_change', { detail: payload }));
            })
            .subscribe();
      } catch (e) {
        console.error('Failed to setup Supabase Realtime', e);
      }
    };

    setupSupabaseRealtime();

    const unsubscribe = FlashGoDB.subscribe(() => {
      loadDatabaseData();
    });

    return () => {
      isMounted = false;
      unsubscribe();
      // Orders Realtime unsubscribe handled in its own useEffect
      if (supabaseInstance) {
        if (warehouseStockChannel) supabaseInstance.removeChannel(warehouseStockChannel);
        if (procurementChannel) supabaseInstance.removeChannel(procurementChannel);
        if (profilesChannel) supabaseInstance.removeChannel(profilesChannel);
        if (substitutionsChannel) supabaseInstance.removeChannel(substitutionsChannel);
        if (logisticsTripsChannel) supabaseInstance.removeChannel(logisticsTripsChannel);
        if (productBatchesChannel) supabaseInstance.removeChannel(productBatchesChannel);
        if (paymentTransactionsChannel) supabaseInstance.removeChannel(paymentTransactionsChannel);
        if (stockLedgersChannel) supabaseInstance.removeChannel(stockLedgersChannel);
      }
    };
  }, []);

  // Role-Aware Realtime for Orders
  useEffect(() => {
    let ordersChannel: any = null;
    let supabaseInstance: any = null;
    let isMounted = true;

    const setupOrdersRealtime = async () => {
      try {
        const { supabase } = await import('../services/api/supabaseClient');
        if (!supabase || !isMounted) return;
        supabaseInstance = supabase;

        let filter = undefined;
        if (currentUser?.role === 'customer') {
          filter = `customer_id=eq.${currentUser.id}`;
        }
        
        let channelName = 'public:orders';
        if (filter) {
          channelName = `public:orders:${filter}`;
        }

        ordersChannel = supabase.channel(channelName)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: filter }, (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setOrders(prev => {
                if (prev.some(o => o.id === payload.new.id)) return prev;
                return [{ ...payload.new, items: [], customer_name: 'Loading...' }, ...prev] as any;
              });
              loadDatabaseData();
            } else if (payload.eventType === 'UPDATE') {
              setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o));
            } else if (payload.eventType === 'DELETE') {
              setOrders(prev => prev.filter(o => o.id !== (payload.old as any).id));
            }
          })
          .subscribe();
      } catch (e) {
        console.error('Failed to setup orders realtime', e);
      }
    };

    setupOrdersRealtime();

    return () => {
      isMounted = false;
      if (ordersChannel && supabaseInstance) {
        supabaseInstance.removeChannel(ordersChannel);
      }
    };
  }, [currentUser?.id, currentUser?.role]);

  // Automated Reconciliation Interval
  useEffect(() => {
    const interval = setInterval(() => {
      FlashGoDB.reconcileAllDrivers();
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Theme configuration
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('flashgo_theme', next);
      return next;
    });
  };

  // Cart Utilities
  const addToCart = (product: Product) => {
    // Reconcile with live product to ensure accurate stock limit
    const liveProduct = products.find(p => p.id === product.id) || product;
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= liveProduct.stock_quantity) {
          addToast(`Maximum stock limit reached for ${liveProduct.name}`, 'warning');
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1, product: liveProduct } // always update to live product details
            : item
        );
      }
      if (liveProduct.stock_quantity <= 0) {
        addToast(`${liveProduct.name} is currently out of stock`, 'warning');
        return prev;
      }
      return [...prev, { product: liveProduct, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    
    const liveProduct = products.find(p => p.id === productId);
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === productId);
      if (!existing) return prev;
      
      const stockLimit = liveProduct ? liveProduct.stock_quantity : existing.product.stock_quantity;
      if (qty > stockLimit) {
        addToast(`Only ${stockLimit} units available`, 'warning');
        return prev.map(item => 
          item.product.id === productId 
            ? { ...item, quantity: stockLimit, product: liveProduct || item.product }
            : item
        );
      }
      
      return prev.map(item => 
        item.product.id === productId 
          ? { ...item, quantity: qty, product: liveProduct || item.product }
          : item
      );
    });
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
  };

  const applyCouponCode = (code: string) => {
    if (fallbackState.failedModules.includes('Coupons')) {
      return { success: false, message: 'Coupons cannot be applied in degraded mode.' };
    }
    const coupon = coupons.find(c => c.code.toUpperCase() === code.toUpperCase() && c.active);
    if (!coupon) return { success: false, message: 'Invalid or inactive coupon code.' };
    
    if (cartSubtotal < coupon.min_order_value) {
      return { 
        success: false, 
        message: `Min order value of ₹${coupon.min_order_value} required for this coupon.` 
      };
    }
    
    setAppliedCoupon(coupon);
    return { success: true, message: `Coupon applied: ₹${coupon.discount_value}${coupon.discount_type === 'percentage' ? '%' : ''} off!` };
  };

  const removeCouponCode = () => {
    setAppliedCoupon(null);
  };

  const cartCount = cart.reduce((acc, curr) => acc + curr.quantity, 0);
  const cartSubtotal = cart.reduce((acc, curr) => {
    const price = curr.product.discount_price || curr.product.price;
    return acc + (price * curr.quantity);
  }, 0);

  const cartDiscount = Math.min(
    appliedCoupon 
      ? appliedCoupon.discount_type === 'percentage'
        ? Math.min((cartSubtotal * appliedCoupon.discount_value) / 100, appliedCoupon.max_discount || 1000)
        : appliedCoupon.discount_value
      : 0,
    cartSubtotal
  );

  const cartDeliveryFee = cartSubtotal > freeDeliveryThreshold ? 0 : baseDeliveryFee;
  const cartTotal = Math.max(0, cartSubtotal - cartDiscount + cartDeliveryFee);

  // Triggering Order Workflows
  const createOrder = async (address: string, speed: 'express' | 'eco' = 'express', paymentMethod: 'wallet' | 'cod' | 'upi' | 'card' = 'wallet', lat: number = 13.3427, lng: number = 74.7472): Promise<Order | null> => {
    if (!currentUser || cart.length === 0) return null;
    
    // Validate stock and prepare items
    const items = cart.map(item => ({
      productId: item.product.id,
      quantity: item.quantity
    }));

    let order: Order | null = null;
    const finalTotal = cartTotal;
    
    if (fallbackState.type !== 'none') {
      addToast('Checkout is currently disabled due to degraded system status. Please try again later.', 'error');
      return null;
    }
    
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        const { OrdersService } = await import('../services/api/OrdersService');
        const orderId = await OrdersService.createOrder(
          currentUser.id,
          address,
          speed,
          paymentMethod,
          items,
          appliedCoupon?.code || null,
          lat,
          lng
        );
        await loadDatabaseData();
        // Since loadDatabaseData sets the orders state asynchronously, we might not have it immediately in the `orders` array here.
        // We'll create a lightweight ref of the order to return to the UI if needed, or grab it from the refreshed state.
        order = {
          id: orderId,
          customer_id: currentUser.id,
          status: 'placed',
          total_amount: finalTotal,
          payment_method: paymentMethod,
          items: []
        } as unknown as Order;
      } else {
        order = FlashGoDB.createOrder(
          currentUser.id,
          items,
          address,
          appliedCoupon?.code || null,
          cartDiscount,
          cartDeliveryFee,
          finalTotal,
          speed,
          paymentMethod
        );
      }
    } catch (e: any) {
      console.error('Checkout failed:', e);
      addToast(e.message || 'Checkout failed', 'error');
      return null;
    }

    if (order) {
      clearCart();


    }
    return order;
  };

  const assignPicker = async (orderId: string, pickerId: string) => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        const { OrdersService } = await import('../services/api/OrdersService');
        await OrdersService.assignPicker(orderId, pickerId);
        loadDatabaseData(); // Refresh UI
      } else {
        FlashGoDB.assignPicker(orderId, pickerId);
      }
    } catch (e) {
      console.error(e);
      addToast('Error assigning picker', 'error');
    }
  };

  const pickItem = async (orderId: string, itemId: string, qty: number, oos = false) => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        const { OrdersService } = await import('../services/api/OrdersService');
        await OrdersService.pickItem(orderId, itemId, qty, oos);
        loadDatabaseData();
      } else {
        FlashGoDB.updatePickerItemStatus(orderId, itemId, qty, oos);
        loadDatabaseData();
      }
    } catch (e) {
      console.error(e);
      addToast('Error picking item', 'error');
    }
  };

  const completePicking = async (orderId: string, pickerId: string) => {
    try {
      const { OrdersService } = await import('../services/api/OrdersService');
      await OrdersService.completePicking(orderId, pickerId);
      loadDatabaseData();
    } catch (e: any) {
      addToast(e.message || 'Failed to complete picking', 'error');
      throw e;
    }
  };

  const packOrder = async (orderId: string, bagNumber: string) => {
    if (!currentUser?.warehouse_id) {
      addToast('Error: No warehouse assigned to your profile.', 'error');
      return;
    }
    
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        const { OrdersService } = await import('../services/api/OrdersService');
        // Use the authenticated user's actual warehouse_id
        await OrdersService.packOrder(orderId, bagNumber, currentUser.warehouse_id, currentUser.id);
        loadDatabaseData();
      } else {
        FlashGoDB.packOrder(orderId, bagNumber);
        loadDatabaseData();
      }
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Error packing order', 'error');
    }
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        const { OrdersService } = await import('../services/api/OrdersService');
        await OrdersService.assignDriver(orderId, driverId);
        loadDatabaseData();
      } else {
        FlashGoDB.assignDriver(orderId, driverId);
      }
    } catch (e) {
      console.error(e);
      addToast('Error assigning driver', 'error');
    }
  };

  const verifyDeliveryOTP = async (orderId: string, otp: string, driverId: string): Promise<boolean> => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        const { OrdersService } = await import('../services/api/OrdersService');
        const success = await OrdersService.verifyDeliveryOTP(orderId, otp, driverId);
        if (success) loadDatabaseData();
        return success;
      }
    } catch (e) {
      console.error(e);
      return false;
    }
    const success = FlashGoDB.verifyDeliveryOTP(orderId, otp, driverId);
    if (success) loadDatabaseData();
    return success;
  };


  const createBatch = (productId: string, batchNumber: string, expiryDate: string, qty: number) => {
    FlashGoDB.createBatch(productId, batchNumber, expiryDate, qty);
    loadDatabaseData();
  };

  const proposeSubstitution = async (orderId: string, originalId: string, suggestedId: string, qty: number, orderItemId: string = '') => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        const { OrdersService } = await import('../services/api/OrdersService');
        await OrdersService.proposeSubstitution(orderId, originalId, suggestedId, qty, orderItemId);
        loadDatabaseData();
      } else {
        FlashGoDB.proposeSubstitution(orderId, originalId, suggestedId);
        loadDatabaseData();
      }
    } catch (e) {
      console.error(e);
      addToast('Error proposing substitution', 'error');
    }
  };

  const respondToSubstitution = async (subId: string, action: 'approved' | 'rejected' | 'auto_refund') => {
    FlashGoDB.respondToSubstitution(subId, action);
    loadDatabaseData();
  };

  const createLogisticsTrip = (orderIds: string[]) => {
    FlashGoDB.createLogisticsTrip(orderIds);
    loadDatabaseData();
  };

  const assignTripDriver = (tripId: string, driverId: string) => {
    FlashGoDB.assignTripDriver(tripId, driverId);
    loadDatabaseData();
  };

  const adjustStock = async (productId: string, quantityChange: number) => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        if (!currentUser?.warehouse_id) throw new Error('No warehouse assigned to profile.');
        const { InventoryService } = await import('../services/api/InventoryService');
        await InventoryService.adjustStock(currentUser.warehouse_id, productId, quantityChange, currentUser.id);
      } else {
        const products = FlashGoDB.getProducts();
        const prod = products.find(p => p.id === productId);
        if (prod) {
          prod.stock_quantity = Math.max(0, prod.stock_quantity + quantityChange);
          FlashGoDB.saveProducts(products);
        }
      }
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Error adjusting stock', 'error');
    }
    loadDatabaseData();
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const { OrdersService } = await import('../services/api/OrdersService');
      await OrdersService.updateOrderStatus(orderId, status);
      loadDatabaseData();
    } catch (e) {
      console.error(e);
      addToast('Error updating status', 'error');
    }
  };

  // Warehouse Procurements — routed through ProcurementService
  const createProcurementOrder = async (vendorId: string, items: { product_id: string; quantity: number; cost_per_unit: number; }[]) => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        if (!currentUser?.warehouse_id) throw new Error('No warehouse assigned to profile.');
        const { ProcurementService } = await import('../services/api/ProcurementService');
        const totalCost = items.reduce((sum, i) => sum + i.quantity * i.cost_per_unit, 0);
        await ProcurementService.createProcurementOrder(vendorId, totalCost, currentUser.warehouse_id, items);
      } else {
        FlashGoDB.createProcurement(vendorId, items);
      }
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Error creating procurement', 'error');
    }
    loadDatabaseData();
  };

  const approveProcurementOrder = async (id: string) => {
    try {
      const { ProcurementService } = await import('../services/api/ProcurementService');
      await ProcurementService.approveProcurementOrder(id);
    } catch {
      FlashGoDB.approveProcurement(id);
    }
    loadDatabaseData();
  };



  const prevOrdersRef = useRef<Record<string, string>>({});
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (orders.length > 0) {
      if (isInitialLoadRef.current) {
        orders.forEach(order => {
          prevOrdersRef.current[order.id] = order.status;
        });
        isInitialLoadRef.current = false;
        return;
      }

      orders.forEach(order => {
        const prevStatus = prevOrdersRef.current[order.id];
        const formattedId = `#${order.id.toUpperCase().slice(-6)}`;
        
        if (prevStatus === undefined) {
          addToast(`📥 Order ${formattedId} placed successfully! Wallet debited and warehouse alerted.`, 'success');
        } else if (prevStatus !== order.status) {
          let msg = '';
          let type: 'info' | 'success' | 'warning' | 'error' = 'info';

          if (order.status === 'picking') {
            msg = `🍳 Order ${formattedId} is being picked! Store picker is now sourcing items.`;
            type = 'info';
          } else if (order.status === 'packed') {
            msg = `🎒 Order ${formattedId} packed! Sealed inside Bag #${order.bag_number || 'TBA'} and ready.`;
            type = 'success';
          } else if (order.status === 'out_for_delivery') {
            msg = `🚴 Rider on the way! Courier is racing to your doorstep with ${formattedId}.`;
            type = 'warning';
          } else if (order.status === 'delivered') {
            msg = `🎉 Order ${formattedId} delivered! Share your feedback in the ratings modal.`;
            type = 'success';
          }

          if (msg) {
            addToast(msg, type);
          }
        }
        
        prevOrdersRef.current[order.id] = order.status;
      });
    } else {
      orders.forEach(order => {
        prevOrdersRef.current[order.id] = order.status;
      });
    }
  }, [orders]);

  const updateCurrentUserProfile = (profile: Profile) => {
    FlashGoDB.updateProfile(profile as any);
    setCurrentUser(profile);
  };

  const addWalletFunds = async (userId: string, amount: number) => {
    try {
      const { WalletService } = await import('../services/api/WalletService');
      await WalletService.addWalletFunds(userId, amount, 'Admin top-up');
    } catch {
      FlashGoDB.addWalletFunds(userId, amount);
    }
    loadDatabaseData();
  };

  const reconcileDriverCOD = async (driverId: string) => {
    try {
      const { supabase } = await import('../services/api/supabaseClient');
      if (supabase) {
        const { FinanceService } = await import('../services/api/FinanceService');
        await FinanceService.reconcileDriverCOD(driverId);
        loadDatabaseData();
      } else {
        FlashGoDB.reconcileDriverCOD(driverId);
        loadDatabaseData();
      }
    } catch (e) {
      console.error(e);
      addToast('Error reconciling COD', 'error');
    }
  };

  return (
    <AppContext.Provider value={{
      activeRole,
      setActiveRole,
      currentUser,
      updateCurrentUserProfile,
      addWalletFunds,
      isAuthenticated,
      login,
      logout,
      fallbackState,
      categories,
      products,
      coupons,
      vendors,
      procurementOrders,
      batches,
      substitutions,
      trips,
      logisticsTrips,
      darkStores,
      profiles,
      refreshData: loadDatabaseData,
      cart,
      addToCart,
      removeFromCart,
      updateCartQuantity,
      clearCart,
      cartCount,
      cartSubtotal,
      cartDiscount,
      cartDeliveryFee,
      baseDeliveryFee,
      freeDeliveryThreshold,
      cartTotal,
      appliedCoupon,
      applyCouponCode,
      removeCouponCode,
      orders,
      createOrder,
      assignPicker,
      pickItem,
      completePicking,
      packOrder,
      assignDriver,
      verifyDeliveryOTP,
      createBatch,
      proposeSubstitution,
      respondToSubstitution,
      createLogisticsTrip,
      assignTripDriver,
      theme,
      toggleTheme,
      createProcurementOrder,
      approveProcurementOrder,
      adjustStock,
      updateOrderStatus,
      toasts,
      addToast,
      removeToast,
      rateOrder,
      reconcileDriverCOD,
      isLoadingData,
      dataLoadError,
      loadCatalogForWarehouse: async (warehouseId: string | null) => {
        if (!warehouseId) {
          setProducts([]);
          return;
        }
        try {
          const { InventoryService } = await import('../services/api/InventoryService');
          const prods = await InventoryService.getWarehouseStock(warehouseId);
          setProducts(prods);
        } catch (e) {
          console.error(e);
        }
      }
    }}>
      {children}
    </AppContext.Provider>
  );
};
