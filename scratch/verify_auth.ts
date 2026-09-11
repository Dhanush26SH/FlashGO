import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseAnonKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37'; 
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

async function runTests() {
  console.log("=== 1. ANON TESTS ===");
  // Profiles
  const { data: anonProfiles, error: anonProfilesErr } = await anonClient.from('profiles').select('*').limit(1);
  console.log("ANON Profiles Read:", anonProfiles?.length === 0 || anonProfilesErr ? "BLOCKED (PASS)" : "ALLOWED (FAIL)", anonProfilesErr?.message || '');

  // Wallet
  const { data: anonWallet, error: anonWalletErr } = await anonClient.from('wallet_transactions').select('*').limit(1);
  console.log("ANON Wallet Read:", anonWallet?.length === 0 || anonWalletErr ? "BLOCKED (PASS)" : "ALLOWED (FAIL)", anonWalletErr?.message || '');

  // Categories
  const { data: anonCat, error: anonCatErr } = await anonClient.from('categories').select('*').limit(1);
  console.log("ANON Categories Read:", anonCat?.length ? "ALLOWED (PASS)" : "BLOCKED (FAIL)", anonCatErr?.message || '');

  // Products
  const { data: anonProd, error: anonProdErr } = await anonClient.from('products').select('*').eq('is_active', true).limit(1);
  console.log("ANON Active Products Read:", anonProd?.length ? "ALLOWED (PASS)" : "BLOCKED (FAIL)", anonProdErr?.message || '');

  const { data: anonProdInact } = await anonClient.from('products').select('*').eq('is_active', false).limit(1);
  console.log("ANON Inactive Products Read:", anonProdInact?.length === 0 ? "BLOCKED (PASS)" : "ALLOWED (FAIL)");


  console.log("\n=== 2. CUSTOMER TESTS ===");
  // Create mock customer
  const email = `test_cust_${Date.now()}@example.com`;
  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true
  });
  
  if (authErr || !authData.user) {
      console.log("Failed to create test user:", authErr);
      return;
  }
  const uid = authData.user.id;
  
  // Create profile
  await adminClient.from('profiles').insert({ id: uid, role: 'customer', full_name: 'Test Customer', phone: '1234567890' });
  
  // Sign in
  const custClient = createClient(supabaseUrl, supabaseAnonKey);
  await custClient.auth.signInWithPassword({ email, password: 'password123' });

  // Own profile
  const { data: myProfile, error: myProfErr } = await custClient.from('profiles').select('*').eq('id', uid);
  console.log("CUST Own Profile Read:", myProfile?.length === 1 ? "ALLOWED (PASS)" : "BLOCKED (FAIL)", myProfErr?.message || '');

  // Other profile
  const { data: otherProfile } = await custClient.from('profiles').select('*').neq('id', uid).limit(1);
  console.log("CUST Other Profile Read:", otherProfile?.length === 0 ? "BLOCKED (PASS)" : "ALLOWED (FAIL)");

  // Update safe column
  const { error: updSafeErr } = await custClient.from('profiles').update({ full_name: 'Updated Name' }).eq('id', uid);
  console.log("CUST Update full_name:", !updSafeErr ? "ALLOWED (PASS)" : "BLOCKED (FAIL)", updSafeErr?.message || '');

  // Update unsafe column (role)
  const { error: updRoleErr } = await custClient.from('profiles').update({ role: 'admin' }).eq('id', uid);
  console.log("CUST Update role:", updRoleErr ? "BLOCKED (PASS)" : "ALLOWED (FAIL)", updRoleErr?.message || '');
  
  // Verify role did not change
  const { data: checkProf } = await adminClient.from('profiles').select('role').eq('id', uid).single();
  console.log("CUST Role After Attempt:", checkProf?.role === 'customer' ? "STILL CUSTOMER (PASS)" : "CHANGED (FAIL)");

  // Own wallet history
  await adminClient.from('wallet_transactions').insert({ user_id: uid, amount: 100, type: 'credit', description: 'test' });
  const { data: myWallet, error: myWalletErr } = await custClient.from('wallet_transactions').select('*').eq('user_id', uid);
  console.log("CUST Own Wallet Read:", myWallet?.length === 1 ? "ALLOWED (PASS)" : "BLOCKED (FAIL)", myWalletErr?.message || '');

  // Other wallet history
  const { data: otherWallet } = await custClient.from('wallet_transactions').select('*').neq('user_id', uid).limit(1);
  console.log("CUST Other Wallet Read:", otherWallet?.length === 0 ? "BLOCKED (PASS)" : "ALLOWED (FAIL)");

  // Wallet mutation
  const { error: mutWalletErr } = await custClient.from('wallet_transactions').insert({ user_id: uid, amount: 9999, type: 'credit', description: 'hack' });
  console.log("CUST Wallet Insert:", mutWalletErr ? "BLOCKED (PASS)" : "ALLOWED (FAIL)", mutWalletErr?.message || '');

  // Order items
  // First create an order for the user
  const { data: order } = await adminClient.from('orders').insert({ customer_id: uid, total_amount: 10, status: 'placed' }).select('id').single();
  if (order) {
    await adminClient.from('order_items').insert({ order_id: order.id, product_id: anonProd?.[0]?.id, quantity: 1, price: 10, status: 'pending' });
    const { data: myItems, error: myItemsErr } = await custClient.from('order_items').select('*').eq('order_id', order.id);
    console.log("CUST Own Order Items Read:", myItems?.length === 1 ? "ALLOWED (PASS)" : "BLOCKED (FAIL)", myItemsErr?.message || '');
    
    // Other order items
    const { data: otherItems } = await custClient.from('order_items').select('*').neq('order_id', order.id).limit(1);
    console.log("CUST Other Order Items Read:", otherItems?.length === 0 ? "BLOCKED (PASS)" : "ALLOWED (FAIL)");
  }

  // Cleanup
  await adminClient.auth.admin.deleteUser(uid);
  console.log("Cleanup complete.");
}

runTests().catch(console.error);
