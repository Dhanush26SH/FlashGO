import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function runTest() {
  console.log('Starting end-to-end test for Procurement Provenance...');

  // 1. Get a vendor
  const { data: vendors } = await supabase.from('vendors').select('*').limit(1);
  const vendor = vendors?.[0];
  if (!vendor) throw new Error('No vendor found');

  // 2. Get a warehouse
  const { data: warehouses } = await supabase.from('warehouses').select('*').limit(1);
  const warehouse = warehouses?.[0];
  if (!warehouse) throw new Error('No warehouse found');

  // 3. Get products
  const { data: products } = await supabase.from('products').select('*').eq('is_active', true).limit(2);
  if (!products || products.length < 2) throw new Error('Not enough products');

  console.log(`Using Vendor: ${vendor.name}, Warehouse: ${warehouse.name}`);

  // 4. Create PO via RPC
  console.log('Creating PO...');
  const { data: po, error: poErr } = await supabase.rpc('admin_create_po', {
    p_vendor_id: vendor.id,
    p_warehouse_id: warehouse.id,
    p_items: [
      { product_id: products[0].id, quantity: 100, cost_per_unit: 10 },
      { product_id: products[1].id, quantity: 50, cost_per_unit: 20 }
    ]
  });

  if (poErr) throw new Error(`PO Creation failed: ${JSON.stringify(poErr)}`);
  const poId = po.id;
  console.log(`PO Created: ${poId}`);

  // 5. Approve PO
  console.log('Approving PO...');
  const { error: approveErr } = await supabase.rpc('admin_update_po_status', { p_po_id: poId, p_new_status: 'approved' });
  if (approveErr) throw new Error(`PO Approval failed: ${JSON.stringify(approveErr)}`);

  // 6. Fetch PO items
  const { data: poItems } = await supabase.from('procurement_order_items').select('*').eq('procurement_order_id', poId);
  if (!poItems || poItems.length !== 2) throw new Error('Failed to fetch PO items');

  // 7. Receive partial
  console.log('Receiving partial order...');
  const receiptNumber = `GRN-TEST-${Date.now()}`;
  
  // We need an admin or warehouse manager id. Since we don't have auth context in the script directly,
  // we can get the first admin.
  const { data: profiles } = await supabase.from('profiles').select('*').eq('role', 'admin').limit(1);
  const adminId = profiles?.[0]?.id;
  if (!adminId) throw new Error('No admin profile found');

  const { data: recv, error: recvErr } = await supabase.rpc('receive_procurement_order', {
    p_procurement_id: poId,
    p_warehouse_id: warehouse.id,
    p_user_id: adminId,
    p_receipt_number: receiptNumber,
    p_notes: 'Partial receipt test',
    p_items: [
      {
        procurement_order_item_id: poItems[0].id,
        product_id: poItems[0].product_id,
        accepted_quantity: 40,
        rejected_quantity: 10,
        batch_number: 'TEST-BATCH-1',
        expiry_date: '2027-01-01',
        unit_cost: poItems[0].unit_price
      }
    ]
  });

  if (recvErr) throw new Error(`Receive failed: ${JSON.stringify(recvErr)}`);
  console.log(`Receive successful. Status: ${recv.new_status}`);

  // 8. Check PO Status
  const { data: updatedPo } = await supabase.from('procurement_orders').select('*').eq('id', poId).single();
  if (updatedPo.status !== 'partially_received') throw new Error(`Expected partially_received, got ${updatedPo.status}`);

  // 9. Idempotency test
  console.log('Testing idempotency...');
  const { data: idem } = await supabase.rpc('receive_procurement_order', {
    p_procurement_id: poId,
    p_warehouse_id: warehouse.id,
    p_user_id: adminId,
    p_receipt_number: receiptNumber, // same receipt
    p_notes: 'Duplicate',
    p_items: []
  });
  if (idem.message !== 'Receipt already processed (idempotent)') {
    throw new Error('Idempotency failed');
  }
  console.log('Idempotency working.');

  // 10. Check Traceability
  console.log('Checking traceability query...');
  const { data: trace, error: traceErr } = await supabase
    .from('product_batches')
    .select(`
      id,
      goods_receipt_items(
        receipt_id,
        receipt:goods_receipts(receipt_number)
      )
    `)
    .eq('batch_number', 'TEST-BATCH-1');

  if (traceErr) throw new Error(`Trace error: ${JSON.stringify(traceErr)}`);
  console.log('Trace query successful:', JSON.stringify(trace, null, 2));

  console.log('All tests passed successfully!');
}

runTest().catch(console.error);
