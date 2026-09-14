import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFullPaymentFlow() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testcustomer@flashgo.in',
    password: 'password123',
  });

  if (authErr) {
    console.error("Auth error:", authErr);
    return;
  }

  const userId = authData.user.id;

  let { data: address } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', userId)
    .limit(1)
    .maybeSingle();

  // Add an item to cart
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('is_active', true)
    .limit(1);

  const prod = products[0];
  await supabase.rpc('upsert_cart_item', { p_product_id: prod.id, p_quantity: 1 });

  // Get quote
  const { data: quote } = await supabase.rpc('get_cart_checkout_quote', { p_address_id: address.id });

  // Process checkout v2
  const idempotencyKey = `chk_test_${Date.now()}`;
  const { data: orderId, error: checkoutErr } = await supabase.rpc('process_checkout_v2', {
    p_address_id: address.id,
    p_delivery_speed: 'standard',
    p_payment_method: 'upi',
    p_coupon_code: null,
    p_idempotency_key: idempotencyKey
  });

  if (checkoutErr) {
    console.error("Checkout v2 error:", checkoutErr);
    return;
  }

  console.log("Created orderId:", orderId);

  // Test create-razorpay-order
  console.log("Invoking create-razorpay-order...");
  const createRes = await supabase.functions.invoke('create-razorpay-order', {
    body: { orderId, amount: quote.total_payable }
  });

  console.log("create-razorpay-order response:", createRes.data, createRes.error);

  if (createRes.data) {
    const payTxId = `pay_mock_${Date.now()}`;
    console.log("Invoking verify-razorpay-payment with transaction ID:", payTxId);
    const verifyRes = await supabase.functions.invoke('verify-razorpay-payment', {
      body: {
        order_id: orderId,
        razorpay_order_id: payTxId,
        razorpay_payment_id: payTxId,
        razorpay_signature: "mock_sig",
        amount: quote.total_payable
      }
    });

    console.log("verify-razorpay-payment response:", verifyRes.data, verifyRes.error);

    // Verify order status in DB after verification
    const { data: finalOrder } = await supabase
      .from('orders')
      .select('id, status, payment_status, payment_method')
      .eq('id', orderId)
      .single();
    
    console.log("Final Order DB Record:", finalOrder);
  }
}

testFullPaymentFlow();
