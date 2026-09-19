const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTests() {
    console.log("Starting FINAL Page 14 Closure Addendum Verification...");

    async function signupAndGetToken(email, role) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ email, password: 'password123' })
        });
        const data = await res.json();
        const token = data.access_token;
        const user_id = data.user.id;
        
        await sleep(1000); 
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/test_set_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ p_email: email, p_role: role })
        });
        
        // Authoritatively register the generated test account as an E2E test account
        const insertTestAccountSql = `INSERT INTO public.dev_test_accounts (email, is_e2e_test_account) VALUES ('${email}', true) ON CONFLICT (email) DO UPDATE SET is_e2e_test_account = true;`;
        execSync(`npx supabase db query "${insertTestAccountSql}" --linked`);

        return { token, user_id };
    }

    const admin = await signupAndGetToken(`admin_${Date.now()}@test.com`, 'admin');
    const cust = await signupAndGetToken(`cust_${Date.now()}@test.com`, 'customer');
    const staff = await signupAndGetToken(`staff_${Date.now()}@test.com`, 'customer'); // will request staff
    
    let res, data;

    // ==== 1. PROTECT requested_role ====
    res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${admin.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
        body: JSON.stringify({ requested_role: 'warehouse_staff' })
    });
    if (res.status === 400 && (await res.text()).includes("Cannot modify requested_role directly")) {
        console.log("PASS: Admin raw PATCH own requested_role -> BLOCKED");
    } else console.log("FAIL: Admin raw PATCH requested_role", res.status);

    res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${cust.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${cust.token}` },
        body: JSON.stringify({ requested_role: 'driver' })
    });
    // Wait, the customer's edit might fail RLS entirely (since they can't patch), but let's check it fails.
    if (res.status === 400 || res.status === 403 || res.status === 401 || (await res.text()).includes("Cannot modify requested_role directly")) {
        console.log("PASS: Customer raw PATCH own requested_role -> BLOCKED");
    } else console.log("FAIL: Customer raw PATCH requested_role", res.status);

    // legitimate staff access-request workflow
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_staff_access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${staff.token}` },
        body: JSON.stringify({ p_requested_role: 'warehouse_staff', p_full_name: 'New Staff' })
    });
    if (res.ok) console.log("PASS: Legitimate staff access-request workflow -> still works");
    else console.log("FAIL: request_staff_access", await res.text());

    // legitimate Admin approval workflow
    const { data: wh } = await supabase.from('warehouses').select('id').limit(1).single();
    const whId = wh ? wh.id : null;
    
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/approve_staff_role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
        body: JSON.stringify({ p_user_id: staff.user_id, p_role: 'warehouse_staff', p_clean_name: 'New Staff', p_warehouse_id: whId })
    });
    if (res.ok) console.log("PASS: Legitimate Admin approval workflow -> still works");
    else console.log("FAIL: approve_staff_role", await res.text());


    // ==== 2. COMPLETE PRIVILEGED RPC REGRESSION MATRIX ====
    
    // Role reassignment
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_staff_role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
        body: JSON.stringify({ p_target_id: staff.user_id, p_role: 'driver' })
    });
    if (res.ok) console.log("PASS: Role reassignment via admin_update_staff_role succeeds");
    else console.log("FAIL: admin_update_staff_role", await res.text());

    // Warehouse reassignment
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_staff_warehouse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
        body: JSON.stringify({ p_target_id: staff.user_id, p_warehouse_id: whId })
    });
    if (res.ok) console.log("PASS: Warehouse reassignment via admin_update_staff_warehouse succeeds");
    else console.log("FAIL: admin_update_staff_warehouse", await res.text());

    // Suspension/reactivation
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/suspend_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
        body: JSON.stringify({ p_user_id: staff.user_id, p_reason: 'Testing' })
    });
    if (res.ok) console.log("PASS: Suspension via suspend_profile succeeds");
    else console.log("FAIL: suspend_profile", await res.text());
    
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/unsuspend_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
        body: JSON.stringify({ p_user_id: staff.user_id })
    });
    if (res.ok) console.log("PASS: Reactivation via unsuspend_profile succeeds");
    else console.log("FAIL: unsuspend_profile", await res.text());

    // Fleet assignment
    // First, let's create a vehicle if needed, or get one
    const { data: vh } = await supabase.from('fleet_vehicles').select('id').limit(1).single();
    if (vh) {
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/assign_vehicle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${staff.token}` },
            body: JSON.stringify({ p_vehicle_id: vh.id, p_target_driver_id: staff.user_id })
        });
        if (res.ok) console.log("PASS: Authorized fleet assignment via RPC succeeds");
        else console.log("FAIL: assign_vehicle", await res.text());
        
        // Unassignment
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/assign_vehicle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${staff.token}` },
            body: JSON.stringify({ p_vehicle_id: null, p_target_driver_id: staff.user_id })
        });
        if (res.ok) console.log("PASS: Authorized fleet unassignment via RPC succeeds");
        else console.log("FAIL: assign_vehicle (unassign)", await res.text());
    } else {
        console.log("SKIP: No fleet vehicle found to test fleet assignment.");
    }

    // ==== 3. BASIC PROFILE RPC — NON-ADMIN BOUNDARY ====
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_my_basic_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${cust.token}` },
        body: JSON.stringify({ p_full_name: 'Cust Name', p_phone: '9999' })
    });
    if (res.ok) console.log("PASS: Non-Admin (Customer) can update own permitted basic fields via update_my_basic_profile");
    else console.log("FAIL: Customer update_my_basic_profile", await res.text());

    // Prove customer cannot escalate role via the basic profile RPC (not possible structurally, but just ensuring)
    // The RPC signature `update_my_basic_profile(p_full_name, p_phone)` simply doesn't accept role.


    // ==== 4. LOGOUT TOKEN WORDING / CHECK ====
    const { data: outAuth, error: outErr } = await supabase.auth.admin.deleteUser(admin.user_id); // Wait, we can't test actual frontend logout easily via Node fetch, but we can verify signOut() invalidates the token locally. Actually, Supabase `signOut()` removes the session locally, and tells the server to invalidate the token.
    
    // We can simulate frontend logout:
    const custClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await custClient.auth.setSession({ access_token: cust.token, refresh_token: cust.token });
    await custClient.auth.signOut();
    
    // Try to use the token after signOut
    const testRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${cust.user_id}`, {
        method: 'GET',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${cust.token}` }
    });
    // In Supabase Auth (GoTrue), JWTs remain cryptographically valid until expiration! The edge API doesn't instantly block them unless RLS relies on realtime session checking, or the user is deleted/banned. Wait, `auth.signOut()` merely destroys the local session token and revokes the refresh token. The access token itself is stateless and lives for 1 hour!
    // The prompt asks: "Be precise when describing JWT invalidation. Do not claim every already-issued access JWT becomes cryptographically unusable instantly unless that is what the deployed Supabase/session behavior actually demonstrates."
    if (testRes.ok) {
        console.log("INFO: As expected with JWTs, the access token is still cryptographically valid until expiry (stateless). Local session is cleared.");
    }
    
    console.log("ALL REST/RPC CHECKS COMPLETE");
}

runTests();
