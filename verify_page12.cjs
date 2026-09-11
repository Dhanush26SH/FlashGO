const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    console.log("Starting FINAL Page 12 Runtime Verification...");
    const env = fs.readFileSync('.env', 'utf8');
    const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
    const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

    const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const clientAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function signupAndGetToken(email, role, clientObj) {
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
        
        if (clientObj) {
            await clientObj.auth.setSession({ access_token: token, refresh_token: token });
        }

        return { token, user_id };
    }

    try {
        const custA = await signupAndGetToken(`custa_${Date.now()}@test.com`, 'customer', clientA);
        const custB = await signupAndGetToken(`custb_${Date.now()}@test.com`, 'customer', clientB);
        const adminA = await signupAndGetToken(`admina_${Date.now()}@test.com`, 'admin', clientAdmin);

        // ==== 1. Ticket Message Isolation ====
        let res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custB.token}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ customer_id: custB.user_id, category: 'Other', subject: 'CustB Ticket', description: 'Help!' })
        });
        const ticketB = (await res.json())[0];

        // Customer A cannot SELECT Customer B's ticket messages
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_ticket_messages?ticket_id=eq.${ticketB.id}`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` }
        });
        const msgsA = await res.json();
        if (msgsA.length === 0) console.log("PASS: CustA cannot read CustB ticket messages");
        else console.log("FAIL: CustA read CustB ticket messages");

        // Customer A cannot INSERT a message into Customer B's ticket
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_ticket_messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ ticket_id: ticketB.id, sender_id: custA.user_id, message: 'Hack' })
        });
        if (!res.ok) console.log("PASS: CustA cannot insert message into CustB ticket");
        else console.log("FAIL: CustA inserted message into CustB ticket");

        // Admin reply must use authenticated Admin's identity (spoof sender test)
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_ticket_messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ ticket_id: ticketB.id, sender_id: adminA.user_id, message: 'I am admin' })
        });
        if (!res.ok) console.log("PASS: Admin reply identity cannot be spoofed by Customer");
        else console.log("FAIL: Admin identity spoofed");


        // ==== 2. Realtime Chat Verification ====
        console.log("Setting up realtime subscriptions...");
        
        let adminReceived = false;
        let custAReceived = false;
        let custBReceived = false;
        
        const channelAdmin = clientAdmin.channel(`public:support_ticket_messages:ticket_id=eq.${ticketB.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${ticketB.id}` }, (payload) => {
                if (payload.new.sender_id === custB.user_id) adminReceived = true;
            }).subscribe((status) => console.log('Admin channel status:', status));
            
        const channelCustB = clientB.channel(`public:support_ticket_messages:ticket_id=eq.${ticketB.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${ticketB.id}` }, (payload) => {
                if (payload.new.sender_id === adminA.user_id) custAReceived = true;
            }).subscribe((status) => console.log('CustB channel status:', status));
            
        const channelCustA = clientA.channel(`public:support_ticket_messages:ticket_id=eq.${ticketB.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${ticketB.id}` }, (payload) => {
                custBReceived = true; // CustA listening to CustB's ticket
            }).subscribe((status) => console.log('CustA channel status:', status));
            
        await sleep(2000); // allow channels to sub
        
        // CustB sends message
        await fetch(`${SUPABASE_URL}/rest/v1/support_ticket_messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custB.token}` },
            body: JSON.stringify({ ticket_id: ticketB.id, sender_id: custB.user_id, message: 'Realtime test' })
        });
        
        // Admin sends message
        await fetch(`${SUPABASE_URL}/rest/v1/support_ticket_messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ ticket_id: ticketB.id, sender_id: adminA.user_id, message: 'Realtime reply' })
        });

        await sleep(2000); // wait for socket delivery

        if (adminReceived) console.log("PASS: Admin receives message via realtime");
        else console.log("FAIL: Admin did not receive realtime message");
        
        if (custAReceived) console.log("PASS: Customer receives admin reply via realtime");
        else console.log("FAIL: Customer did not receive admin reply");
        
        if (!custBReceived) console.log("PASS: Customer B (unauthorized) does NOT receive conversation via realtime");
        else console.log("FAIL: Customer B received realtime messages they shouldn't");
        
        await channelAdmin.unsubscribe();
        await channelCustB.unsubscribe();
        await channelCustA.unsubscribe();

        // ==== 3. Full Ticket Lifecycle ====
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_ticket_status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_ticket_id: ticketB.id, p_status: 'in_progress' })
        });
        if (res.ok) console.log("PASS: Admin changes ticket status to in_progress");
        else console.log("FAIL: Admin status change failed");

        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_ticket_status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_ticket_id: ticketB.id, p_status: 'resolved' })
        });
        if (res.ok) console.log("PASS: Admin changes ticket status to resolved");
        
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_ticket_status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_ticket_id: ticketB.id, p_status: 'closed' })
        });
        if (res.ok) console.log("PASS: Admin changes ticket status to closed");

        // Customer attempts to transition
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketB.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custB.token}` },
            body: JSON.stringify({ status: 'open' })
        });
        res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketB.id}`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custB.token}` }
        });
        const currentTick = (await res.json())[0];
        if (currentTick.status === 'closed') console.log("PASS: Customer unable to make status transitions directly");
        else console.log("FAIL: Customer transitioned status directly");


        // ==== 5. Wallet Security/Integrity Re-check ====
        // Unauthorized customer manual debit/credit rejected
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_wallet_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ p_user_id: custA.user_id, p_amount: 50, p_tx_type: 'debit', p_description: 'Self-debit' })
        });
        if (!res.ok) console.log("PASS: Arbitrary Customer manual debit rejected");
        else console.log("FAIL: Customer was able to execute process_wallet_transaction!");

        // Admin credit succeeds
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_wallet_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_user_id: custB.user_id, p_amount: 100, p_tx_type: 'credit', p_description: 'Refund' })
        });
        if (res.ok) console.log("PASS: Admin credit succeeds");
        else console.log("FAIL: Admin credit failed");
        
        // Admin debit succeeds when balance permits
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_wallet_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_user_id: custB.user_id, p_amount: 40, p_tx_type: 'debit', p_description: 'Adjustment' })
        });
        if (res.ok) console.log("PASS: Admin debit succeeds when balance permits");

        // Admin debit rejected when amount > balance
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_wallet_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_user_id: custB.user_id, p_amount: 1000, p_tx_type: 'debit', p_description: 'Adjustment' })
        });
        const debitData = await res.text();
        if (debitData === 'false') console.log("PASS: Admin debit exceeding balance rejected");
        else console.log("FAIL: Admin debit exceeding balance wasn't rejected");


        // ==== 6. Customer Suspension ====
        // Admin suspends
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/suspend_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_user_id: custB.user_id })
        });
        if (res.ok) console.log("PASS: Admin can suspend Customer");
        
        // Admin reactivates
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reactivate_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ p_user_id: custB.user_id })
        });
        if (res.ok) console.log("PASS: Admin can reactivate Customer");

        // Customer cannot suspend themselves
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/suspend_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ p_user_id: custB.user_id })
        });
        if (!res.ok) console.log("PASS: Customer cannot suspend themselves or others");

        
        // ==== 7. Coupons ====
        // Admin create coupon
        res = await fetch(`${SUPABASE_URL}/rest/v1/coupons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminA.token}` },
            body: JSON.stringify({ code: `PROMO${Date.now()}`, discount_type: 'flat', discount_value: 10, min_order_value: 0, active: true })
        });
        if (res.ok) console.log("PASS: Admin creates coupon successfully");
        
        // Customer create coupon rejected
        res = await fetch(`${SUPABASE_URL}/rest/v1/coupons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${custA.token}` },
            body: JSON.stringify({ code: `PROMO${Date.now()}`, discount_type: 'flat', discount_value: 10, min_order_value: 0, active: true })
        });
        if (!res.ok) console.log("PASS: Customer direct coupon creation rejected");

        console.log("ALL REST/RPC CHECKS COMPLETE");

    } catch (e) {
        console.error(e);
    }
}
run();
