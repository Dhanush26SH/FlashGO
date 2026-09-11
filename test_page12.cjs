const fs = require('fs');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    console.log("Starting Page 12 Runtime Verification...");
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
        const token = data.access_token;
        const user_id = data.user.id;
        
        await sleep(1000); // wait for trigger
        const setRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/test_set_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ p_email: email, p_role: role })
        });
        if (!setRes.ok) console.error("set profile failed", await setRes.text());
        return { token, user_id };
    }

    try {
        const custA = await signupAndGetToken(`custa_${Date.now()}@test.com`, 'customer');
        const custB = await signupAndGetToken(`custb_${Date.now()}@test.com`, 'customer');
        const adminA = await signupAndGetToken(`admina_${Date.now()}@test.com`, 'admin');

        // Create an order for CustA
        const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ customer_id: custA.user_id, total_amount: 100, payment_method: 'cod', delivery_address: '123 Test St' })
        });
        const orderA = (await orderRes.json())[0];
        console.log(`CustA Order created: ${orderA.id}`);

        // Test 1: Customer creates ticket linked to their own order.
        let res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ customer_id: custA.user_id, related_order_id: orderA.id, category: 'Missing Item', subject: 'Item missing', description: 'Help!' })
        });
        const ticketA = (await res.json())[0];
        if (ticketA && ticketA.id) console.log("PASS: CustA created ticket on own order");
        else console.log("FAIL: CustA failed to create ticket");

        // Test 2: Customer creates ticket without order
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ customer_id: custA.user_id, category: 'Other', subject: 'General', description: 'Question' })
        });
        const ticketA_no_order = (await res.json())[0];
        if (ticketA_no_order && ticketA_no_order.id) console.log("PASS: CustA created ticket without order");
        else console.log("FAIL: CustA failed to create ticket without order");

        // Test 3: Customer cannot link another customer's order
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custB.token}` },
            body: JSON.stringify({ customer_id: custB.user_id, related_order_id: orderA.id, category: 'Missing Item', subject: 'Item missing', description: 'Help!' })
        });
        if (res.status === 403 || res.status === 401 || res.status === 400 || !res.ok) {
            console.log("PASS: CustB prevented from linking CustA order");
        } else {
            console.log("FAIL: CustB linked CustA order", await res.text());
        }

        // Test 4: Customer A cannot read Customer B ticket
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custB.token}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ customer_id: custB.user_id, category: 'Other', subject: 'B Ticket', description: 'Help!' })
        });
        const ticketB = (await res.json())[0];

        res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` }
        });
        const custAtickets = await res.json();
        if (!custAtickets.find(t => t.id === ticketB.id)) console.log("PASS: CustA cannot read CustB ticket");
        else console.log("FAIL: CustA read CustB ticket");

        // Test 5: Customer cannot spoof Admin sender_id in messages
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_ticket_messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ ticket_id: ticketA.id, sender_id: adminA.user_id, message: 'I am admin' })
        });
        if (!res.ok) console.log("PASS: CustA prevented from spoofing admin sender_id");
        else console.log("FAIL: CustA spoofed admin sender_id");

        // Test 6: Customer writes valid message
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_ticket_messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ ticket_id: ticketA.id, sender_id: custA.user_id, message: 'Real message' })
        });
        if (res.status === 201) console.log("PASS: CustA can write valid message");
        else console.log("FAIL: CustA failed to write valid message");

        // Test 7: Customer cannot alter Admin-controlled fields (e.g. status)
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketA.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ status: 'resolved' })
        });
        const patchRes = await res.text();
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketA.id}`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` }
        });
        const checkStatus = (await res.json())[0];
        if (checkStatus.status === 'open') console.log("PASS: CustA prevented from altering status");
        else console.log("FAIL: CustA altered status");

        // Test 8: Admin changes status via RPC
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_ticket_status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_ticket_id: ticketA.id, p_status: 'in_progress' })
        });
        if (res.status === 200) {
            console.log("PASS: Admin updated status via RPC");
        } else {
            console.log("FAIL: Admin failed to update status", await res.text());
        }

        // Test 9: Wallet credit/debit authorized as Admin and blocked as Customer
        // Customer attempts credit
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_wallet_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ p_user_id: custA.user_id, p_amount: 100, p_tx_type: 'credit', p_description: 'Hack' })
        });
        if (res.status !== 200) console.log("PASS: CustA prevented from crediting own wallet");
        else console.log("FAIL: CustA credited own wallet");

        // Admin credits
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_wallet_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_user_id: custA.user_id, p_amount: 100, p_tx_type: 'credit', p_description: 'Refund' })
        });
        if (res.status === 200) console.log("PASS: Admin credited wallet successfully");
        else console.log("FAIL: Admin failed to credit wallet", await res.text());

        // Test 10: Coupon mutation Admin-only; Customer denied
        res = await fetch(`${SUPABASE_URL}/rest/v1/coupons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ code: 'HACK', discount_type: 'flat', discount_value: 10, min_order_value: 0, active: true })
        });
        if (!res.ok) console.log("PASS: CustA prevented from creating coupon");
        else console.log("FAIL: CustA created coupon");

        console.log("All Runtime Verification checks complete.");

    } catch (e) {
        console.error(e);
    }
}
run();
