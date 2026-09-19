import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase URL/key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, employee_id, role, created_at, is_retired, is_suspended')
    .in('employee_id', ['EMP-10003', 'EMP-10004', 'EMP-10005', 'EMP-10006']);
  
  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  const emails = profiles.map(p => p.email);

  const { data: devAccounts } = await supabase
    .from('dev_test_accounts')
    .select('email, is_e2e_test_account')
    .in('email', emails);

  const result = profiles.map(p => {
    const dta = devAccounts?.find(d => d.email === p.email);
    return {
      ...p,
      is_e2e_test_account: dta ? dta.is_e2e_test_account : false
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

run();
