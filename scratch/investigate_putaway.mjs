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
  const { data: locations, error: locErr } = await adminClient
    .from('warehouse_locations')
    .select('*')
    .ilike('barcode', '%D0-A01-001-01-C%');

  if (locErr || !locations || locations.length === 0) {
    console.error('Failed to find location:', locErr);
  } else {
    const location = locations[0];
    console.log('\n[3] Location Info:');
    console.log(`ID: ${location.id}`);
    console.log(`Barcode: ${location.barcode}`);
    console.log(`Warehouse ID: ${location.warehouse_id}`);
    console.log(`Location Type: ${location.location_type}`);
    console.log(`Max Capacity: ${location.max_capacity}`);
    console.log(`Current Occupancy: ${location.current_occupancy}`);
  }

  // 4. Get active Putaway Task
  const { data: tasks, error: taskErr } = await adminClient
    .from('warehouse_tasks')
    .select('*')
    .eq('task_type', 'putaway')
    .eq('product_id', product.id)
    .eq('assigned_to', staff.id)
    .in('status', ['pending', 'in_progress', 'assigned']);

  if (taskErr) {
    console.error('Failed to find tasks:', taskErr);
    return;
  }
  console.log('\n[4] Active Putaway Tasks for this Staff and Product:');
  console.log(`Found: ${tasks.length}`);
  let putawayTask = tasks[0];
  if (putawayTask) {
    console.log(putawayTask);
  } else {
    // If no active task assigned to this staff, check ALL putaway tasks for this product in this warehouse
    const { data: allTasks } = await adminClient
      .from('warehouse_tasks')
      .select('*')
      .eq('task_type', 'putaway')
      .eq('product_id', product.id)
      .eq('warehouse_id', staff.warehouse_id)
      .order('created_at', { ascending: false })
      .limit(5);
    console.log(`\nFound ${allTasks?.length || 0} recent putaway tasks for this product in warehouse:`);
    allTasks?.forEach(t => console.log(`Task ID: ${t.id}, Status: ${t.status}, Assigned To: ${t.assigned_to}, Source Loc: ${t.source_location_id}, Target Loc: ${t.target_location_id}, Batch: ${t.batch_id}, Qty: ${t.quantity}`));
    putawayTask = allTasks[0];
  }

  // 5. Check Staging Stock
  const { data: stagingStock, error: stagingErr } = await adminClient
    .from('warehouse_stock')
    .select('*, warehouse_locations ( barcode, location_type )')
    .eq('product_id', product.id)
    .eq('warehouse_id', staff.warehouse_id);

  console.log('\n[5] Warehouse Stock (Staging + Shelves) for this Product in this Warehouse:');
  if (stagingStock && stagingStock.length > 0) {
    stagingStock.forEach(s => {
      console.log(`Stock ID: ${s.id}, Batch ID: ${s.batch_id}, Location: ${s.warehouse_locations?.barcode || s.location_id} (Type: ${s.warehouse_locations?.location_type || 'N/A'}), Qty: ${s.quantity}, Status: ${s.status}`);
    });
  } else {
    console.log('No stock records found for this product in this warehouse.');
  }

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
      console.log(`Batch ID: ${b.id}, Supplier: ${b.supplier_id}, PO: ${b.po_id}, Created: ${b.created_at}`);
    });
  } else {
    console.log('No batches found.');
  }

  // 7. Check Stock Ledger
  console.log('\n[7] Stock Ledger History (Last 10 entries):');
  const { data: ledger, error: ledgerErr } = await adminClient
    .from('stock_ledger')
    .select('*')
    .eq('product_id', product.id)
    .eq('warehouse_id', staff.warehouse_id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (ledger && ledger.length > 0) {
    ledger.forEach(l => {
      console.log(`Date: ${l.created_at}, Type: ${l.transaction_type}, Ref ID: ${l.reference_id}, Qty Chg: ${l.quantity_change}, Balance: ${l.balance_after}, Loc: ${l.location_id}, Notes: ${l.notes}`);
    });
  } else {
    console.log('No ledger entries found.');
  }
}

investigatePutaway().catch(console.error);
