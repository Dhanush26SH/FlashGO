import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
  console.log('--- Database Lookup ---');

  // 1. Get PO by ID
  const { data: po } = await adminClient
    .from('procurement_orders')
    .select('*')
    .ilike('id', '%d8ff2c%')
    .single();

  if (!po) {
      console.log('PO not found by ID. Searching all pos');
      const { data: pos } = await adminClient.from('procurement_orders').select('id, status');
      console.log(pos);
      return;
  }
  console.log(`\n[PO] ID: ${po.id}, Status: ${po.status}`);

  // 2. Get Product Nandini Milk
  const { data: product } = await adminClient
    .from('products')
    .select('*')
    .ilike('name', '%Nandini Milk%Green%')
    .single();

  if (!product) {
      console.log('Product not found!');
      return;
  }
  console.log(`\n[Product] ID: ${product.id}, Name: ${product.name}, Barcode: ${product.internal_barcode}`);

  // 3. Get PO Item
  const { data: poItem } = await adminClient
    .from('procurement_order_items')
    .select('*')
    .eq('procurement_order_id', po.id)
    .eq('product_id', product.id)
    .single();
    
  if (poItem) {
      console.log(`\n[PO Item] ID: ${poItem.id}, Qty: ${poItem.quantity}, Received: ${poItem.received_quantity}`);
  } else {
      console.log('\n[PO Item] Not found!');
  }

  // 4. Get Supplier Dispatch
  const { data: dispatches } = await adminClient
    .from('supplier_dispatches')
    .select('*')
    .eq('procurement_order_id', po.id);
    
  if (dispatches && dispatches.length > 0) {
      for (const d of dispatches) {
          console.log(`\n[Dispatch] ID: ${d.id}, Status: ${d.status}`);
          
          const { data: batches } = await adminClient
            .from('supplier_dispatch_batches')
            .select('*')
            .eq('dispatch_id', d.id)
            .eq('product_id', product.id);
            
          if (batches && batches.length > 0) {
              batches.forEach(b => {
                  console.log(`  -> [Dispatch Batch] ID: ${b.id}, Batch Number: ${b.batch_number}, Mfg: ${b.manufacture_date}, Exp: ${b.expiry_date}, Qty: ${b.quantity}, Sent: ${b.dispatched_quantity}`);
              });
          } else {
              console.log('  -> No batches found for this product in this dispatch.');
          }
      }
  } else {
      console.log('\n[Dispatch] No dispatches found for this PO.');
  }
  
  // 5. Verify NO mutations (zero goods receipts, zero product batches, zero ledger)
  const tenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  const { count: grnCount } = await adminClient
    .from('goods_receipts')
    .select('*', { count: 'exact', head: true })
    .eq('procurement_order_id', po.id)
    .gte('created_at', tenMinsAgo);
    
  const { count: batchCount } = await adminClient
    .from('product_batches')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', product.id)
    .gte('created_at', tenMinsAgo);

  const { count: ledgerCount } = await adminClient
    .from('stock_ledgers')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', product.id)
    .gte('created_at', tenMinsAgo);

  console.log(`\n[Mutation Check] Recent GRNs: ${grnCount}`);
  console.log(`[Mutation Check] Recent Product Batches: ${batchCount}`);
  console.log(`[Mutation Check] Recent Stock Ledgers: ${ledgerCount}`);
}

investigate().catch(console.error);
