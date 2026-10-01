const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:flashgo-superuser-2026@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function getTableSchema(tableName) {
  const res = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `, [tableName]);
  return res.rows;
}

async function run() {
  try {
    await client.connect();
    
    console.log('--- ORDERS ---');
    console.log(await getTableSchema('orders'));
    console.log('--- ORDER ITEMS ---');
    console.log(await getTableSchema('order_items'));
    console.log('--- RETURN TASKS ---');
    console.log(await getTableSchema('return_tasks'));
    console.log('--- WAREHOUSE INTAKE ---');
    console.log(await getTableSchema('warehouse_intake'));
    console.log('--- PROFILES ---');
    console.log(await getTableSchema('profiles'));
    console.log('--- DRIVER SESSIONS ---');
    console.log(await getTableSchema('driver_sessions'));
    console.log('--- LOGISTICS TRIPS ---');
    console.log(await getTableSchema('logistics_trips'));
    
    console.log('--- RPCS (Returns) ---');
    const rpcs = await client.query(`
      SELECT p.proname, pg_get_function_arguments(p.oid) as args
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname ILIKE '%return%'
    `);
    console.log(rpcs.rows);

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
