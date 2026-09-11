import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const userClient = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('1. Creating test admin user...');
  const email = `testadmin_${Date.now()}@flashgo.com`;
  const password = 'testpassword123';
  
  const { data: user, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  
  // Make user admin
  await adminClient.from('profiles').update({ role: 'admin' }).eq('id', user.user.id);
  
  console.log('2. Authenticating as new admin...');
  const { data: auth, error: loginErr } = await userClient.auth.signInWithPassword({
    email,
    password
  });
  if (loginErr) throw loginErr;
  
  console.log('3. Fetching required references...');
  const { data: vendors } = await adminClient.from('vendors').select('id').limit(1);
  const { data: warehouses } = await adminClient.from('warehouses').select('id, name');
  const udupi = warehouses?.find(w => w.name.includes('Udupi'))?.id;
  const { data: products } = await adminClient.from('products').select('id').limit(1);
  const { data: batches } = await adminClient.from('product_batches').select('id').limit(1);
  
  const items = [{ product_id: products![0].id, quantity: 1, cost_per_unit: 10 }];
  
  console.log('\n--- TESTING CREATE PO ---');
  const { data: po, error: createPoErr } = await userClient.rpc('admin_create_po', {
    p_vendor_id: vendors![0].id,
    p_warehouse_id: udupi,
    p_items: items
  });
  console.log('CREATE PO SUCCESS:', !createPoErr);
  if (createPoErr) console.error(createPoErr);
  
  console.log('\n--- TESTING APPROVE PO ---');
  const { data: approve, error: approveErr } = await userClient.rpc('admin_update_po_status', {
    p_po_id: po.id,
    p_new_status: 'approved'
  });
  console.log('APPROVE PO SUCCESS:', !approveErr);
  if (approveErr) console.error(approveErr);
  
  console.log('\n--- TESTING RECEIVE PO (GRN) ---');
  const { data: receive, error: receiveErr } = await userClient.rpc('receive_procurement_order', {
    p_po_id: po.id,
    p_items: [{
      product_id: products![0].id,
      quantity_received: 1,
      accepted_quantity: 1,
      rejected_quantity: 0
    }]
  });
  console.log('RECEIVE PO SUCCESS:', !receiveErr);
  if (receiveErr) console.error(receiveErr);
  
  // Create another PO to test Cancel
  const { data: po2 } = await userClient.rpc('admin_create_po', {
    p_vendor_id: vendors![0].id,
    p_warehouse_id: udupi,
    p_items: items
  });
  console.log('\n--- TESTING CANCEL PO ---');
  const { data: cancel, error: cancelErr } = await userClient.rpc('admin_update_po_status', {
    p_po_id: po2.id,
    p_new_status: 'cancelled'
  });
  console.log('CANCEL PO SUCCESS:', !cancelErr);
  if (cancelErr) console.error(cancelErr);
  
  console.log('\n--- TESTING CATALOG MUTATION ---');
  const { error: catErr } = await userClient.rpc('admin_update_product', {
    p_product_id: products![0].id,
    p_updates: { price: 10 }
  });
  console.log('CATALOG MUTATION SUCCESS:', !catErr);
  if (catErr) console.error(catErr);
  
  console.log('\n--- TESTING INVENTORY MUTATION ---');
  const { error: invErr } = await userClient.rpc('adjust_batch_stock', {
    p_batch_id: batches![0].id,
    p_quantity_change: 0, // safe test
    p_reason: 'correction',
    p_user_id: user.user.id
  });
  console.log('INVENTORY MUTATION SUCCESS:', !invErr);
  if (invErr) console.error(invErr);
  
  console.log('\n--- TESTING WORKFORCE MUTATION ---');
  const { data: riders } = await adminClient.from('profiles').select('id').eq('role', 'rider').limit(1);
  const { error: workErr } = await userClient.rpc('admin_update_staff_role', {
    p_target_id: riders![0].id,
    p_role: 'rider' // no op
  });
  console.log('WORKFORCE MUTATION SUCCESS:', !workErr);
  if (workErr) console.error(workErr);
  
  console.log('\n--- CLEANUP ---');
  await adminClient.auth.admin.deleteUser(user.user.id);
  console.log('Done.');
}

test().catch(console.error);
