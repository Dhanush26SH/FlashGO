const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    console.log("Starting FINAL Page 13 Runtime Verification...");
    const env = fs.readFileSync('.env', 'utf8');
    const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
    const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

    const clientAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const clientCust = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const clientDriver = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function signupAndGetToken(email, role, clientObj) {
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
        
        // Will add wallet funds using Admin client below
        if (clientObj) {
            await clientObj.auth.setSession({ access_token: token, refresh_token: token });
        }
        return { token, user_id };
    }

    try {
        const admin = await signupAndGetToken(`admin_${Date.now()}@test.com`, 'admin', clientAdmin);
        const cust = await signupAndGetToken(`cust_${Date.now()}@test.com`, 'customer', clientCust);
        const driver = await signupAndGetToken(`driver_${Date.now()}@test.com`, 'driver', clientDriver);

        // Add funds to customer
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_wallet_transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
            body: JSON.stringify({ p_user_id: cust.user_id, p_amount: 10000, p_tx_type: 'credit', p_description: 'Test Funding' })
        });

        // Get product to buy
        let res = await fetch(`${SUPABASE_URL}/rest/v1/products?limit=1`, { headers: { apikey: SUPABASE_ANON_KEY }});
        const product = (await res.json())[0];
        const productPrice = product.discount_price || product.price;

        // ==== 1. Delivery Fee Manipulation ====
        // Try calling the old signature which had p_delivery_fee
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${cust.token}` },
            body: JSON.stringify({
                p_user_id: cust.user_id, p_address: 'Fake', p_delivery_speed: 'eco', p_payment_method: 'wallet',
                p_items: [{ productId: product.id, quantity: 1 }],
                p_coupon_code: null, p_discount_val: 100, p_delivery_fee: -9999, p_lat: 0, p_lng: 0
            })
        });
        
        if (res.ok) {
            console.log("FAIL: Old overloaded RPC with p_delivery_fee parameter was still executed!");
        } else {
            console.log("PASS: Old unsafe RPC overload is unavailable.");
        }

        // Test with the new signature - placing an order below threshold
        // Admin sets fee to 5 and threshold to 1000
        await fetch(`${SUPABASE_URL}/rest/v1/platform_settings?id=eq.1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
            body: JSON.stringify({ base_delivery_fee: 5, free_delivery_threshold: 1000 })
        });

        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${cust.token}` },
            body: JSON.stringify({
                p_user_id: cust.user_id, p_address: 'Fake', p_delivery_speed: 'eco', p_payment_method: 'wallet',
                p_items: [{ productId: product.id, quantity: 1 }],
                p_coupon_code: null, p_lat: 0, p_lng: 0
            })
        });
        const respText = await res.text();
        let orderId1;
        try { orderId1 = JSON.parse(respText); } catch(e) { console.error("Error parsing process_checkout response:", respText); return; }
        if (orderId1.code || orderId1.error) { console.error("process_checkout returned error:", orderId1); return; }
        
        let orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId1}`, { headers: { apikey: SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` } });
        let orderData = (await orderRes.json())[0];
        
        if (orderData.delivery_fee === 5) {
            console.log("PASS: Order below threshold calculated authoritative delivery fee.");
        } else {
            console.log("FAIL: Order below threshold failed to apply authoritative fee. Fee was:", orderData.delivery_fee);
        }

        // Subtotal integrity - we bought 1 item. The price should not have been manipulated.
        if (orderData.total_amount === productPrice + 5) {
            console.log("PASS: Subtotal integrity maintained. Total is price + fee.");
        } else {
            console.log("FAIL: Subtotal integrity broken. Total:", orderData.total_amount, "Expected:", productPrice + 5);
        }

        // ==== 2. Threshold Boundary Tests ====
        // Set threshold slightly below 1 item's price
        await fetch(`${SUPABASE_URL}/rest/v1/platform_settings?id=eq.1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` },
            body: JSON.stringify({ base_delivery_fee: 5, free_delivery_threshold: productPrice - 0.01 })
        });

        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/process_checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${cust.token}` },
            body: JSON.stringify({
                p_user_id: cust.user_id, p_address: 'Fake', p_delivery_speed: 'eco', p_payment_method: 'wallet',
                p_items: [{ productId: product.id, quantity: 1 }],
                p_coupon_code: null, p_lat: 0, p_lng: 0
            })
        });
        const orderId2 = await res.json();
        
        orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId2}`, { headers: { apikey: SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}` } });
        orderData = (await orderRes.json())[0];
        
        if (orderData.delivery_fee === 0) {
            console.log("PASS: Order above threshold received 0 fee.");
        } else {
            console.log("FAIL: Order above threshold received non-zero fee.");
        }

        // ==== 3. Settings Authorization ====
        res = await fetch(`${SUPABASE_URL}/rest/v1/platform_settings?id=eq.1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${cust.token}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ base_delivery_fee: 10 })
        });
        const custRes = await res.json();
        if (custRes.length === 0 || !res.ok) console.log("PASS: Customer update to platform_settings DENIED.");
        else console.log("FAIL: Customer could update platform_settings.");
        
        res = await fetch(`${SUPABASE_URL}/rest/v1/platform_settings?id=eq.1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${driver.token}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ base_delivery_fee: 10 })
        });
        const drvRes = await res.json();
        if (drvRes.length === 0 || !res.ok) console.log("PASS: Driver update to platform_settings DENIED.");
        else console.log("FAIL: Driver could update platform_settings.");

        res = await fetch(`${SUPABASE_URL}/rest/v1/platform_settings?id=eq.1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${admin.token}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ base_delivery_fee: 2.99, free_delivery_threshold: 15.00 }) // restore
        });
        const adminRes = await res.json();
        if (res.ok && adminRes.length > 0) console.log("PASS: Admin update to platform_settings PASS.");
        else console.log("FAIL: Admin could not update platform_settings.");

        console.log("ALL REST/RPC CHECKS COMPLETE");

    } catch (e) {
        console.error(e);
    }
}
run();
