import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigatePutaway() {
  console.log('--- Investigating Putaway Issue ---');

  // 1. Get Product
  const { data: product, error: prodErr } = await adminClient
    .from('products')
    .select('*')
    .eq('internal_barcode', 'FLH100242')
    .single();

  if (prodErr || !product) {
    console.error('Failed to find product:', prodErr);
    return;
  }
  console.log('\n[1] Product Info:');
  console.log(`ID: ${product.id}`);
  console.log(`Name: ${product.name}`);
  console.log(`Barcode: ${product.internal_barcode}`);

  // 2. Get Staff
  const { data: staff, error: staffErr } = await adminClient
    .from('profiles')
    .select('*')
    .eq('employee_id', 'EMP-10008')
    .single();
  
  if (staffErr || !staff) {
    console.error('Failed to find staff:', staffErr);
    return;
  }
  console.log('\n[2] Staff Info:');
  console.log(`ID: ${staff.id}`);
  console.log(`Name: ${staff.full_name}`);
  console.log(`Employee ID: ${staff.employee_id}`);
  console.log(`Warehouse ID: ${staff.warehouse_id}`);

  // 3. Get Destination Location
  const locCode = 'D0-A01-001-01-C';
  const { data: location, error: locErr } = await adminClient
    .from('warehouse_locations')
    .select('*')
    .eq('warehouse_id', staff.warehouse_id)
    .eq('location_code', locCode)
    .single();

  if (locErr || !location) {
    console.error('Failed to find location:', locErr);
  } else {
    console.log('\n[3] Location Info:');
    console.log(`ID: ${location.id}`);
    console.log(`Code: ${location.location_code}`);
    console.log(`Barcode: ${location.barcode}`);
    console.log(`Warehouse ID: ${location.warehouse_id}`);
    console.log(`Capacity: ${location.capacity}`);
    
    // Check Placements
    const { data: placements } = await adminClient
      .from('warehouse_product_placements')
      .select('quantity, product_id, products(name)')
      .eq('location_id', location.id);
      
    let occ = 0;
    if (placements) {
        placements.forEach(p => {
            occ += p.quantity;
            console.log(`   Placed: ${p.quantity} x ${p.products?.name}`);
        });
    }
    console.log(`Current Occupancy: ${occ}/${location.capacity}`);
  }

  // 4. Check Staging Stock
  const { data: stagingStock, error: stagingErr } = await adminClient
    .from('warehouse_stock')
    .select('*')
    .eq('product_id', product.id)
    .eq('warehouse_id', staff.warehouse_id);

  console.log('\n[4] Warehouse Stock (Staging + Shelves) for this Product in this Warehouse:');
  if (stagingStock && stagingStock.length > 0) {
    stagingStock.forEach(s => {
      console.log(`Stock ID: ${s.id}, Batch ID: ${s.batch_id}, Qty: ${s.quantity}, Status: ${s.status}`);
    });
  } else {
    console.log('No stock records found for this product in this warehouse.');
  }
  
  // 5. Total placed quantity in warehouse_product_placements for this product
  const { data: allPlacements } = await adminClient
    .from('warehouse_product_placements')
    .select('quantity, location_id, warehouse_locations(location_code)')
    .eq('warehouse_id', staff.warehouse_id)
    .eq('product_id', product.id);
    
  console.log('\n[5] Physical Placements for this Product:');
  let totalPlaced = 0;
  if (allPlacements && allPlacements.length > 0) {
      allPlacements.forEach(p => {
          totalPlaced += p.quantity;
          console.log(`   Location: ${p.warehouse_locations?.location_code} -> Qty: ${p.quantity}`);
      });
  }
  console.log(`   Total Physically Placed: ${totalPlaced}`);

  // 6. Check Product Batches
  const { data: batches, error: batchErr } = await adminClient
    .from('product_batches')
    .select('*')
    .eq('product_id', product.id)
    .eq('warehouse_id', staff.warehouse_id)
    .order('created_at', { ascending: false });

  console.log('\n[6] Product Batches for this Product in this Warehouse:');
  if (batches && batches.length > 0) {
    batches.forEach(b => {
      console.log(`Batch ID: ${b.id}, Supplier: ${b.supplier_id}, PO: ${b.po_id}, Created: ${b.created_at}, Available Qty: ${b.available_quantity}, Status: ${b.status}`);
    });
  } else {
    console.log('No batches found.');
  }

  // 7. Check Stock Ledger
  console.log('\n[7] Stock Ledger History (Last 10 entries):');
  const { data: ledger, error: ledgerErr } = await adminClient
    .from('stock_ledgers')
    .select('*')
    .eq('product_id', product.id)
    .eq('warehouse_id', staff.warehouse_id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (ledger && ledger.length > 0) {
    ledger.forEach(l => {
      console.log(`Date: ${l.created_at}, Reason: ${l.reason}, Qty Chg: ${l.quantity_change}, Batch: ${l.batch_id}`);
    });
  } else {
    console.log('No ledger entries found. (Could be named differently)');
  }
}

investigatePutaway().catch(console.error);
