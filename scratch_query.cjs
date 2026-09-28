const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  });
  
  await client.connect();
  
  try {
    const shiftRes = await client.query(`
      SELECT id, staff_id, status, shift_start, shift_end 
      FROM public.staff_shifts 
      WHERE status = 'active'
      ORDER BY shift_end DESC
      LIMIT 1
    `);
    console.log("ACTIVE SHIFT:");
    console.log(shiftRes.rows[0]);

    const sessionRes = await client.query(`
      SELECT id, driver_id, status, staff_shift_id
      FROM public.driver_sessions 
      WHERE status = 'active'
      LIMIT 1
    `);
    console.log("ACTIVE SESSION:");
    console.log(sessionRes.rows[0]);

    if (shiftRes.rows.length > 0) {
      // let's try to run driver_expire_shift for that user
      // But wait, driver_expire_shift uses auth.uid().
      // Let's run reconcile_worker_shifts manually and see what it does.
      console.log('Running reconcile_worker_shifts for staff_id:', shiftRes.rows[0].staff_id);
      const rec = await client.query(`SELECT public.reconcile_worker_shifts($1)`, [shiftRes.rows[0].staff_id]);
      console.log('Reconcile result:', rec.rows);

      // check if it updated
      const shiftResAfter = await client.query(`
        SELECT id, staff_id, status, shift_start, shift_end 
        FROM public.staff_shifts 
        WHERE id = $1
      `, [shiftRes.rows[0].id]);
      console.log("SHIFT AFTER:", shiftResAfter.rows[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
