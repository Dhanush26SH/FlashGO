import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function test() {
  console.log('Fetching references...');
  const { data: vendors } = await adminClient.from('vendors').select('id').limit(1);
  const { data: warehouses } = await adminClient.from('warehouses').select('id, name');
  const udupi = warehouses?.find(w => w.name.includes('Udupi'))?.id;
  const manipal = warehouses?.find(w => w.name.includes('Manipal'))?.id;
  const { data: products } = await adminClient.from('products').select('id').limit(1);

  // 1. Create a master admin to setup the PO
  const email = `master_${Date.now()}@flashgo.com`;
  const { data: masterAuth } = await adminClient.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
  await adminClient.from('profiles').update({ role: 'admin' }).eq('id', masterAuth.user.id);
  const masterClient = createClient(supabaseUrl, supabaseAnonKey);
  await masterClient.auth.signInWithPassword({ email, password: 'password123' });

  const tests = [
    { name: 'Super Admin', role: 'admin', wh: null },
    { name: 'Scoped Same Warehouse', role: 'warehouse_manager', wh: udupi },
    { name: 'Scoped Cross Warehouse', role: 'warehouse_manager', wh: manipal }
  ];

  for (const t of tests) {
    console.log(`\n--- TESTING: ${t.name} ---`);
    
    // Create PO for Udupi using master admin
    const { data: po } = await masterClient.rpc('admin_create_po', {
      p_vendor_id: vendors![0].id,
      p_warehouse_id: udupi,
      p_items: [{ product_id: products![0].id, quantity: 1, cost_per_unit: 10 }]
    });
    await masterClient.rpc('admin_update_po_status', { p_po_id: po.id, p_new_status: 'approved' });
    const { data: poItems } = await adminClient.from('procurement_order_items').select('id').eq('procurement_order_id', po.id);
    
    // Create test user
    const testEmail = `test_${Date.now()}_${Math.random()}@flashgo.com`;
    const { data: authUser } = await adminClient.auth.admin.createUser({ email: testEmail, password: 'password123', email_confirm: true });
    await adminClient.from('profiles').update({ role: t.role, warehouse_id: t.wh }).eq('id', authUser.user.id);
    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    await userClient.auth.signInWithPassword({ email: testEmail, password: 'password123' });
    
    // Attempt to receive using the test user client
    const { error: receiveErr } = await userClient.rpc('receive_procurement_order', {
      p_procurement_id: po.id,
      p_warehouse_id: udupi, // Always PO warehouse
      p_user_id: authUser.user.id,
      p_receipt_number: `GRN-${Date.now()}-${Math.random()}`,
      p_notes: 'Test',
      p_items: [{
        procurement_order_item_id: poItems![0].id,
        product_id: products![0].id,
        accepted_quantity: 1,
        rejected_quantity: 0,
        batch_number: `BATCH-${Date.now()}`,
        expiry_date: '2026-12-31',
        unit_cost: 10
      }]
    });
    
    if (!receiveErr) {
      console.log('RESULT: PASS');
    } else {
      console.log(`RESULT: REJECTED (${receiveErr.message})`);
    }

    // Cleanup
    await adminClient.auth.admin.deleteUser(authUser.user.id);
  }
  await adminClient.auth.admin.deleteUser(masterAuth.user.id);
}

test().catch(console.error);
