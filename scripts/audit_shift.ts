import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log('Logging in as admin...');
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  if (authError) {
    console.error('Auth Error:', authError);
    return;
  }

  const nowIso = new Date().toISOString();
  console.log('Admin Authenticated. Running query with nowIso:', nowIso);

  const { data: shifts, error } = await supabase
    .from('staff_shifts')
    .select(`*`)
    .eq('staff_id', '718a6efa-7364-44bd-b0c9-2106e44585c3')
    .eq('status', 'scheduled')
    .gt('shift_end', nowIso)
    .order('shift_start', { ascending: true });

  if (error) {
    console.error('Query Error:', error);
  } else {
    console.log(`Admin Query Result (Count: ${shifts?.length || 0}):`, shifts);
  }
}

run().catch(console.error);
