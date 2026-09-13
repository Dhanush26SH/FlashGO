import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE!);

async function run() {
  console.log('Fetching Bob email...');
  const { data: user, error: userError } = await supabaseAdmin.auth.admin.getUserById('718a6efa-7364-44bd-b0c9-2106e44585c3');
  
  if (userError) {
    console.error('Failed to get user:', userError);
    return;
  }
  
  const email = user.user.email;
  console.log('Bob email is:', email);

  console.log('Logging in as Bob...');
  const supabaseAuth = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY!);
  
  const { data: auth, error: authError } = await supabaseAuth.auth.signInWithPassword({
    email: email!,
    password: 'Password123!'
  });

  if (authError) {
    console.error('Failed to login as Bob:', authError);
    return;
  }

  const nowIso = new Date().toISOString();
  console.log('Bob Authenticated. Running query with nowIso:', nowIso);

  const { data: shifts, error } = await supabaseAuth
    .from('staff_shifts')
    .select(`*`)
    .eq('staff_id', '718a6efa-7364-44bd-b0c9-2106e44585c3')
    .eq('status', 'scheduled')
    .gt('shift_end', nowIso)
    .order('shift_start', { ascending: true });

  if (error) {
    console.error('Bob Query Error:', error);
  } else {
    console.log(`Bob Query Result (Count: ${shifts?.length || 0}):`, shifts);
  }
}

run().catch(console.error);
