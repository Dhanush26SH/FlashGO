export type UserRole = 'customer' | 'picker' | 'driver' | 'admin' | 'warehouse_staff' | 'warehouse_manager';
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
  radius: number; // in meters
  activeOrders: number;
  capacity: string;
  status: 'optimal' | 'warning' | 'critical';
  staffCount: number;
}

export interface Profile {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  role: UserRole;
  loyalty_points: number;
  referral_code: string | null;
  referred_by: string | null;
  wallet_balance: number;
  cod_wallet_liability?: number;
  warehouse_id?: string;
  is_online?: boolean;
  current_vehicle_id?: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  image_url?: string;
  active: boolean;
  created_at?: string;
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
  expires_at?: string;
  created_at?: string;
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
  delivery_sequence?: number | null;
  delivery_speed?: 'express' | 'eco';
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
  status: 'pending' | 'approved' | 'partially_received' | 'received' | 'cancelled';
  total_cost: number;
  created_at: string;
  vendor_name?: string;
  items?: any[];
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
  category: 'refund' | 'delivery' | 'damaged' | 'other' | 'Missing Item' | 'Wrong Item' | 'Damaged Item' | 'Quality Issue' | 'Late Delivery' | 'Payment' | 'Refund' | 'Other';
  status: 'open' | 'pending' | 'resolved' | 'in_progress' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  related_order_id?: string;
  order_item_id?: string;
  affected_quantity?: number;
  description?: string;
  created_at: string;
  messages: { sender: 'customer' | 'support'; text: string; time: string }[];
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

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address_line: string;
  lat?: number;
  lng?: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}