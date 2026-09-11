const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data: authData } = await supabase.auth.signInWithPassword({ email: 'flashgo-admin-test-v2@mailinator.com', password: 'password123' });
  const uid = authData.user.id;
  const { data, error } = await supabase.rpc('process_checkout', {
    p_user_id: uid,
    p_address: 'test',
    p_delivery_speed: 'standard',
    p_payment_method: 'cod',
    p_items: [{ "productid": "888f7899-2f74-4d18-a2b5-dfce6c354287", "quantity": 1 }],
  });
  console.log('productid test:', error ? error.message : data);
  
  const { data: d2, error: e2 } = await supabase.rpc('process_checkout', {
    p_user_id: uid,
    p_address: 'test',
    p_delivery_speed: 'standard',
    p_payment_method: 'cod',
    p_items: [{ "productId": "888f7899-2f74-4d18-a2b5-dfce6c354287", "quantity": 1 }],
  });
  console.log('productId test:', e2 ? e2.message : d2);
  
  const { data: d3, error: e3 } = await supabase.rpc('process_checkout', {
    p_user_id: uid,
    p_address: 'test',
    p_delivery_speed: 'standard',
    p_payment_method: 'cod',
    p_items: [{ "product_id": "888f7899-2f74-4d18-a2b5-dfce6c354287", "quantity": 1 }],
  });
  console.log('product_id test:', e3 ? e3.message : d3);
}
test().catch(console.error);
