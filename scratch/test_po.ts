import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // Login as admin
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@flashgo.com',
    password: 'password123'
  });
  if (authErr) throw authErr;

  // 1. Check if the failed attempt created a PO
  const { data: pos } = await supabase.from('procurement_orders').select('*').eq('total_cost', 125);
  console.log('POs with total 125 before test:', pos?.length);

  // 2. Create a new PO
  // We need a valid vendor and warehouse
  const { data: vendors } = await supabase.from('vendors').select('id').limit(1);
  const { data: warehouses } = await supabase.from('warehouses').select('id, name');
  const { data: products } = await supabase.from('products').select('id').limit(2);

  const udupi = warehouses?.find(w => w.name.includes('Udupi'))?.id;

  console.log('Testing RPC admin_create_po...');
  const items = [
    { product_id: products![0].id, quantity: 5, cost_per_unit: 25 }
  ];

  const { data: newPo, error: rpcErr } = await supabase.rpc('admin_create_po', {
    p_vendor_id: vendors![0].id,
    p_warehouse_id: udupi,
    p_items: items
  });

  if (rpcErr) {
    console.error('RPC Error:', rpcErr);
  } else {
    console.log('Successfully created PO:', newPo);
    
    // Check audit logs
    const { data: logs } = await supabase.from('admin_audit_logs').select('*').eq('entity_id', newPo.id);
    console.log('Audit logs for PO:', logs?.length);
  }
}

test().catch(console.error);
