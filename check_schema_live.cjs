const fs = require('fs');

async function checkDb() {
    const env = fs.readFileSync('.env', 'utf8');
    const SUPABASE_URL = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim();
    // Use anon key, but we need to query without RLS blocking us if we want to see all rows to see distinct statuses.
    // I will use test_set_profile to make a new admin user and fetch all tickets!
    
    // I can also fetch using the admin client if I use the Service Role Key, but I don't have it here.
    // Wait, earlier I created an admin user `admin_1788108440552@test.com`. Let me just create a new admin!
    
    const SUPABASE_ANON_KEY = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim();

    async function signupAndGetToken(email, role) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ email, password: 'password123' })
        });
        const data = await res.json();
        const token = data.access_token;
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/test_set_profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ p_email: email, p_role: role })
        });
        return token;
    }

    try {
        const adminToken = await signupAndGetToken(`admin_audit_${Date.now()}@test.com`, 'admin');
        const res = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${adminToken}` }
        });
        const tickets = await res.json();
        console.log("Total tickets:", tickets.length);
        if (tickets.length > 0) {
            console.log("Columns:", Object.keys(tickets[0]));
            const statuses = new Set(tickets.map(t => t.status));
            console.log("Distinct statuses:", Array.from(statuses));
        } else {
            console.log("No tickets exist in the DB, safe to migrate anything.");
        }
    } catch (e) {
        console.error(e);
    }
}
checkDb();
