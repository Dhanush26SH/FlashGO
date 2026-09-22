import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function verify() {
  console.log('--- RPC Verification ---');
  // Check RPC overloads in DB
  let rpcRows = null;
  try {
    const { data } = await adminClient.rpc('execute_sql', {
      sql: `
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'receive_procurement_order';
      `
    });
    rpcRows = data;
  } catch (e) {
      console.log('Could not execute direct SQL via RPC');
  }
  
  if (rpcRows) {
      console.log(`Found ${rpcRows.length} receive_procurement_order functions.`);
      if (rpcRows.length > 0) {
          console.log(`Args: ${rpcRows[0].args}`);
          console.log(`Has dispatch mapping: ${rpcRows[0].def.includes("v_item->>'supplier_dispatch_batch_id'")}`);
          console.log(`Has staging UPSERT: ${rpcRows[0].def.includes('staging_quantity + EXCLUDED.staging_quantity')}`);
      }
  } else {
      // Fetch via PostgREST to see if it responds without PGRST203
      const { data, error } = await adminClient.rpc('receive_procurement_order', {});
      if (error && error.code === 'PGRST203') {
          console.log('Error: Still has PGRST203 ambiguity.');
      } else if (error) {
          console.log(`RPC exists, expected argument error: ${error.message}`);
      }
  }

  console.log('\n--- PO & Dispatch State Verification ---');
  const poId = '602f78ef-72f8-404a-9c53-d7c93ed8ff2c';
  
  const { data: poItems } = await adminClient
    .from('procurement_order_items')
    .select('id, quantity, received_quantity')
    .eq('procurement_order_id', poId);
  console.log('PO Items:', JSON.stringify(poItems, null, 2));

  const { data: dispatches } = await adminClient
    .from('supplier_dispatch_batches')
    .select('id, dispatched_quantity, received_quantity, batch_number')
    .eq('procurement_order_id', poId);
  console.log('Dispatch Batches:', JSON.stringify(dispatches, null, 2));

  console.log('\n--- Artifact Verification (No accidental creation) ---');
  const { data: grns } = await adminClient.from('goods_receipts').select('id').eq('procurement_order_id', poId);
  console.log(`GRNs created: ${grns?.length || 0}`);
  
  const { data: batches } = await adminClient.from('product_batches').select('id').eq('batch_number', 'FG-BATCH-20260922-7627');
  console.log(`Product Batches (FG-BATCH-20260922-7627) created: ${batches?.length || 0}`);
}

verify().catch(console.error);
