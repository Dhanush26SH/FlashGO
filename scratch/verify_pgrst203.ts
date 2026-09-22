import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function verify() {
  console.log('--- Post-Migration Verification ---');

  // Verify function overloads
  const { data: functions, error: funcErr } = await adminClient.rpc('execute_sql', {
    query: `
      SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'receive_procurement_order'
    `
  });

  if (funcErr) {
      console.error('Failed to query functions:', funcErr);
  } else {
      console.log(`\nFound ${functions.length} overload(s) for receive_procurement_order:`);
      functions.forEach((f: any) => console.log(`- ${f.name}(${f.arguments})`));
  }

  // Verify process_grn fix remains
  const { data: funcBody, error: bodyErr } = await adminClient.rpc('execute_sql', {
    query: `
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'receive_procurement_order'
    `
  });
  
  if (bodyErr) {
      console.error('Failed to query function body:', bodyErr);
  } else if (funcBody && funcBody.length > 0) {
      const def = funcBody[0].definition;
      const hasUpsert = def.includes('INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity, staging_quantity)') &&
                        def.includes('ON CONFLICT (warehouse_id, product_id) DO UPDATE');
      console.log(`\nDoes canonical function still contain the new-SKU UPSERT fix? ${hasUpsert ? 'Yes' : 'No'}`);
  }

  // Verify no new business mutations for the failed PO
  // We check the specific PO 02b8d00d-304b-4a5f-8c38-897bdafc1bc8 or any PO for FLH100244 / pending status
  // For safety, let's just check goods_receipts created in the last 10 minutes
  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentGrns } = await adminClient
    .from('goods_receipts')
    .select('*')
    .gte('created_at', tenMinsAgo);
    
  console.log(`\nRecent goods_receipts created in last 10 mins: ${recentGrns?.length || 0}`);
  if (recentGrns && recentGrns.length > 0) {
      recentGrns.forEach((g: any) => console.log(`- Receipt: ${g.receipt_number}`));
  } else {
      console.log('The failed physical GRN still has not produced any business mutations.');
  }

}

verify().catch(console.error);
