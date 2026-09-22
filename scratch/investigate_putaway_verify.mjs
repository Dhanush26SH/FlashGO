import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigatePutaway() {
  console.log('--- Post-Migration Verification ---');

  // 1. Get Product
  const { data: product } = await adminClient
    .from('products')
    .select('*')
    .eq('internal_barcode', 'FLH100242')
    .single();

  // 2. Get Udupi Warehouse
  const { data: warehouse } = await adminClient
    .from('warehouses')
    .select('*')
    .ilike('name', '%Udupi%')
    .single();
    
  console.log(`\nProduct: ${product.name} (${product.internal_barcode})`);
  console.log(`Warehouse: ${warehouse.name}`);

  // 3. Get Destination Location
  const locCode = 'D0-A01-001-01-C';
  const { data: location } = await adminClient
    .from('warehouse_locations')
    .select('*')
    .eq('warehouse_id', warehouse.id)
    .eq('location_code', locCode)
    .single();

  if (location) {
    const { data: placements } = await adminClient
      .from('warehouse_product_placements')
      .select('quantity')
      .eq('location_id', location.id);
      
    let occ = 0;
    if (placements) {
        placements.forEach(p => occ += p.quantity);
    }
    console.log(`Destination D0-A01-001-01-C Occupancy: ${occ}/${location.capacity}`);
  }

  // 4. Check Staging Stock
  const { data: stagingStock } = await adminClient
    .from('warehouse_stock')
    .select('*')
    .eq('product_id', product.id)
    .eq('warehouse_id', warehouse.id);

  if (stagingStock && stagingStock.length > 0) {
    stagingStock.forEach(s => {
      console.log(`[VERIFIED] warehouse_stock -> quantity (sellable): ${s.quantity}, staging_quantity: ${s.staging_quantity}, Status: ${s.status}`);
    });
  } else {
    console.log('[ERROR] No stock records found for this product in this warehouse.');
  }

  // 5. Get active Putaway Task
  const { data: tasks } = await adminClient
    .from('putaway_tasks')
    .select('*')
    .eq('product_id', product.id)
    .eq('warehouse_id', warehouse.id)
    .in('status', ['pending', 'in_progress', 'assigned']);

  console.log(`\nPending Putaway Tasks: ${tasks?.length || 0}`);
  if (tasks && tasks.length > 0) {
      console.log(`Task ID: ${tasks[0].id} is currently: ${tasks[0].status}`);
  }

  // 6. Check Stock Ledger
  const { data: ledger } = await adminClient
    .from('stock_ledgers')
    .select('*')
    .eq('product_id', product.id)
    .eq('warehouse_id', warehouse.id)
    .order('created_at', { ascending: false });

  console.log(`\nStock Ledger Entries (Total: ${ledger?.length || 0}):`);
  if (ledger && ledger.length > 0) {
    ledger.forEach(l => {
      console.log(`- Reason: ${l.reason}, Qty Chg: ${l.quantity_change}`);
    });
  }
}

investigatePutaway().catch(console.error);
