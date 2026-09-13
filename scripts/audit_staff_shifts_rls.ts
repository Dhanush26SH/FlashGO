import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function run() {
  console.log('--- ADMIN / SERVICE-ROLE QUERY ---');
  const { data, error } = await supabaseAdmin
    .from('staff_shifts')
    .select('*')
    .eq('staff_id', '718a6efa-7364-44bd-b0c9-2106e44585c3')
    .eq('status', 'scheduled')
    .gt('shift_end', new Date().toISOString())
    .order('shift_start', { ascending: true });

  if (error) {
    console.error('Admin Query Error:', error);
  } else {
    console.log(`Admin Query Data (Count: ${data.length}):`, data);
  }
}

run().catch(console.error);
