import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://postgres.szpfuommfvrfdliloxcg:NivQvJqYx@N82L!@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

async function verify() {
  console.log('--- Post-Migration Verification ---');
  
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // 1. Verify function overloads
    const { rows: functions } = await client.query(`
      SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'receive_procurement_order'
    `);

    console.log(`\nFound ${functions.length} overload(s) for receive_procurement_order:`);
    functions.forEach((f) => console.log(`- ${f.name}(${f.arguments})`));

    // 2. Verify process_grn fix remains
    const { rows: funcBody } = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'receive_procurement_order'
    `);
    
    if (funcBody && funcBody.length > 0) {
        const def = funcBody[0].definition;
        const hasUpsert = def.includes('INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity, staging_quantity)') &&
                          def.includes('ON CONFLICT (warehouse_id, product_id) DO UPDATE');
        console.log(`\nDoes canonical function still contain the new-SKU UPSERT fix? ${hasUpsert ? 'Yes' : 'No'}`);
    }

    // 3. Verify no new business mutations for the failed PO
    const tenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { rows: recentGrns } = await client.query(`
      SELECT * FROM public.goods_receipts
      WHERE created_at >= $1
    `, [tenMinsAgo]);
      
    console.log(`\nRecent goods_receipts created in last 15 mins: ${recentGrns.length}`);
    if (recentGrns && recentGrns.length > 0) {
        recentGrns.forEach((g) => console.log(`- Receipt: ${g.receipt_number}`));
    } else {
        console.log('The failed physical GRN still has not produced any business mutations.');
    }
  } finally {
    await client.end();
  }
}

verify().catch(console.error);
