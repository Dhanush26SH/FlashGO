import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const anonKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const adminClient = createClient(supabaseUrl, supabaseKey);
const anonClient = createClient(supabaseUrl, anonKey);

async function checkRLS() {
  const result: any = {};

  // Check Ledgers for PO 179CFB
  // It turns out they might be linked to Goods Receipts. Let's see all transaction types:
  const { data: sl } = await adminClient.from('stock_ledgers').select('transaction_type, reference_id, quantity').limit(10);
  result.sample_stock_ledgers = sl;

  // RLS Testing
  console.log("Setting up RLS Test Users...");
  const rolesToTest = ['admin', 'warehouse_manager', 'picker'];
  const testUsers = [];

  for (const role of rolesToTest) {
    const email = `test_${role}_${Date.now()}@flashgo.local`;
    const password = 'TestPassword123!';
    
    // Create user
    const { data: userAuth, error: uErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (uErr) { console.error(uErr); continue; }

    const uid = userAuth.user.id;
    // Set role in profiles
    await adminClient.from('profiles').update({ role }).eq('id', uid);

    // Login to get JWT
    const { data: sessionData, error: sErr } = await anonClient.auth.signInWithPassword({
      email,
      password
    });

    if (sErr || !sessionData.session) {
      console.error(`Failed to login ${role}`);
      continue;
    }

    const token = sessionData.session.access_token;
    
    // Create a client with this user's token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // Test SELECT
    const { error: selErr } = await userClient.from('vendor_products').select('id').limit(1);
    
    // Test INSERT
    const { error: insErr } = await userClient.from('vendor_products').insert({
      vendor_id: 'b0000000-0000-0000-0000-000000000002', // PureDairy
      product_id: '9701ec5a-3fa0-4503-8404-3e6ce538fdaa'  // Amul
    });

    // Test UPDATE
    const { error: updErr } = await userClient.from('vendor_products').update({ is_active: false }).eq('product_id', '9701ec5a-3fa0-4503-8404-3e6ce538fdaa');

    // Test DELETE
    const { error: delErr } = await userClient.from('vendor_products').delete().eq('product_id', '9701ec5a-3fa0-4503-8404-3e6ce538fdaa');

    result[role] = {
      select: selErr ? selErr.message : "Success",
      insert: insErr ? insErr.message : "Success",
      update: updErr ? updErr.message : "Success",
      delete: delErr ? delErr.message : "Success"
    };

    // Cleanup
    await adminClient.auth.admin.deleteUser(uid);
  }

  // Anon Test
  const { error: selErr } = await anonClient.from('vendor_products').select('id').limit(1);
  const { error: insErr } = await anonClient.from('vendor_products').insert({
    vendor_id: 'b0000000-0000-0000-0000-000000000002',
    product_id: '9701ec5a-3fa0-4503-8404-3e6ce538fdaa'
  });
  const { error: updErr } = await anonClient.from('vendor_products').update({ is_active: false }).eq('product_id', '9701ec5a-3fa0-4503-8404-3e6ce538fdaa');
  const { error: delErr } = await anonClient.from('vendor_products').delete().eq('product_id', '9701ec5a-3fa0-4503-8404-3e6ce538fdaa');

  result['anon'] = {
    select: selErr ? selErr.message : "Success",
    insert: insErr ? insErr.message : "Success",
    update: updErr ? updErr.message : "Success",
    delete: delErr ? delErr.message : "Success"
  };

  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\rls_results.json', JSON.stringify(result, null, 2));
  console.log("RLS Tests completed.");
}

checkRLS().catch(console.error);
