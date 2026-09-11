import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAuth() {
  console.log("Creating test users via admin rpc (or we can just test the ones we have).");
  
  // Try to create a brand new user using auth.signUp or we can use admin to create them.
  // We don't have service_role key here. Let's just create a new signup.
  const email = `testdriver_${Date.now()}@flashgo.in`;
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password: 'Password123!',
    options: { data: { full_name: 'Test Driver' } }
  });
  
  if (authErr) {
    console.error("Signup failed:", authErr);
    return;
  }
  
  const uid = authData.user?.id;
  console.log("Created user:", uid);

  // 1. Direct status update rejection
  console.log("\n--- Testing Direct Status Update Rejection ---");
  const { error: updErr } = await supabase.from('driver_onboarding').update({ status: 'submitted' }).eq('id', uid);
  console.log("Direct update error (expected strict RLS violation):", updErr?.message || updErr?.code);

  // 2. Incomplete Driver submission rejection
  console.log("\n--- Testing Incomplete Driver Submission ---");
  const { data: submitData, error: submitErr } = await supabase.rpc('submit_driver_application');
  console.log("Submit result (expected failure):", submitErr?.message || submitData);
  
  // More testing would require creating warehouses, admin users, etc.
  // We can write a quick SQL script to run these using `supabase db query` as well since it runs with elevated permissions and we can wrap it in explicit set_config auth.uid.
}

testAuth();
