import pg from 'pg';
const { Client } = pg;

async function investigate() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  });
  
  try {
    await client.connect();
    
    console.log("=== 1. Order Resolution ===");
    const orderRes = await client.query(`
      SELECT id, order_number, status, warehouse_id, trip_id
      FROM public.orders 
      WHERE order_number = 'FG-20260920-8B588'
    `);
    const order = orderRes.rows[0];
    console.log(order);
    
    if (!order) {
      console.log("Order not found!");
      return;
    }

    console.log("\n=== 2. Warehouse details ===");
    const whRes = await client.query(`
      SELECT id, name FROM public.warehouses WHERE id = $1
    `, [order.warehouse_id]);
    console.log(whRes.rows[0]);

    console.log("\n=== 3. Logistics Trip ===");
    if (order.trip_id) {
      const tripRes = await client.query(`
        SELECT id, status, driver_id, created_at FROM public.logistics_trips WHERE id = $1
      `, [order.trip_id]);
      console.log(tripRes.rows[0]);
    } else {
      const tripFallback = await client.query(`
        SELECT id, status, driver_id, created_at FROM public.logistics_trips WHERE order_id = $1
      `, [order.id]);
      console.log(tripFallback.rows);
    }

    console.log("\n=== 4. Driver1 Resolution ===");
    const driverRes = await client.query(`
      SELECT id, email FROM auth.users WHERE email = 'drivarrr1@gmail.com'
    `);
    const driverId = driverRes.rows[0]?.id;
    console.log({ driverId, email: driverRes.rows[0]?.email });

    if (!driverId) return;

    console.log("\n=== 5. Driver1 Profile & Session ===");
    const profRes = await client.query(`
      SELECT role, is_online FROM public.profiles WHERE id = $1
    `, [driverId]);
    console.log("Profile:", profRes.rows[0]);

    const sessionRes = await client.query(`
      SELECT id, status, staff_shift_id, active_vehicle_id 
      FROM public.driver_sessions 
      WHERE driver_id = $1 AND status = 'active'
    `, [driverId]);
    console.log("Session:", sessionRes.rows[0]);
    
    if (sessionRes.rows[0]?.staff_shift_id) {
      const shiftRes = await client.query(`
        SELECT id, warehouse_id, status FROM public.staff_shifts WHERE id = $1
      `, [sessionRes.rows[0].staff_shift_id]);
      console.log("Shift:", shiftRes.rows[0]);
    }

    console.log("\n=== 6. Vehicle Compliance ===");
    if (sessionRes.rows[0]?.active_vehicle_id) {
      const vehRes = await client.query(`
        SELECT status, compliance_status 
        FROM public.driver_vehicles 
        WHERE id = $1
      `, [sessionRes.rows[0].active_vehicle_id]);
      console.log("Vehicle:", vehRes.rows[0]);
    }

    console.log("\n=== 7. Driver Return Tasks ===");
    const returnTasksRes = await client.query(`
      SELECT id, trip_id, warehouse_id, return_type, status, created_at, completed_at
      FROM public.driver_return_tasks
      WHERE driver_id = $1
    `, [driverId]);
    console.log("Return Tasks:", returnTasksRes.rows);

    console.log("\n=== 8. Dispatch Offers / Assignments ===");
    const offersRes = await client.query(`
      SELECT id, trip_id, driver_id, status, created_at 
      FROM public.dispatch_offers 
      WHERE trip_id = $1 OR driver_id = $2
      ORDER BY created_at DESC LIMIT 5
    `, [order.trip_id || null, driverId]);
    console.log("Offers:", offersRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

investigate();
