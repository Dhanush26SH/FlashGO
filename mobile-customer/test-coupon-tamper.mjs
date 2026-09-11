import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCouponTampering() {
  console.log('Testing Coupon Tampering with massive client discount...');

  // 1. Login or create user
  let { data: { session } } = await supabase.auth.signInWithPassword({
    email: 'test@flashgo.com',
    password: 'password123'
  });

  if (!session) {
    const { data: newUser } = await supabase.auth.signUp({
      email: 'test@flashgo.com',
      password: 'password123'
    });
    session = newUser.session;
  }
  
  if (!session) {
    console.error('Failed to get session');
    return;
  }

  const userId = session.user.id;

  // 2. Fetch a product
  const { data: products } = await supabase.from('products').select('*').eq('is_active', true).limit(1);
  if (!products || products.length === 0) {
    console.error('No products found');
    return;
  }
  
  const product = products[0];

  // 3. Try checking out with a massive fake discount value, no coupon code
  try {
    const payload = {
      p_user_id: userId,
      p_address: '123 Fake St',
      p_lat: 13.3427,
      p_lng: 74.7472,
      p_items: [{ productid: product.id, quantity: 1 }],
      p_discount_val: 999999, // <--- TAMPERED VALUE
      p_coupon_code: null,
      p_delivery_fee: 4.99,
      p_delivery_speed: 'standard',
      p_payment_method: 'cod',
      p_idempotency_key: Date.now().toString()
    };

    console.log('Sending checkout payload with p_discount_val = 999999 (No coupon code)');
    const { data: orderId, error } = await supabase.rpc('process_checkout', payload);
    
    if (error) {
      console.error('Checkout failed (expected if wallet balance is low, but lets see):', error.message);
    } else {
      console.log('Checkout succeeded! Order ID:', orderId);
      
      // Fetch the order to see the actual discount applied
      const { data: order } = await supabase.from('orders').select('total_amount, discount_amount').eq('id', orderId).single();
      console.log('Resulting Order:', order);
      
      if (order.discount_amount === 0) {
        console.log('SUCCESS: Backend IGNORED the tampered discount_val = 999999. Applied 0.');
      } else {
        console.error('FAIL: Backend applied the fake discount!', order.discount_amount);
      }
    }
  } catch (err) {
    console.error('Exception:', err.message);
  }
}

testCouponTampering();
