import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

async function testFrontendQuery() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Auth as a real non-admin (driver)
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'drivera_1789042171906@test.com', // One of the test drivers that definitely exists
    password: 'Password123!' // E2E script standard password
  });

  if (authErr) {
    console.error("Auth failed:", authErr);
    return;
  }

  const { data: testAccounts, error } = await supabase.from('dev_test_accounts').select('email');
  console.log("dev_test_accounts data (non-admin):", testAccounts);
  console.log("dev_test_accounts error (non-admin):", error);
}

testFrontendQuery().catch(console.error);
