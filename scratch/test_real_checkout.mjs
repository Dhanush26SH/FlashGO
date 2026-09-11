import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: 'mobile-customer/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function simulateCheckout() {
  // Login as Customer
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'customer_b@flashgo.com', // Let's try to get a customer
    password: 'password123'
  });
  
  if (authErr) {
    console.error("Auth Error:", authErr);
    process.exit(1);
  }
  
  const userId = authData.user.id;
  
  // Create payload for Apple Royal Gala (assuming ID from remote_products.json)
  // Let's first search products to find "Apple Royal Gala"
  const { data: prodData } = await supabase.from('products').select('id, name').ilike('name', '%Apple Royal Gala%').single();
  if (!prodData) {
    console.log("Product not found");
    return;
  }
  const productId = prodData.id;
  
  const payload = {
    p_user_id: userId,
    p_address: 'Test Address Udupi',
    p_delivery_speed: 'standard',
    p_payment_method: 'cod',
    p_items: [{ productId: productId, quantity: 2 }],
    p_coupon_code: null,
    p_lat: 13.3409,
    p_lng: 74.7421,
    p_idempotency_key: `${userId}_${Date.now()}`,
  };
  
  console.log("PAYLOAD:", JSON.stringify(payload, null, 2));
  
  const { data, error } = await supabase.rpc('process_checkout', payload);
  
  if (error) {
    console.log("RPC ERROR:", error);
  } else {
    console.log("RPC SUCCESS, Order ID:", data);
  }
}

simulateCheckout();
