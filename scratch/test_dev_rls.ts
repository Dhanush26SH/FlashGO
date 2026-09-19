import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

async function testFrontendQuery() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Auth as Admin
  await supabase.auth.signInWithPassword({
    email: 'dhanushshriyan91+admin@gmail.com',
    password: 'Password123!'
  });

  const { data: testAccounts, error } = await supabase.from('dev_test_accounts').select('email').eq('is_e2e_test_account', true);
  console.log("dev_test_accounts data:", testAccounts);
  console.log("dev_test_accounts error:", error);
}

testFrontendQuery().catch(console.error);
