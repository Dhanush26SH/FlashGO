const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase env vars.");
  process.exit(1);
}

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
  console.log("--- Dashboard RPC Verification ---");

  // Attempt to call RPC anonymously
  console.log("1. Testing unauthorized anonymous access...");
  const { data: anonData, error: anonErr } = await anonClient.rpc('get_admin_dashboard_stats');
  if (anonErr) {
    console.log("  Success: Unauthorized access blocked. Error:", anonErr.message);
  } else {
    console.log("  Failed: Anonymous access was allowed!", anonData);
  }

  // Attempt to login as customer and call
  console.log("2. Testing unauthorized customer access...");
  const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password123'
  });
  if (authErr) {
    console.log("  Could not login customer, assuming blocked.", authErr.message);
  } else {
    const { data: custData, error: custErr } = await anonClient.rpc('get_admin_dashboard_stats');
    if (custErr) {
      console.log("  Success: Customer access blocked. Error:", custErr.message);
    } else {
      console.log("  Failed: Customer access was allowed!", custData);
    }
  }
}

runTests().catch(console.error);
