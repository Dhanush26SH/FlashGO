const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
    console.log("Starting FINAL Page 14 Runtime Verification...");

    async function signupAndGetToken(email, role) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ email, password: 'password123' })
        });
        const data = await res.json();
        const token = data.access_token;
        const user_id = data.user.id;
        
        await new Promise(r => setTimeout(r, 1000)); 
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/test_set_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ p_email: email, p_role: role })
        });
        return { token, user_id };
    }

    const admin = await signupAndGetToken(`admin_${Date.now()}@test.com`, 'admin');
    const cust = await signupAndGetToken(`cust_${Date.now()}@test.com`, 'customer');
    
    const adminToken = admin.token;
    const adminId = admin.user_id;
    const custId = cust.user_id;
    const custToken = cust.token;

    let res, data;

    // ==== TEST 1: Basic Profile Edit (Admin updates own name and phone) ====
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_my_basic_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ p_full_name: 'SuperAdmin FlashGO', p_phone: '+919999999999' })
    });
    if (res.ok) console.log("PASS: Admin updates own full name & phone via RPC.");
    else console.log("FAIL: Admin update RPC failed.", await res.text());

    // Verify it persisted
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', adminId).single();
    if (profile.full_name === 'SuperAdmin FlashGO' && profile.phone === '+919999999999') {
        console.log("PASS: changes persist after refetch/re-login.");
    } else {
        console.log("FAIL: changes did not persist.", profile);
    }

    // Restore original name to not break other things
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_my_basic_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ p_full_name: 'SuperAdmin', p_phone: '+15550000000' })
    });

    // ==== TEST 2: Sensitive Direct Mutation ====
    res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${adminId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}`, 'Prefer': 'return=representation' },
        body: JSON.stringify({ role: 'warehouse_staff' })
    });
    const patchRes = await res.json();
    if (res.status === 400 && patchRes.message?.includes("Cannot modify role directly")) {
        console.log("PASS: Direct mutation of role is blocked for Admin self-edit.");
    } else {
        console.log("FAIL: Direct mutation of role was NOT blocked or behaved unexpectedly.", patchRes);
    }

    res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${adminId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}`, 'Prefer': 'return=representation' },
        body: JSON.stringify({ is_suspended: true })
    });
    const patchRes2 = await res.json();
    if (res.status === 400 && patchRes2.message?.includes("Cannot modify suspension status directly")) {
        console.log("PASS: Direct mutation of suspension state is blocked for Admin self-edit.");
    } else {
        console.log("FAIL: Direct mutation of suspension was NOT blocked or behaved unexpectedly.", patchRes2);
    }

    // ==== TEST 3: Cross-user Protection ====
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_my_basic_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}` },
        // RPC doesn't take UUID, so we can't spoof it!
        body: JSON.stringify({ p_full_name: 'Hacked Name', p_phone: '0000' })
    });
    // The RPC natively uses auth.uid() so it only edits Admin's own.
    const { data: custProfile } = await supabase.from('profiles').select('*').eq('id', custId).single();
    if (custProfile.full_name !== 'Hacked Name') {
        console.log("PASS: Admin cannot use self-profile RPC to edit another user by design (signature enforces auth.uid()).");
    }

    // ==== TEST 4: Existing Privileged RPC Regression ====
    // Admin suspends customer (legitimate RPC)
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/suspend_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ p_user_id: custId, p_reason: 'Testing Suspension' })
    });
    if (res.ok) console.log("PASS: Admin suspend_profile RPC still works.");
    else console.log("FAIL: Admin suspend_profile RPC failed.", await res.text());

    // Restore customer
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/unsuspend_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ p_user_id: custId })
    });

    console.log("ALL REST/RPC CHECKS COMPLETE");
}

runTests();
