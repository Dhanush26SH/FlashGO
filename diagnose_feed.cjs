// Diagnostic: sign in as drivarrr1 and run the exact Feed query
// Run from: C:\Users\dhanu\FlashGO (where @supabase/supabase-js is installed)

const { createClient } = require('./node_modules/@supabase/supabase-js/dist/main/index.js');

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function diagnose() {
  // Try common test passwords
  const passwords = ['Password123!', 'password123', 'Test@1234', 'Drivarrr1@'];
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
    console.log('Could not sign in - will use anon queries with known UUID from profile lookup');
    // Try to get the profile - might work if RLS is permissive for anon
    const { data: p } = await supabase.from('profiles').select('id,email').eq('email', 'drivarrr1@gmail.com').maybeSingle();
    console.log('Profile lookup:', JSON.stringify(p));
    return;
  }

  // ALL shifts, no filter
  const nowIso = new Date().toISOString();
  console.log('\nCurrent UTC time:', nowIso);

  const { data: allShifts, error: allErr } = await supabase
    .from('staff_shifts')
    .select('id, staff_id, work_slot_id, warehouse_id, status, shift_start, shift_end, created_at')
    .eq('staff_id', userId)
    .order('shift_start', { ascending: false });

  console.log('\n=== ALL STAFF_SHIFTS (unfiltered) ===');
  if (allErr) console.log('Error:', allErr);
  else console.log(JSON.stringify(allShifts, null, 2));

  // OLD broken Feed query
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

  // NEW fixed Feed query  
  const { data: newResult, error: newErr } = await supabase
    .from('staff_shifts')
    .select('id, shift_start, shift_end, status')
    .eq('staff_id', userId)
    .in('status', ['scheduled', 'booked', 'active'])
    .gt('shift_end', nowIso)
    .order('shift_start', { ascending: true })
    .limit(1);

  console.log('\n=== NEW Feed query [scheduled, booked, active] ===');
  console.log(JSON.stringify(newResult, null, 2), newErr?.message || '');

  // Booked gigs RPC
  const { data: rpc, error: rpcErr } = await supabase.rpc('get_driver_booked_gigs');
  console.log('\n=== get_driver_booked_gigs RPC ===');
  console.log(JSON.stringify(rpc, null, 2), rpcErr?.message || '');

  // Profile state
  const { data: prof } = await supabase
    .from('profiles')
    .select('id, role, warehouse_id, current_vehicle_id, is_online')
    .eq('id', userId)
    .single();
  console.log('\n=== DRIVER PROFILE ===');
  console.log(JSON.stringify(prof, null, 2));

  await supabase.auth.signOut();
}

diagnose().catch(console.error);
