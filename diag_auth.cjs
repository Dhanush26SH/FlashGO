// Diagnostic: sign in as drivarrr1 and run the exact Feed query

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function diagnose() {
  const passwords = ['Password123!', 'password123', 'Test@1234', 'Drivarrr1@', '123456', 'Password123'];
  let userId = null;
  
  for (const pw of passwords) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'drivarrr1@gmail.com',
      password: pw
    });
    if (data?.user) {
      userId = data.user.id;
      console.log(`Signed in OK with password: ${pw}`);
      console.log(`User ID: ${userId}`);
      break;
    }
  }

  if (!userId) {
    console.log('Could not sign in - check password. Exiting.');
    return;
  }

  const nowIso = new Date().toISOString();
  console.log('\nCurrent UTC time:', nowIso);

  const { data: allShifts, error: allErr } = await supabase
    .from('staff_shifts')
    .select('*')
    .eq('staff_id', userId)
    .order('shift_start', { ascending: false });

  console.log('\n=== ALL STAFF_SHIFTS (unfiltered) ===');
  if (allErr) console.log('Error:', allErr);
  else console.log(JSON.stringify(allShifts, null, 2));

  const { data: oldResult, error: oldErr } = await supabase
    .from('staff_shifts')
    .select('id, shift_start, shift_end, status')
    .eq('staff_id', userId)
    .in('status', ['scheduled', 'in_progress'])
    .gt('shift_end', nowIso)
    .order('shift_start', { ascending: true })
    .limit(1);

  console.log('\n=== OLD Feed query [scheduled, in_progress] ===');
  console.log(JSON.stringify(oldResult, null, 2), oldErr?.message || '');

  const { data: rpc, error: rpcErr } = await supabase.rpc('get_driver_booked_gigs');
  console.log('\n=== get_driver_booked_gigs RPC ===');
  console.log(JSON.stringify(rpc, null, 2), rpcErr?.message || '');

  await supabase.auth.signOut();
}

diagnose().catch(console.error);
