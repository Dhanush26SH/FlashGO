const fs = require('fs');

async function run() {
    console.log("Starting Page 11 Final Closure Addendum Tests...");
    const env = fs.readFileSync('.env', 'utf8');
    const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
    const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

    async function signupAndGetToken(email, role) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ email, password: 'password123' })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error_description || data.error.message || data.error);
        const token = data.access_token;
        const userId = data.user.id;
        
        // Proxy RPC to set profile
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/test_set_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ p_email: email, p_role: role })
        });

        return { token, userId, email };
    }

    async function callRpc(token, func, body = {}) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${func}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || JSON.stringify(err));
        }
        return res.json();
    }

    async function dbSelect(token, table, query) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
        });
        return res.json();
    }

    try {
        const stamp = Date.now();
        console.log("Signing up users...");
        const admin = await signupAndGetToken(`admin_${stamp}@test.com`, 'admin');
        const whStaff = await signupAndGetToken(`whstaff_${stamp}@test.com`, 'warehouse_staff');
        const driver = await signupAndGetToken(`driver_${stamp}@test.com`, 'driver');
        const customer = await signupAndGetToken(`customer_${stamp}@test.com`, 'customer');

        console.log("\n--- SCENARIO 1: Warehouse Staff Flow ---");
        const s1_start = new Date();
        s1_start.setDate(s1_start.getDate() + 1);
        const s1_end = new Date(s1_start);
        s1_end.setHours(s1_end.getHours() + 4);

        const s1_slot = await callRpc(admin.token, 'test_create_admin_slot', {
            p_capacity: 1,
            p_role: 'warehouse_staff'
        });

        const avail1 = await dbSelect(whStaff.token, 'rpc/get_available_work_slots', '');
        if (!avail1.find(s => s.id === s1_slot)) throw new Error("Staff could not see available slot");

        await callRpc(whStaff.token, 'worker_book_slot', { p_slot_id: s1_slot });

        const mySlots1 = await dbSelect(whStaff.token, 'rpc/get_my_work_slots', '');
        const myShift = mySlots1.find(s => s.slot_id === s1_slot);
        if (!myShift) throw new Error("Shift not in My Slots");

        await callRpc(whStaff.token, 'worker_cancel_booking', { p_shift_id: myShift.shift_id });
        const mySlots1_after = await dbSelect(whStaff.token, 'rpc/get_my_work_slots', '');
        if (mySlots1_after.find(s => s.slot_id === s1_slot && s.shift_status === 'scheduled')) throw new Error("Booking not cancelled");
        console.log("Scenario 1 PASS");

        console.log("\n--- SCENARIO 2: Driver Flow & Isolation ---");
        const s2_slot = await callRpc(admin.token, 'test_create_admin_slot', {
            p_capacity: 1,
            p_role: 'driver'
        });

        const d_prof_before = await dbSelect(admin.token, 'profiles', `id=eq.${driver.userId}`);
        const d_sess_before = await dbSelect(admin.token, 'driver_sessions', `driver_id=eq.${driver.userId}`);
        const d_trips_before = await dbSelect(admin.token, 'logistics_trips', `driver_id=eq.${driver.userId}`);

        await callRpc(driver.token, 'worker_book_slot', { p_slot_id: s2_slot });

        const d_prof_after = await dbSelect(admin.token, 'profiles', `id=eq.${driver.userId}`);
        const d_sess_after = await dbSelect(admin.token, 'driver_sessions', `driver_id=eq.${driver.userId}`);
        const d_trips_after = await dbSelect(admin.token, 'logistics_trips', `driver_id=eq.${driver.userId}`);

        if (d_prof_before[0].is_online !== d_prof_after[0].is_online) throw new Error("is_online mutated");
        if (d_sess_before.length !== d_sess_after.length) throw new Error("driver_sessions mutated");
        if (d_trips_before.length !== d_trips_after.length) throw new Error("logistics_trips mutated");

        const mySlots2 = await dbSelect(driver.token, 'rpc/get_my_work_slots', '');
        if (!mySlots2.find(s => s.slot_id === s2_slot)) throw new Error("Shift not in My Slots");
        console.log("Scenario 2 PASS");

        console.log("\n--- SCENARIO 3: Direct API Security ---");
        // Customer tries to read slots directly
        const c_read = await fetch(`${SUPABASE_URL}/rest/v1/work_slots`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${customer.token}` } });
        const c_read_res = await c_read.json();
        if (c_read_res.length > 0 || !c_read_res.message?.includes('RLS') && c_read.ok && c_read_res.length !== 0) {
            // Note: If array is empty, it means RLS blocked it.
            if (Array.isArray(c_read_res) && c_read_res.length > 0) throw new Error("Customer read slots directly");
        }

        // Driver tries to insert slot directly
        const d_ins = await fetch(`${SUPABASE_URL}/rest/v1/work_slots`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${driver.token}` },
            body: JSON.stringify({ warehouse_id: '00000000-0000-0000-0000-000000000000', target_role: 'driver', start_time: s1_start.toISOString(), end_time: s1_end.toISOString(), capacity: 1 })
        });
        if (d_ins.ok) throw new Error("Driver directly inserted work_slot");
        
        // Driver tries to modify another worker's shift directly
        const d_mod = await fetch(`${SUPABASE_URL}/rest/v1/staff_shifts?id=eq.${myShift.shift_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${driver.token}` },
            body: JSON.stringify({ status: 'completed' })
        });
        const d_mod_res = await d_mod.json();
        if (d_mod_res.length > 0) throw new Error("Driver modified another worker's shift");

        console.log("Scenario 3 PASS");

    } catch (e) {
        console.error("Fatal Error:", e);
    }
}
run();
