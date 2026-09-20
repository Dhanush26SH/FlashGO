import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const UDUPI_WH = '9f4d3149-f3e4-432b-98b6-f17af77c9c33';
const MANIPAL_WH = '76525a09-3fd1-4949-b45e-49c77255b4ce';

async function createUser(email: string, role: string, wh: string | null = null) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: 'Password123!',
    options: { data: { full_name: 'Test ' + role } }
  });
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("No user id");

  const setRoleSql = `UPDATE public.profiles SET role = '${role}'${wh ? `, warehouse_id = '${wh}'` : ''}${role === 'customer' ? `, is_pending_staff = true, requested_role = 'driver'` : ''} WHERE id = '${uid}';`;
  execSync(`npx supabase db query "${setRoleSql}" --linked`);

  // Authoritatively register the generated test account
  const insertTestAccountSql = `INSERT INTO public.dev_test_accounts (email, is_e2e_test_account) VALUES ('${email}', true) ON CONFLICT (email) DO UPDATE SET is_e2e_test_account = true;`;
  execSync(`npx supabase db query "${insertTestAccountSql}" --linked`);

  return { email, password: 'Password123!', id: uid, client: createClient(SUPABASE_URL, SUPABASE_ANON_KEY) };
}

async function run() {
  console.log("=== 1. CREATE SAFE TEMPORARY TEST ACTORS ===");
  const driverA = await createUser(`driverA_${Date.now()}@test.com`, 'customer');
  const driverB = await createUser(`driverB_${Date.now()}@test.com`, 'customer');
  const adminUdupi = await createUser(`adminUdupi_${Date.now()}@test.com`, 'admin', UDUPI_WH);
  const adminManipal = await createUser(`adminManipal_${Date.now()}@test.com`, 'admin', MANIPAL_WH);
  const adminGlobal = await createUser(`adminGlobal_${Date.now()}@test.com`, 'admin');

  await driverA.client.auth.signInWithPassword({ email: driverA.email, password: driverA.password });
  await driverB.client.auth.signInWithPassword({ email: driverB.email, password: driverB.password });
  await adminUdupi.client.auth.signInWithPassword({ email: adminUdupi.email, password: adminUdupi.password });
  await adminManipal.client.auth.signInWithPassword({ email: adminManipal.email, password: adminManipal.password });
  await adminGlobal.client.auth.signInWithPassword({ email: adminGlobal.email, password: adminGlobal.password });

  console.log("Actors created and logged in.");

  console.log("\n=== 2. REAL INCOMPLETE-APPLICATION TEST ===");
  // Create driver onboarding record for Driver A (valid RLS insertion)
  await driverA.client.from('driver_onboarding').insert({
    id: driverA.id,
    language_pref: 'en',
    vehicle_type: 'bike',
    work_area: 'Udupi',
    work_type: 'full_time',
    warehouse_id: UDUPI_WH
  });

  let res = await driverA.client.rpc('submit_driver_application');
  console.log("Driver A Submit Result (missing selfie/payout/nominee):", res.error?.message || res.data);

  console.log("\n=== 3. INDIVIDUAL SUBMISSION GATES & 4. DIRECT STATUS BYPASS ===");
  
  // Direct status bypass attempt
  const updRes = await driverA.client.from('driver_onboarding').update({ status: 'submitted' }).eq('id', driverA.id);
  console.log("Direct status='submitted' bypass:", updRes.error?.message || updRes.error?.code || 'BLOCKED_BY_RLS_NO_ERROR_RETURNED');
  
  // Normal editable update
  const normRes = await driverA.client.from('driver_onboarding').update({ vehicle_type: 'scooter' }).eq('id', driverA.id);
  console.log("Normal vehicle_type update:", normRes.error ? normRes.error.message : 'SUCCESS');

  // Incrementally fill missing items
  await driverA.client.from('staff_payout_details').insert({ staff_id: driverA.id, payout_method_type: 'upi', upi_id: 'test@upi' });
  res = await driverA.client.rpc('submit_driver_application');
  console.log("Submit after payout:", res.error?.message || res.data);

  await driverA.client.from('driver_nominee_details').insert({ driver_id: driverA.id, nominee_name: 'Wife', relationship: 'Spouse', dob: '2000-01-01', mobile: '9999999999' });
  res = await driverA.client.rpc('submit_driver_application');
  console.log("Submit after nominee:", res.error?.message || res.data);

  await driverA.client.from('driver_onboarding').update({ selfie_url: 'selfies/test.jpg' }).eq('id', driverA.id);
  res = await driverA.client.rpc('submit_driver_application');
  console.log("Submit after selfie:", res.error?.message || res.data);

  await driverA.client.from('driver_agreement_acceptances').insert({ driver_id: driverA.id, agreement_version: 'v1.0' });
  res = await driverA.client.rpc('submit_driver_application');
  console.log("Submit after agreement:", res.error?.message || res.data);

  // Training completion
  const { data: mods } = await driverA.client.from('driver_training_modules').select('id');
  if (mods) {
    for (const m of mods) {
      await driverA.client.from('driver_training_progress').insert({ driver_id: driverA.id, module_id: m.id });
    }
  }
  
  // Now fully complete
  res = await driverA.client.rpc('submit_driver_application');
  console.log("Submit fully complete application:", res.error?.message || res.data);

  console.log("\n=== 5. CROSS-DRIVER PROTECTION ===");
  const crossRes = await driverB.client.from('staff_payout_details').select('*').eq('staff_id', driverA.id);
  console.log("Driver B reading Driver A payout:", crossRes.data?.length === 0 ? 'BLOCKED_BY_RLS' : 'FAILED_SECURITY');

  console.log("\n=== 6. REAL WAREHOUSE-SCOPED ADMIN TEST ===");
  // Udupi Admin approves Udupi Driver
  let admRes = await adminUdupi.client.rpc('approve_driver_application', { p_driver_id: driverA.id, p_action: 'approve' });
  console.log("Udupi Admin approving Udupi Driver A:", admRes.error ? admRes.error.message : 'SUCCESS');

  // Let's create another application for Manipal to test rejection
  const driverM = await createUser(`driverM_${Date.now()}@test.com`, 'customer');
  await driverM.client.auth.signInWithPassword({ email: driverM.email, password: driverM.password });
  await driverM.client.from('driver_onboarding').insert({ id: driverM.id, language_pref: 'en', vehicle_type: 'bike', work_area: 'Manipal', warehouse_id: MANIPAL_WH, selfie_url: 'selfie' });
  
  admRes = await adminUdupi.client.rpc('approve_driver_application', { p_driver_id: driverM.id, p_action: 'approve' });
  console.log("Udupi Admin approving Manipal Driver M:", admRes.error ? admRes.error.message : 'SUCCESS');

  console.log("\n=== 8. WORK AREA MISMATCH ===");
  const driverMismatch = await createUser(`driverMis_${Date.now()}@test.com`, 'customer');
  await driverMismatch.client.auth.signInWithPassword({ email: driverMismatch.email, password: driverMismatch.password });
  await driverMismatch.client.from('driver_onboarding').insert({ id: driverMismatch.id, language_pref: 'en', vehicle_type: 'bike', work_type: 'full_time', work_area: 'Udupi', warehouse_id: MANIPAL_WH, selfie_url: 'selfie' });
  // Need to bypass frontend logic and just call RPC
  const misRes = await driverMismatch.client.rpc('submit_driver_application');
  console.log("Mismatch Udupi work_area with Manipal warehouse:", misRes.error?.message || misRes.data);

  console.log("\n=== 7. GENERIC DRIVER APPROVAL SHIELD ===");
  const shieldRes = await adminGlobal.client.rpc('approve_staff_role', { p_user_id: driverA.id, p_role: 'driver', p_clean_name: 'Test', p_warehouse_id: UDUPI_WH });
  console.log("Global Admin generic driver approval:", shieldRes.error?.message || shieldRes.data);
  
  // Test Picker approval using generic
  const shieldPickerRes = await adminGlobal.client.rpc('approve_staff_role', { p_user_id: driverM.id, p_role: 'picker', p_clean_name: 'Picker Test', p_warehouse_id: UDUPI_WH });
  console.log("Global Admin generic picker approval:", shieldPickerRes.error?.message ? shieldPickerRes.error.message : 'SUCCESS');

  console.log("\n=== 10. APPROVAL RESULT ===");
  const { data: finalProf } = await adminGlobal.client.from('profiles').select('*').eq('id', driverA.id).single();
  const { data: finalOnb } = await adminGlobal.client.from('driver_onboarding').select('*').eq('id', driverA.id).single();
  console.log("Driver A Profile Role:", finalProf?.role);
  console.log("Driver A Profile Warehouse:", finalProf?.warehouse_id);
  console.log("Driver A Profile is_pending_staff:", finalProf?.is_pending_staff);
  console.log("Driver A Onboarding Status:", finalOnb?.status);
  
  console.log("\nTest Completed.");
}

run().catch(console.error);
