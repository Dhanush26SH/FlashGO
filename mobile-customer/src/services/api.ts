import { supabase } from '../lib/supabase';

// Catalog & Routing
export const getServingWarehouse = async (lat: number, lng: number) => {
  const { data, error } = await supabase.rpc('get_serving_warehouse', {
    p_lat: lat,
    p_lng: lng
  });
  if (error) throw error;
  return data; // returns warehouse_id UUID
};

// Warehouse Catalog
export const fetchWarehouseCatalog = async (warehouseId: string, searchQuery: string = '') => {
  const { data, error } = await supabase.rpc('get_warehouse_catalog', {
    p_warehouse_id: warehouseId,
    p_search_query: searchQuery ? searchQuery : null
  });
  if (error) throw error;
  return data ? data.map((item: any) => ({ ...item, id: item.product_id || item.id })) : [];
};

// Global Browse Catalog (Metadata only, no stock claims)
export const fetchBrowseCatalog = async (searchQuery: string = '') => {
  let query = supabase.from('products').select('*').eq('is_active', true);
  
  if (searchQuery) {
    query = query.ilike('name', `%${searchQuery}%`);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  // Return products without injecting fake stock quantities so Browse Mode
  // correctly registers as "unknown availability" rather than "out of stock".
  return data || [];
};

// Categories
export const fetchCategories = async () => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
};

// Subcategories
export const fetchSubcategories = async () => {
  const { data, error } = await supabase
    .from('subcategories')
    .select('*')
    .eq('active', true)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
};

// Cart / Products
export const fetchLiveProducts = async (productIds: string[]) => {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase
    .from('products')
    .select('id, price, stock_quantity, is_active')
    .in('id', productIds);
  if (error) throw error;
  return data;
};

// Checkout
export const processCheckout = async (payload: {
  p_user_id: string;
  p_address: string;
  p_lat: number;
  p_lng: number;
  p_items: Array<{ productId: string; quantity: number }>;
  p_coupon_code?: string | null;
  p_delivery_speed: string;
  p_payment_method: string;
  p_idempotency_key?: string;
}) => {
  if (!payload.p_items || payload.p_items.length === 0) {
    throw new Error('Server-side checkout rejected: Cannot process empty order.');
  }
  // The live process_checkout function:
  //   - receives p_items as jsonb array of { "productId": uuid, quantity: int }
  //   - computes prices, delivery fee, warehouse, coupon server-side (not trusted from client)
  //   - resolves warehouse from (p_lat, p_lng) via get_serving_warehouse internally
  const { data, error } = await supabase.rpc('process_checkout', {
    p_user_id: payload.p_user_id,
    p_address: payload.p_address,
    p_delivery_speed: payload.p_delivery_speed,
    p_payment_method: payload.p_payment_method,
    p_items: payload.p_items,
    p_coupon_code: payload.p_coupon_code ?? null,
    p_lat: payload.p_lat,
    p_lng: payload.p_lng,
    p_idempotency_key: payload.p_idempotency_key ?? null,
  });
  if (error) throw error;
  return data; // returns order_id uuid
};


// Orders
export const fetchOrders = async () => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, status, total_amount, created_at, payment_method, payment_status, refund_status,
      order_items ( id, product_id, quantity, price_at_time, products(name, image_url) )
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const cancelOrder = async (orderId: string, paymentMethod: string) => {
  if (['upi', 'card', 'razorpay'].includes(paymentMethod)) {
    const { data, error } = await supabase.functions.invoke('customer-cancel-order', {
      body: { orderId }
    });
    if (error) throw error;
    return data;
  } else {
    const { error } = await supabase.rpc('cancel_customer_order', {
      p_order_id: orderId
    });
    if (error) throw error;
  }
};

// Coupons
export const getCoupons = async () => {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('code');
  if (error) throw error;
  return data;
};

// Wallet
export const getWalletBalance = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data.wallet_balance;
};

export const getDriverInfo = async (driverId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('full_name, phone_number')
    .eq('id', driverId)
    .single();
  if (error) throw error;
  return data;
};

// Substitutions
export const fetchPendingSubstitutions = async (orderId: string) => {
  const { data, error } = await supabase
    .from('order_substitutions')
    .select(`
      id,
      quantity,
      original_item_id,
      suggested_product_id,
      products!order_substitutions_suggested_product_id_fkey(name, image_url, price)
    `)
    .eq('order_id', orderId)
    .eq('status', 'pending');
  if (error) throw error;
  return data;
};

export const respondToSubstitution = async (subId: string, status: 'approved' | 'rejected') => {
  const { error } = await supabase.rpc('respond_to_substitution', {
    p_sub_id: subId,
    p_status: status
  });
  if (error) throw error;
};

// Addresses
export const getAddresses = async () => {
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .order('is_default', { ascending: false });
  if (error) throw error;
  return data;
};

export const addAddress = async (payload: any) => {
  // customer_id must equal auth.uid() to satisfy RLS WITH CHECK constraint.
  // The caller must supply customer_id from sessionUser.id.
  const { data, error } = await supabase
    .from('customer_addresses')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateAddress = async (id: string, payload: any) => {
  const { data, error } = await supabase
    .from('customer_addresses')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteAddress = async (id: string) => {
  const { error } = await supabase
    .from('customer_addresses')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

// Support
export const getSupportTickets = async () => {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const createSupportTicket = async (payload: any) => {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getSupportMessages = async (ticketId: string) => {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
};

export const sendSupportMessage = async (payload: any) => {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Substitutions

export const fetchTrendingByTag = async (warehouseId: string, tag: string, limit: number = 8) => {
  const { data, error } = await supabase.rpc('get_trending_by_tag', {
    p_warehouse_id: warehouseId,
    p_tag: tag,
    p_limit: limit
  });
  if (error) throw error;
  return data ? data.map((item: any) => ({ ...item, id: item.id })) : [];
};
