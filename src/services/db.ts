// FlashGO Local Engine & Supabase Bindings
import { createClient } from '@supabase/supabase-js';

// --- TYPES ---
export type UserRole = 'customer' | 'picker' | 'driver' | 'admin' | 'warehouse_staff';
export type OrderStatus = 'placed' | 'picking' | 'waiting_for_packing' | 'packing' | 'packed' | 'staged' | 'handed_off' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type DiscountType = 'percentage' | 'flat';
export type TxType = 'credit' | 'debit';

export interface DarkStore {
  id: string;
  name: string;
  code: string;
  location: string;
  lat: number;
  lng: number;
  radius: number;
  activeOrders: number;
  capacity: string;
  status: 'optimal' | 'warning' | 'critical';
  staffCount: number;
}

export interface Profile {
  id: string;
  email: string;
  phone: string;
  full_name: string;
  role: UserRole;
  loyalty_points: number;
  referral_code: string;
  referred_by: string | null;
  wallet_balance: number;
  cod_wallet_liability?: number;
  is_online?: boolean;
  warehouse_id?: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  image_url?: string;
  active: boolean;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  discount_price?: number | null;
  sku: string;
  barcode: string;
  image_url: string;
  is_active?: boolean;
  stock_quantity: number;
  warehouse_location: string;
  rating_avg: number;
  rating_count: number;
  created_at?: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  min_order_value: number;
  max_discount?: number;
  active: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  picked_quantity: number;
  status: 'pending' | 'picked' | 'out_of_stock';
  // Extra joined product info for UI
  product?: Product;
}

export interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  quantity_remaining: number;
}

export interface OrderSubstitution {
  id: string;
  order_id: string;
  original_item_id: string;
  suggested_product_id: string;
  customer_action: 'pending' | 'approved' | 'rejected' | 'auto_refund';
  actioned_at: string | null;
  created_at: string;
  suggested_product?: Product;
}

export interface LogisticsTrip {
  id: string;
  warehouse_id: string;
  driver_id: string | null;
  status: 'pending' | 'accepted' | 'in_transit' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  picker_id: string | null;
  driver_id: string | null;
  status: OrderStatus;
  total_amount: number;
  discount_amount: number;
  coupon_code: string | null;
  delivery_fee: number;
  delivery_address: string;
  delivery_lat: number;
  delivery_lng: number;
  otp_code: string;
  bag_number: string | null;
  warehouse_id?: string;
  created_at: string;
  updated_at: string;
  trip_id?: string | null;
  delivery_speed?: 'express' | 'eco';
  is_cold_chain?: boolean;
  payment_method?: 'wallet' | 'cod' | 'upi' | 'card';
  cod_collected?: boolean;
  // Extra joined items
  items?: OrderItem[];
  customer_name?: string;
  customer_phone?: string;
  picker_name?: string;
  driver_name?: string;
  rated?: boolean;
  rating?: number;
}

export interface Vendor {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  created_at: string;
}

export interface ProcurementOrder {
  id: string;
  vendor_id: string;
  status: 'cancelled' | 'pending' | 'approved' | 'partially_received' | 'received';
  total_cost: number;
  created_at: string;
  vendor_name?: string;
  items?: { id: string; product_id: string; quantity: number; cost_per_unit: number; product_name?: string; received_quantity?: number }[];
}

export interface DriverEarning {
  id: string;
  driver_id: string;
  order_id: string;
  earning_amount: number;
  commission_amount: number;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: TxType;
  description: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  customer_id: string;
  customer_name: string;
  subject: string;
  category: 'refund' | 'delivery' | 'damaged' | 'other';
  status: 'open' | 'pending' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  related_order?: { id: string; picker_name: string; driver_name: string };
  messages: { sender: 'customer' | 'support'; text: string; time: string; attachment_url?: string }[];
}

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  segment: 'all' | 'vip' | 'inactive' | 'new';
  status: 'sent' | 'scheduled';
  scheduled_for?: string;
  created_at: string;
}

export interface StaffShift {
  id: string;
  staff_id: string;
  staff_name: string;
  role: UserRole;
  date: string;
  shift_time: string;
  attendance: 'present' | 'absent' | 'pending';
}

export interface BlinkPass {
  id: string;
  user_id: string;
  plan_name: 'Monthly' | 'Quarterly' | 'Yearly';
  status: 'active' | 'expired';
  expires_at: string;
  price: number;
}

// --- SUPABASE CLIENT SETUP ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

// --- INITIAL MOCK SEED DATA ---
const INITIAL_KATEGORIES: Category[] = [
  { id: 'c1', name: 'Fruits & Vegetables', slug: 'fruits-vegetables', icon: 'Apple', active: true },
  { id: 'c2', name: 'Dairy, Bread & Eggs', slug: 'dairy-bread-eggs', icon: 'Milk', active: true },
  { id: 'c3', name: 'Snacks & Munchies', slug: 'snacks-munchies', icon: 'Cookie', active: true },
  { id: 'c4', name: 'Cold Drinks & Juices', slug: 'cold-drinks-juices', icon: 'CupSoda', active: true },
  { id: 'c5', name: 'Household Essentials', slug: 'household-essentials', icon: 'Sparkles', active: true },
  { id: 'c6', name: 'Personal Care', slug: 'personal-care', icon: 'Heart', active: true }
];

const INITIAL_PRODUCTS: Product[] = [
  // Fruits & Veggies
  { id: 'p1', category_id: 'c1', name: 'Fresh Organic Bananas', description: 'Sweet farm bananas. Bunch of 6.', price: 239, discount_price: 15920, sku: 'SKU-FR-BAN', barcode: '012345678901', image_url: 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=300&q=80', stock_quantity: 45, warehouse_location: 'F0-FV01-01-010-A', rating_avg: 4.8, rating_count: 120 },
  { id: 'p2', category_id: 'c1', name: 'Red Royal Gala Apples', description: 'Crisp and sweet red apples. Pack of 4.', price: 359, discount_price: 25520, sku: 'SKU-FR-APL', barcode: '012345678902', image_url: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6fac6?w=300&q=80', stock_quantity: 30, warehouse_location: 'F0-FV01-02-005-C', rating_avg: 4.6, rating_count: 95 },
  { id: 'p3', category_id: 'c1', name: 'Hydroponic Tomatoes', description: 'Juicy and sweet red cherry tomatoes. 250g box.', price: 279, sku: 'SKU-VG-TOM', barcode: '012345678903', image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300&q=80', stock_quantity: 18, warehouse_location: 'Aisle A-3', rating_avg: 4.9, rating_count: 45 },
  { id: 'p4', category_id: 'c1', name: 'Fresh English Cucumber', description: 'Crisp green cucumber. Ideal for salads. Pack of 2.', price: 159, discount_price: 9520, sku: 'SKU-VG-CUC', barcode: '012345678913', image_url: 'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=300&q=80', stock_quantity: 40, warehouse_location: 'Aisle A-4', rating_avg: 4.5, rating_count: 70 },

  // Dairy & Amul
  { id: 'p5', category_id: 'c2', name: 'Amul Gold Full Cream Milk', description: 'Fresh full-cream milk. 1 Liter.', price: 66, discount_price: 66, sku: 'SKU-DY-MILK', barcode: '012345678904', image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&q=80', stock_quantity: 50, warehouse_location: 'F0-CR01-03-002-B', rating_avg: 4.7, rating_count: 340 },
  { id: 'p6', category_id: 'c2', name: 'Amul Pasteurised Butter', description: 'Rich and creamy Amul butter. 100g.', price: 58, discount_price: 56, sku: 'SKU-DY-BTR', barcode: '012345678905', image_url: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=300&q=80', stock_quantity: 25, warehouse_location: 'Aisle B-2', rating_avg: 4.5, rating_count: 210 },
  { id: 'p7', category_id: 'c2', name: 'Amul Kool Kesar', description: 'Refreshing milk beverage. 200ml bottle.', price: 25, sku: 'SKU-DY-KOOL', barcode: '012345678906', image_url: 'https://images.unsplash.com/photo-1589367920969-ab8e050eb0e9?w=300&q=80', stock_quantity: 12, warehouse_location: 'Aisle B-3', rating_avg: 4.9, rating_count: 85 },
  { id: 'p8', category_id: 'c2', name: 'Amul Masti Dahi', description: 'Fresh set curd. 400g tub.', price: 35, discount_price: 32, sku: 'SKU-DY-DAHI', barcode: '012345678914', image_url: 'https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=300&q=80', stock_quantity: 35, warehouse_location: 'Aisle B-4', rating_avg: 4.8, rating_count: 155 },

  // PepsiCo Snacks
  { id: 'p9', category_id: 'c3', name: "Lay's Classic Salted", description: 'Crispy thin sea salt potato chips. 50g bag.', price: 20, discount_price: 20, sku: 'SKU-SN-CHIP', barcode: '012345678907', image_url: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=300&q=80', stock_quantity: 80, warehouse_location: 'F0-A01-14-006-A', rating_avg: 4.4, rating_count: 520 },
  { id: 'p10', category_id: 'c3', name: 'Kurkure Masala Munch', description: 'Spicy crunchy corn puffs. 90g.', price: 20, discount_price: 20, sku: 'SKU-SN-KURK', barcode: '012345678908', image_url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=300&q=80', stock_quantity: 40, warehouse_location: 'Aisle C-2', rating_avg: 4.8, rating_count: 180 },
  { id: 'p11', category_id: 'c3', name: 'Doritos Nacho Cheese', description: 'Cheese flavored tortilla chips. 60g.', price: 30, discount_price: 30, sku: 'SKU-SN-DORI', barcode: '012345678915', image_url: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=300&q=80', stock_quantity: 60, warehouse_location: 'Aisle C-3', rating_avg: 4.6, rating_count: 110 },

  // PepsiCo Drinks
  { id: 'p12', category_id: 'c4', name: 'Pepsi Black', description: 'Zero sugar cola. 330ml can.', price: 40, discount_price: 40, sku: 'SKU-DR-PEP', barcode: '012345678909', image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300&q=80', stock_quantity: 120, warehouse_location: 'Aisle D-1', rating_avg: 4.3, rating_count: 150 },
  { id: 'p13', category_id: 'c4', name: 'Slice Mango Drink', description: 'Thick mango fruit drink. 600ml.', price: 40, discount_price: 38, sku: 'SKU-DR-SLI', barcode: '012345678910', image_url: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=300&q=80', stock_quantity: 35, warehouse_location: 'Aisle D-2', rating_avg: 4.8, rating_count: 230 },

  // HUL Household
  { id: 'p14', category_id: 'c5', name: 'Vim Lemon Dishwash Liquid', description: 'Concentrated dish washing gel. 500ml.', price: 105, sku: 'SKU-HH-VIM', barcode: '012345678911', image_url: 'https://images.unsplash.com/photo-1585553616435-2dc0a54e271d?w=300&q=80', stock_quantity: 50, warehouse_location: 'Aisle E-1', rating_avg: 4.5, rating_count: 75 },
  { id: 'p15', category_id: 'c5', name: 'Surf Excel Matic Liquid', description: 'Top load liquid detergent. 1 Liter.', price: 230, discount_price: 210, sku: 'SKU-HH-SRF', barcode: '012345678912', image_url: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=300&q=80', stock_quantity: 65, warehouse_location: 'Aisle E-2', rating_avg: 4.7, rating_count: 190 }
];

const INITIAL_COUPONS: Coupon[] = [
  { id: 'cp1', code: 'FLASH20', discount_type: 'percentage', discount_value: 20, min_order_value: 10, max_discount: 10, active: true },
  { id: 'cp2', code: 'FREESHIP', discount_type: 'flat', discount_value: 3.00, min_order_value: 15, active: true },
  { id: 'cp3', code: 'GO50', discount_type: 'flat', discount_value: 5.00, min_order_value: 25, active: true }
];

const INITIAL_PROFILES: Profile[] = [
  { id: 'u-cust', email: 'customer@flashgo.com', phone: '+919876543210', full_name: 'Dhanush Kumar', role: 'customer', loyalty_points: 120, referral_code: 'DHA777', referred_by: null, wallet_balance: 250, cod_wallet_liability: 0, created_at: new Date().toISOString() },
  { id: 'u-pick', email: 'picker@flashgo.com', phone: '+919876543211', full_name: 'Alex Mercer (Store Picker)', role: 'picker', loyalty_points: 0, referral_code: 'ALX111', referred_by: null, wallet_balance: 0, cod_wallet_liability: 0, created_at: new Date().toISOString() },
  { id: 'u-driv', email: 'driver@flashgo.com', phone: '+919876543212', full_name: 'Carlos Santana (Rider)', role: 'driver', loyalty_points: 0, referral_code: 'KAR222', referred_by: null, wallet_balance: 2624, cod_wallet_liability: 0, created_at: new Date().toISOString() },
  { id: 'u-whse', email: 'warehouse@flashgo.com', phone: '+919876543213', full_name: 'Sarah Connor (Warehouse Staff)', role: 'warehouse_staff', loyalty_points: 0, referral_code: 'SAR333', referred_by: null, wallet_balance: 0, cod_wallet_liability: 0, created_at: new Date().toISOString() },
  { id: 'u-admin', email: 'admin@flashgo.com', phone: '+919876543214', full_name: 'FlashGO SuperAdmin', role: 'admin', loyalty_points: 0, referral_code: 'ADM999', referred_by: null, wallet_balance: 80000, cod_wallet_liability: 0, created_at: new Date().toISOString() }
];

const INITIAL_VENDORS: Vendor[] = [
  { id: 'v1', name: 'Amul (GCMMF)', contact_person: 'Rakesh Patel', email: 'distributor@amul.coop', phone: '+919876500101', address: 'Anand, Gujarat, India', created_at: new Date().toISOString() },
  { id: 'v2', name: 'PepsiCo India (Lays/Kurkure)', contact_person: 'Vikram Singh', email: 'sales@pepsico.com', phone: '+919876500102', address: 'Gurugram, Haryana, India', created_at: new Date().toISOString() },
  { id: 'v3', name: 'Hindustan Unilever (HUL)', contact_person: 'Neha Sharma', email: 'supply@unilever.com', phone: '+919876500103', address: 'Mumbai, Maharashtra, India', created_at: new Date().toISOString() }
];

const INITIAL_PROCUREMENTS: ProcurementOrder[] = [
  { id: 'po1', vendor_id: 'v1', status: 'received', total_cost: 20000, created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: 'po2', vendor_id: 'v2', status: 'approved', total_cost: 38400, created_at: new Date(Date.now() - 1 * 86400000).toISOString() }
];

const INITIAL_WALLET: WalletTransaction[] = [
  { id: 'wt1', user_id: 'u-cust', amount: 50.00, type: 'credit', description: 'Card Add Money', created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'wt2', user_id: 'u-cust', amount: 25.50, type: 'credit', description: 'Referral Bonus', created_at: new Date(Date.now() - 2 * 86400000).toISOString() }
];

const INITIAL_EARNINGS: DriverEarning[] = [
  { id: 'de1', driver_id: 'u-driv', order_id: 'mock-o1', earning_amount: 8.50, commission_amount: 1.50, created_at: new Date(Date.now() - 1 * 86400000).toISOString() },
  { id: 'de2', driver_id: 'u-driv', order_id: 'mock-o2', earning_amount: 12.00, commission_amount: 2.00, created_at: new Date().toISOString() }
];

const INITIAL_TICKETS: SupportTicket[] = [
  { id: 't1', customer_id: 'u-cust', customer_name: 'Dhanush Kumar', subject: 'Fresh bananas were slightly bruised', category: 'damaged', status: 'open', priority: 'medium', created_at: new Date(Date.now() - 3600000).toISOString(), related_order: { id: 'ORD-8923A', picker_name: 'Alex Mercer', driver_name: 'Carlos Santana' }, messages: [{ sender: 'customer', text: 'Hi, I received my organic bananas today but 3 of them were bruised. Can I request a refund?', time: new Date(Date.now() - 3600000).toLocaleTimeString(), attachment_url: 'https://images.unsplash.com/photo-1481349518771-20055b2a7b24?w=400&q=80' }] },
  { id: 't2', customer_id: 'u-cust', customer_name: 'Dhanush Kumar', subject: 'Rider took a longer route', category: 'delivery', status: 'resolved', priority: 'low', created_at: new Date(Date.now() - 86400000).toISOString(), messages: [{ sender: 'customer', text: 'Rider delayed delivery by 10 mins', time: new Date(Date.now() - 86400000).toLocaleTimeString() }, { sender: 'support', text: 'Apologies for the delay! We have refunded the delivery fee to your wallet.', time: new Date(Date.now() - 86400000 + 1200000).toLocaleTimeString() }] }
];

const INITIAL_PUSH: PushNotification[] = [
  { id: 'n1', title: 'Weekend Flash Sale! ⚡', body: 'Get 50% cashback on fresh mangoes and summer cold drinks!', segment: 'all', status: 'sent', created_at: new Date(Date.now() - 172800000).toISOString() },
  { id: 'n2', title: 'We Miss You! 🛒', body: 'Here is an exclusive ₹5 discount coupon: MISSYOU5. Valid today only!', segment: 'inactive', status: 'scheduled', scheduled_for: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() }
];

const INITIAL_SHIFTS: StaffShift[] = [
  { id: 's1', staff_id: 'u-pick', staff_name: 'Alex Mercer', role: 'picker', date: new Date().toISOString().split('T')[0], shift_time: '06:00 AM - 02:00 PM', attendance: 'present' },
  { id: 's2', staff_id: 'u-driv', staff_name: 'Carlos Santana', role: 'driver', date: new Date().toISOString().split('T')[0], shift_time: '02:00 PM - 10:00 PM', attendance: 'absent' },
  { id: 's3', staff_id: 'u-whse', staff_name: 'Sarah Connor', role: 'warehouse_staff', date: new Date().toISOString().split('T')[0], shift_time: '09:00 AM - 06:00 PM', attendance: 'present' }
];

const INITIAL_PASSES: BlinkPass[] = [
  { id: 'bp-1', user_id: 'cust2', plan_name: 'Monthly', status: 'active', expires_at: '2026-06-01T00:00:00Z', price: 799 },
];

const INITIAL_DARK_STORES: DarkStore[] = [
  { id: 'ds-central', name: 'Udupi Central Hub', code: 'WH-01', location: 'Udupi Bus Stand', lat: 13.3427, lng: 74.7472, radius: 15000, activeOrders: 8, capacity: '92%', status: 'optimal', staffCount: 14 }
];

const INITIAL_BATCHES: ProductBatch[] = [
  { id: 'b1', product_id: 'p1', batch_number: 'BAT-BAN-001', expiry_date: new Date(Date.now() + 2 * 86400000).toISOString(), quantity_remaining: 20 },
  { id: 'b2', product_id: 'p1', batch_number: 'BAT-BAN-002', expiry_date: new Date(Date.now() + 5 * 86400000).toISOString(), quantity_remaining: 25 },
  { id: 'b3', product_id: 'p5', batch_number: 'BAT-MILK-01', expiry_date: new Date(Date.now() + 1 * 86400000).toISOString(), quantity_remaining: 15 },
  { id: 'b4', product_id: 'p5', batch_number: 'BAT-MILK-02', expiry_date: new Date(Date.now() + 4 * 86400000).toISOString(), quantity_remaining: 35 }
];

const INITIAL_ORDERS: Order[] = [
  {
    id: 'mock-cod-o1', customer_id: 'u-cust', picker_id: 'u-pick', driver_id: 'u-driv',
    status: 'delivered', total_amount: 350.50, discount_amount: 0, coupon_code: null, delivery_fee: 15,
    delivery_address: '123 Main St, Udupi', delivery_lat: 13.3427, delivery_lng: 74.7472,
    otp_code: '123456', bag_number: 'BAG-A1', created_at: new Date(Date.now() - 3600000).toISOString(), updated_at: new Date().toISOString(),
    payment_method: 'cod', cod_collected: false,
    items: [
      { id: 'mock-item-1', order_id: 'mock-cod-o1', product_id: 'p1', quantity: 2, price: 159.20, picked_quantity: 2, status: 'picked' }
    ]
  },
  {
    id: 'mock-cod-o2', customer_id: 'u-cust', picker_id: 'u-pick', driver_id: 'u-driv',
    status: 'delivered', total_amount: 850.00, discount_amount: 50, coupon_code: 'GO50', delivery_fee: 0,
    delivery_address: '45 Beach Rd, Udupi', delivery_lat: 13.35, delivery_lng: 74.75,
    otp_code: '654321', bag_number: 'BAG-B2', created_at: new Date(Date.now() - 7200000).toISOString(), updated_at: new Date().toISOString(),
    payment_method: 'cod', cod_collected: false,
    items: [
      { id: 'mock-item-2', order_id: 'mock-cod-o2', product_id: 'p5', quantity: 3, price: 159, picked_quantity: 3, status: 'picked' }
    ]
  }
];

// Load or Seed Local Storage
const getLocal = <T>(key: string, initial: T): T => {
  const data = localStorage.getItem(`flashgo_${key}`);
  if (!data) {
    localStorage.setItem(`flashgo_${key}`, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(data);
};

const setLocal = <T>(key: string, data: T) => {
  localStorage.setItem(`flashgo_${key}`, JSON.stringify(data));
};

const INITIAL_SUBSTITUTIONS: OrderSubstitution[] = [
  {
    id: 'sub-mock1',
    order_id: 'mock-cod-o1',
    original_item_id: 'mock-item-1',
    suggested_product_id: 'p2', // suggest apples instead of bananas
    customer_action: 'pending',
    actioned_at: null,
    created_at: new Date().toISOString()
  }
];

// --- DATA ACCESS LAYER ---
export class FlashGoDB {
  static getBatches(): ProductBatch[] {
    return getLocal('product_batches', INITIAL_BATCHES);
  }

  static saveBatches(batches: ProductBatch[]) {
    setLocal('product_batches', batches);
    this.triggerUpdate();
  }

  static createBatch(productId: string, batchNumber: string, expiryDate: string, quantity: number) {
    const batches = this.getBatches();
    batches.push({
      id: 'batch-' + Math.random().toString(36).substr(2, 9),
      product_id: productId,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      quantity_remaining: quantity
    });
    this.saveBatches(batches);
  }


  static getSubstitutions(): OrderSubstitution[] {
    return getLocal('order_substitutions', INITIAL_SUBSTITUTIONS).map(sub => {
      const products = this.getProducts();
      return {
        ...sub,
        suggested_product: products.find(p => p.id === sub.suggested_product_id)
      };
    });
  }

  static proposeSubstitution(orderId: string, originalItemId: string, suggestedProductId: string) {
    const subs = getLocal('order_substitutions', INITIAL_SUBSTITUTIONS);
    const newSub: OrderSubstitution = {
      id: 'sub-' + Math.random().toString(36).substr(2, 9),
      order_id: orderId,
      original_item_id: originalItemId,
      suggested_product_id: suggestedProductId,
      customer_action: 'pending',
      actioned_at: null,
      created_at: new Date().toISOString()
    };
    subs.push(newSub);
    setLocal('order_substitutions', subs);
    this.triggerUpdate();
  }

  static respondToSubstitution(subId: string, action: 'approved' | 'rejected' | 'auto_refund') {
    const subs = getLocal('order_substitutions', INITIAL_SUBSTITUTIONS);
    const sub = subs.find(s => s.id === subId);
    if (sub && sub.customer_action === 'pending') {
      sub.customer_action = action;
      sub.actioned_at = new Date().toISOString();
      setLocal('order_substitutions', subs);

      // Apply result to order
      const orders = getLocal('orders', [] as Order[]);
      const order = orders.find(o => o.id === sub.order_id);
      if (order && order.items) {
        const item = order.items.find(i => i.id === sub.original_item_id);
        if (item) {
          if (action === 'approved') {
            // Swap item to replacement product
            item.product_id = sub.suggested_product_id;
            item.status = 'picked';
            item.picked_quantity = item.quantity;
          } else {
            // Rejected or Auto-Refund
            item.status = 'out_of_stock';
            item.picked_quantity = 0;
            // Refund wallet
            const refund = Number(item.price) * item.quantity;
            this.addWalletFunds(order.customer_id, refund, `Refund: Rejected substitution for order #${order.id.slice(-6).toUpperCase()}`);
          }
          setLocal('orders', orders);
        }
      }
      this.triggerUpdate();
    }
  }

  static getLogisticsTrips(): LogisticsTrip[] {
    return getLocal('logistics_trips', [] as LogisticsTrip[]);
  }

  static saveLogisticsTrips(trips: LogisticsTrip[]) {
    setLocal('logistics_trips', trips);
    this.triggerUpdate();
  }

  static createLogisticsTrip(orderIds: string[]): LogisticsTrip {
    const trips = this.getLogisticsTrips();
    const newTrip: LogisticsTrip = {
      id: 'trip-' + Math.random().toString(36).substr(2, 9),
      warehouse_id: 'wh-main',
      driver_id: null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    trips.push(newTrip);
    this.saveLogisticsTrips(trips);

    // Update trip_id in matching orders
    const orders = getLocal('orders', [] as Order[]);
    orders.forEach(o => {
      if (orderIds.includes(o.id)) {
        o.trip_id = newTrip.id;
      }
    });
    setLocal('orders', orders);
    this.triggerUpdate();

    return newTrip;
  }

  static assignTripDriver(tripId: string, driverId: string) {
    const trips = this.getLogisticsTrips();
    const trip = trips.find(t => t.id === tripId);
    if (trip) {
      trip.driver_id = driverId;
      trip.status = 'accepted';
      this.saveLogisticsTrips(trips);

      // Assign driver to all orders in this trip
      const orders = getLocal('orders', [] as Order[]);
      orders.forEach(o => {
        if (o.trip_id === trip.id) {
          o.driver_id = driverId;
          o.status = 'out_for_delivery';
        }
      });
      setLocal('orders', orders);
      this.triggerUpdate();
    }
  }

  static completeTrip(tripId: string) {
    const trips = this.getLogisticsTrips();
    const trip = trips.find(t => t.id === tripId);
    if (trip) {
      trip.status = 'completed';
      this.saveLogisticsTrips(trips);
      this.triggerUpdate();
    }
  }

  static getCategories(): Category[] {
    return getLocal('categories', INITIAL_KATEGORIES);
  }

  static getProducts(): Product[] {
    const prods = getLocal('products', INITIAL_PRODUCTS);
    
    // TEMPORARY FORCE RESET: The user's cache is stuck, so we will force a reset right now.
    // We safely check if "Amul Masti Dahi" is missing. If it is, we force reload INITIAL_PRODUCTS.
    const hasAmul = prods.some(p => p && p.name && typeof p.name === 'string' && p.name.includes('Amul Masti Dahi'));
    if (!hasAmul) {
      setLocal('products', INITIAL_PRODUCTS);
      return INITIAL_PRODUCTS;
    }
    
    return prods;
  }

  static saveProducts(products: Product[]) {
    setLocal('products', products);
    this.triggerUpdate();
  }

  static getCoupons(): Coupon[] {
    return getLocal('coupons', INITIAL_COUPONS);
  }

  static saveCoupons(coupons: Coupon[]) {
    setLocal('coupons', coupons);
    this.triggerUpdate();
  }

  static getProfiles(): Profile[] {
    const profiles = getLocal('profiles', INITIAL_PROFILES);
    if (profiles.some(p => p.full_name.includes('Warehouse Mgr')) || profiles.find(p => p.id === 'u-cust')?.wallet_balance === 6040) {
      setLocal('profiles', INITIAL_PROFILES);
      return INITIAL_PROFILES;
    }
    return profiles;
  }

  static getProfile(id: string): Profile | undefined {
    return this.getProfiles().find(p => p.id === id);
  }

  static updateProfile(profile: Profile) {
    const profiles = this.getProfiles().map(p => p.id === profile.id ? profile : p);
    setLocal('profiles', profiles);
    this.triggerUpdate();
  }

  static getVendors(): Vendor[] {
    const vendors = getLocal('vendors', INITIAL_VENDORS);
    // Force update if old dummy data is present
    if (vendors.some(v => v.name.includes('FreshFarm'))) {
      setLocal('vendors', INITIAL_VENDORS);
      return INITIAL_VENDORS;
    }
    return vendors;
  }

  static saveVendors(vendors: Vendor[]) {
    setLocal('vendors', vendors);
    this.triggerUpdate();
  }

  static createVendor(data: Omit<Vendor, 'id' | 'created_at'>) {
    const vendors = this.getVendors();
    const newVendor: Vendor = {
      ...data,
      id: 'v' + Math.random().toString(36).substr(2, 9),
      created_at: new Date().toISOString()
    };
    vendors.push(newVendor);
    this.saveVendors(vendors);
    return newVendor;
  }

  static getProcurements(): ProcurementOrder[] {
    const list = getLocal('procurements', INITIAL_PROCUREMENTS);
    const vendors = this.getVendors();
    const products = this.getProducts();

    return list.map(po => {
      const hydratedItems = po.items ? po.items.map(item => {
        const prod = products.find(p => p.id === item.product_id);
        return {
          ...item,
          product_name: prod ? prod.name : (item.product_name || 'Unknown Product')
        };
      }) : undefined;

      return {
        ...po,
        vendor_name: vendors.find(v => v.id === po.vendor_id)?.name || 'Unknown Vendor',
        items: hydratedItems
      };
    });
  }

  static createProcurement(vendorId: string, items: { product_id: string; quantity: number; cost_per_unit: number }[]) {
    const orders = getLocal('procurements', INITIAL_PROCUREMENTS);
    const totalCost = items.reduce((sum, item) => sum + (item.quantity * item.cost_per_unit), 0);
    const newOrder: ProcurementOrder = {
      id: 'po-' + Math.random().toString(36).substr(2, 9),
      vendor_id: vendorId,
      status: 'pending',
      total_cost: totalCost,
      created_at: new Date().toISOString(),
      items: items.map(i => ({ ...i, id: Date.now().toString() + Math.random().toString() }))
    };
    orders.unshift(newOrder);
    setLocal('procurements', orders);
    this.triggerUpdate();
  }

  static approveProcurement(id: string) {
    const orders = getLocal('procurements', INITIAL_PROCUREMENTS);
    const found = orders.find(po => po.id === id);
    if (found && found.status === 'pending') {
      found.status = 'approved';
      setLocal('procurements', orders);
      this.triggerUpdate();
    }
  }

  static receiveProcurement(id: string) {
    const orders = getLocal('procurements', INITIAL_PROCUREMENTS);
    const found = orders.find(po => po.id === id);
    if (found && found.status === 'approved') {
      found.status = 'received';
      setLocal('procurements', orders);
      
      const products = this.getProducts();
      if (found.items && found.items.length > 0) {
        found.items.forEach(item => {
          const p = products.find(prod => prod.id === item.product_id);
          if (p) {
            p.stock_quantity += Number(item.quantity);
          }
        });
      } else {
        // Fallback for mock/legacy orders
        products.forEach(p => {
          p.stock_quantity += 20;
        });
      }
      this.saveProducts(products);
      this.triggerUpdate();
    }
  }

  static deleteProcurement(id: string) {
    const orders = getLocal('procurements', INITIAL_PROCUREMENTS);
    const filtered = orders.filter(po => po.id !== id);
    setLocal('procurements', filtered);
    this.triggerUpdate();
  }

  static getWalletTransactions(userId: string): WalletTransaction[] {
    const tx = getLocal('wallet_transactions', INITIAL_WALLET);
    return tx.filter(t => t.user_id === userId).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  static addWalletFunds(userId: string, amount: number, desc = 'Add Funds') {
    const profile = this.getProfile(userId);
    if (profile) {
      profile.wallet_balance = Number(profile.wallet_balance) + amount;
      this.updateProfile(profile);

      const tx = getLocal('wallet_transactions', INITIAL_WALLET);
      tx.unshift({
        id: 'wt-' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        amount,
        type: 'credit',
        description: desc,
        created_at: new Date().toISOString()
      });
      setLocal('wallet_transactions', tx);
      this.triggerUpdate();
    }
  }

  static deductWalletFunds(userId: string, amount: number, desc = 'Debit Funds'): boolean {
    const profile = this.getProfile(userId);
    if (profile && Number(profile.wallet_balance) >= amount) {
      profile.wallet_balance = Number(profile.wallet_balance) - amount;
      this.updateProfile(profile);

      const tx = getLocal('wallet_transactions', INITIAL_WALLET);
      tx.unshift({
        id: 'wt-' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        amount,
        type: 'debit',
        description: desc,
        created_at: new Date().toISOString()
      });
      setLocal('wallet_transactions', tx);
      this.triggerUpdate();
      return true;
    }
    return false;
  }

  static getDriverEarnings(driverId: string): DriverEarning[] {
    const list = getLocal('driver_earnings', INITIAL_EARNINGS);
    return list.filter(e => e.driver_id === driverId).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  static addDriverEarning(driverId: string, orderId: string, earning: number, commission: number) {
    const list = getLocal('driver_earnings', INITIAL_EARNINGS);
    list.unshift({
      id: 'de-' + Math.random().toString(36).substr(2, 9),
      driver_id: driverId,
      order_id: orderId,
      earning_amount: earning,
      commission_amount: commission,
      created_at: new Date().toISOString()
    });
    setLocal('driver_earnings', list);

    // Update driver profile wallet
    const driver = this.getProfile(driverId);
    if (driver) {
      driver.wallet_balance = Number(driver.wallet_balance) + earning;
      this.updateProfile(driver);
    }
    this.triggerUpdate();
  }

  // --- ORDERS STUFF ---
  static getOrders(): Order[] {
    const orders: Order[] = getLocal('orders', INITIAL_ORDERS);
    const products = this.getProducts();
    const profiles = this.getProfiles();

    return orders.map(o => {
      const items = (o.items || []).map(item => ({
        ...item,
        product: products.find(p => p.id === item.product_id)
      }));
      
      const customer = profiles.find(p => p.id === o.customer_id);
      const picker = o.picker_id ? profiles.find(p => p.id === o.picker_id) : null;
      const driver = o.driver_id ? profiles.find(p => p.id === o.driver_id) : null;

      return {
        ...o,
        items,
        customer_name: customer?.full_name || 'Anonymous Customer',
        customer_phone: customer?.phone || '+919876500000',
        picker_name: picker?.full_name || undefined,
        driver_name: driver?.full_name || undefined
      };
    }).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  static getOrder(id: string): Order | undefined {
    return this.getOrders().find(o => o.id === id);
  }

  static markCodCollected(orderId: string): void {
    const orders = getLocal('orders', INITIAL_ORDERS);
    const order = orders.find(o => o.id === orderId);
    if (order && order.payment_method === 'cod') {
      order.cod_collected = true;
      setLocal('orders', orders);
      this.triggerUpdate();
    }
  }

  /**
   * Reconcile all COD orders for a driver:
   * - Find all 'delivered' COD orders not yet reconciled
   * - Sum the collected cash
   * - Clear the driver's cod_wallet_liability
   * - Credit the net platform commission back
   */
  static reconcileDriverCOD(driverId: string): void {
    const orders = getLocal('orders', INITIAL_ORDERS);
    let totalCash = 0;
    let updated = false;

    orders.forEach(order => {
      if (
        order.driver_id === driverId &&
        order.payment_method === 'cod' &&
        order.cod_collected &&
        order.status === 'delivered'
      ) {
        totalCash += Number(order.total_amount);
        updated = true;
      }
    });

    if (updated && totalCash > 0) {
      // Credit net cash to platform (driver hands over cash)
      // Clear driver liability
      const driver = this.getProfile(driverId);
      if (driver) {
        driver.cod_wallet_liability = 0;
        this.updateProfile(driver);
      }
      this.triggerUpdate();
    }
  }

  static createOrder(
    customerId: string, 
    items: { productId: string; quantity: number }[], 
    address: string,
    couponCode: string | null,
    discountVal: number,
    deliveryFee: number,
    totalVal: number,
    deliverySpeed: 'express' | 'eco' = 'express',
    paymentMethod: 'wallet' | 'cod' | 'upi' | 'card' = 'wallet'
  ): Order | null {
    // 1. Check stock
    const products = this.getProducts();
    const orderItems: OrderItem[] = [];
    const orderId = 'order-' + Math.random().toString(36).substr(2, 9);

    for (const item of items) {
      const p = products.find(prod => prod.id === item.productId);
      if (!p || p.stock_quantity < item.quantity) return null;
    }

    // Determine if order is cold chain (contains Dairy or Cold Drinks)
    const isColdChain = items.some(item => {
      const p = products.find(prod => prod.id === item.productId);
      return p && (p.category_id === 'c2' || p.category_id === 'c4');
    });

    // 2. Deduct funds from wallet if not COD
    if (paymentMethod === 'wallet') {
      const success = this.deductWalletFunds(customerId, totalVal, `Order checkout #${orderId.slice(-6).toUpperCase()}`);
      if (!success) return null;
    }

    // 3. Update stock quantities
    items.forEach(item => {
      const p = products.find(prod => prod.id === item.productId);
      if (p) {
        p.stock_quantity -= item.quantity;
        orderItems.push({
          id: 'item-' + Math.random().toString(36).substr(2, 9),
          order_id: orderId,
          product_id: item.productId,
          quantity: item.quantity,
          price: p.discount_price || p.price,
          picked_quantity: 0,
          status: 'pending'
        });
      }
    });
    this.saveProducts(products);

    // 4. Create Order
    const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const newOrder: Order = {
      id: orderId,
      customer_id: customerId,
      picker_id: null,
      driver_id: null,
      status: 'placed',
      total_amount: totalVal,
      discount_amount: discountVal,
      coupon_code: couponCode,
      delivery_fee: deliveryFee,
      delivery_address: address,
      delivery_lat: 13.3427 + (Math.random() - 0.5) * 0.05, // Centered around Udupi
      delivery_lng: 74.7472 + (Math.random() - 0.5) * 0.05,
      otp_code: randomOtp,
      bag_number: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      trip_id: null,
      delivery_speed: deliverySpeed,
      is_cold_chain: isColdChain,
      payment_method: paymentMethod,
      cod_collected: false,
      items: orderItems
    };

    const orders = getLocal('orders', [] as Order[]);
    orders.unshift(newOrder);
    setLocal('orders', orders);

    // 5. Loyalty Points (1 point for every ₹2 spent)
    const profile = this.getProfile(customerId);
    if (profile) {
      profile.loyalty_points += Math.floor(totalVal / 2);
      this.updateProfile(profile);
    }

    this.triggerUpdate();
    return newOrder;
  }

  static assignPicker(orderId: string, pickerId: string): boolean {
    const orders = getLocal('orders', [] as Order[]);
    const found = orders.find(o => o.id === orderId);
    if (found && !found.picker_id) {
      found.picker_id = pickerId;
      found.status = 'picking';
      found.updated_at = new Date().toISOString();
      setLocal('orders', orders);
      this.triggerUpdate();
      return true;
    }
    return false;
  }

  static updatePickerItemStatus(orderId: string, itemId: string, pickedQty: number, oos = false) {
    const orders = getLocal('orders', [] as Order[]);
    const found = orders.find(o => o.id === orderId);
    if (found && found.items) {
      const item = found.items.find(i => i.id === itemId);
      if (item) {
        item.picked_quantity = pickedQty;
        item.status = oos ? 'out_of_stock' : 'picked';
        
        // If out of stock, refund the difference to the customer wallet
        if (oos && pickedQty < item.quantity) {
          const refundAmount = Number(item.price) * (item.quantity - pickedQty);
          if (refundAmount > 0) {
            this.addWalletFunds(found.customer_id, refundAmount, `Refund: OOS item in #${orderId.slice(-6).toUpperCase()}`);
          }
        }
        
        setLocal('orders', orders);
        this.triggerUpdate();
      }
    }
  }

  static packOrder(orderId: string, bagNumber: string) {
    const orders = getLocal('orders', [] as Order[]);
    const found = orders.find(o => o.id === orderId);
    if (found && found.status === 'picking') {
      found.status = 'packed';
      found.bag_number = bagNumber;
      found.updated_at = new Date().toISOString();
      setLocal('orders', orders);
      this.triggerUpdate();
    }
  }

  static assignDriver(orderId: string, driverId: string): boolean {
    const orders = getLocal('orders', [] as Order[]);
    const found = orders.find(o => o.id === orderId);
    if (found && found.status === 'packed') {
      found.driver_id = driverId;
      found.status = 'out_for_delivery';
      found.updated_at = new Date().toISOString();
      setLocal('orders', orders);
      this.triggerUpdate();
      return true;
    }
    return false;
  }

  static verifyDeliveryOTP(orderId: string, otp: string, driverId: string): boolean {
    const orders = getLocal('orders', [] as Order[]);
    const found = orders.find(o => o.id === orderId);
    if (found && found.status === 'out_for_delivery' && found.otp_code === otp) {
      found.status = 'delivered';
      found.updated_at = new Date().toISOString();
      setLocal('orders', orders);

      // Add Driver Earnings: flat ₹5 delivery + ₹2 bonus
      this.addDriverEarning(driverId, orderId, 7.00, 1.50);
      
      // If COD, add liability
      if (found.payment_method === 'cod') {
        const driver = this.getProfile(driverId);
        if (driver) {
          driver.cod_wallet_liability = (driver.cod_wallet_liability || 0) + found.total_amount;
          this.updateProfile(driver);
        }
      }
      
      this.triggerUpdate();
      return true;
    }
    return false;
  }


  static reconcileAllDrivers(): void {
    const profiles = this.getProfiles();
    let updated = false;
    profiles.forEach(p => {
      if (p.role === 'driver' && (p.cod_wallet_liability || 0) > 0) {
        p.cod_wallet_liability = 0;
        updated = true;
      }
    });
    if (updated) {
      setLocal('profiles', profiles);
      this.triggerUpdate();
    }
  }

  static rateOrder(orderId: string, rating: number, productRatings: { productId: string; rating: number }[]): boolean {
    const orders = getLocal('orders', [] as Order[]);
    const found = orders.find(o => o.id === orderId);
    if (found && found.status === 'delivered') {
      found.rated = true;
      found.rating = rating;
      setLocal('orders', orders);

      // 1. Recalculate average ratings for each product
      const products = this.getProducts();
      productRatings.forEach(pr => {
        const p = products.find(prod => prod.id === pr.productId);
        if (p) {
          const oldCount = p.rating_count || 0;
          const oldAvg = p.rating_avg || 0;
          const newCount = oldCount + 1;
          const newAvg = ((oldAvg * oldCount) + pr.rating) / newCount;
          p.rating_count = newCount;
          p.rating_avg = Number(newAvg.toFixed(2));
        }
      });
      this.saveProducts(products);

      // 2. Award 15 loyalty points to customer
      const customer = this.getProfile(found.customer_id);
      if (customer) {
        customer.loyalty_points = (customer.loyalty_points || 0) + 15;
        this.updateProfile(customer);
      }

      this.triggerUpdate();
      return true;
    }
    return false;
  }

  static getSupportTickets(): SupportTicket[] {
    return getLocal('support_tickets', INITIAL_TICKETS);
  }

  static saveSupportTickets(tickets: SupportTicket[]) {
    setLocal('support_tickets', tickets);
    this.triggerUpdate();
  }

  static getPushNotifications(): PushNotification[] {
    return getLocal('push_notifications', INITIAL_PUSH);
  }

  static savePushNotifications(notifications: PushNotification[]) {
    setLocal('push_notifications', notifications);
    this.triggerUpdate();
  }

  static getStaffShifts(): StaffShift[] {
    return getLocal('staff_shifts', INITIAL_SHIFTS);
  }

  static saveStaffShifts(shifts: StaffShift[]) {
    setLocal('staff_shifts', shifts);
    this.triggerUpdate();
  }

  static getBlinkPasses(): BlinkPass[] {
    return getLocal('blink_passes', INITIAL_PASSES);
  }

  static saveBlinkPasses(passes: BlinkPass[]) {
    setLocal('blink_passes', passes);
    this.triggerUpdate();
  }

  static getDarkStores(): DarkStore[] {
    return INITIAL_DARK_STORES;
  }

  static saveDarkStores(stores: DarkStore[]) {
    setLocal('dark_stores', stores);
    this.triggerUpdate();
  }

  // --- REQUISITE DYNAMIC BROADKAST SYSTEM ---
  private static listeners: Array<() => void> = [];

  static subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static triggerUpdate() {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (e) {
        console.error(e);
      }
    });
  }
}
