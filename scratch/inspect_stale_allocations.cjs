const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres.szpfuommfvrfdliloxcg:flashgo-superuser-2026@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    
    // Check CHECK constraints
    const constraintsRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'drop_zone_allocations' AND c.contype = 'c';
    `);
    console.log('\n--- CHECK constraints ---');
    console.log(constraintsRes.rows);

    const q = `
      SELECT 
        dza.id AS allocation_id,
        dz.zone_code,
        dza.status AS allocation_status,
        dza.order_id,
        dza.trip_id,
        dza.picker_id,
        dza.driver_id,
        dza.placed_at,
        dza.driver_assigned_at,
        dza.picked_up_at,
        dza.created_at,
        o.order_number,
        o.status AS order_status,
        lt.status AS trip_status,
        lt.driver_id AS trip_driver,
        lt.completed_at
      FROM public.drop_zone_allocations dza
      JOIN public.drop_zones dz ON dz.id = dza.drop_zone_id
      JOIN public.orders o ON o.id = dza.order_id
      JOIN public.logistics_trips lt ON lt.id = dza.trip_id
      WHERE dz.zone_code IN ('G1', 'G2', 'G3')
        AND dza.status IN ('allocated', 'placed', 'driver_assigned');
    `;
    
    const res = await client.query(q);
    console.log('\n--- Active Allocations ---');
    console.log(JSON.stringify(res.rows, null, 2));

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
