const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const adminEmail = 'admin@flashgo.com'; // assuming this exists
const customerEmail = 'customer' + Date.now() + '@example.com';
const password = 'password123';

async function runTests() {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // 1. Setup Admin Client
  console.log('Testing Admin Login...');
  const { data: adminAuth, error: adminErr } = await supabaseAdmin.auth.signInWithPassword({
    email: 'admin@flashgo.com', // Assume valid admin exists, or we use a known one. We can just test the RPCs if we know the JWT, or we can use service role. Wait, no service role provided.
    password: 'password123'
  });
  
  if (adminErr) {
    console.log('Cannot login as admin@flashgo.com, tests might fail if admin is required. Error:', adminErr.message);
  }

  const adminClient = supabaseAdmin; // authenticated admin

  // Create test customer
  console.log('\n--- 1. Onboarding & Approval ---');
  const supabaseCust = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: custAuth, error: signUpErr } = await supabaseCust.auth.signUp({
    email: customerEmail,
    password: password
  });

  if (signUpErr) {
    console.error('Customer signup failed:', signUpErr.message);
    return;
  }
  
  const customerId = custAuth.user.id;
  console.log(`Created customer: ${customerId}`);
  
  // Wait for profile trigger
  await new Promise(r => setTimeout(r, 2000));

  // Request staff access
  const { error: requestErr } = await supabaseCust.rpc('request_staff_access', { p_role: 'picker' });
  console.log('Customer requested staff access:', requestErr ? 'FAIL ' + requestErr.message : 'PASS');

  // Customer tries to approve themselves (Approval Security)
  const { error: custApproveErr } = await supabaseCust.rpc('approve_staff_role', {
    p_user_id: customerId,
    p_role: 'picker',
    p_clean_name: 'Test Picker',
    p_warehouse_id: null
  });
  console.log('Customer self-approve blocked:', custApproveErr ? 'PASS (' + custApproveErr.message + ')' : 'FAIL');

  // Admin approves
  const { error: adminApproveErr } = await adminClient.rpc('approve_staff_role', {
    p_user_id: customerId,
    p_role: 'picker',
    p_clean_name: 'Test Picker',
    p_warehouse_id: null
  });
  console.log('Admin approves request:', adminApproveErr ? 'FAIL ' + adminApproveErr.message : 'PASS');

  // Check generated employee ID
  const { data: profile } = await adminClient.from('profiles').select('employee_id, role').eq('id', customerId).single();
  console.log('Generated Employee ID:', profile.employee_id, profile.employee_id?.startsWith('EMP-') ? '(PASS)' : '(FAIL)');

  // Repeat approval (Idempotency)
  await adminClient.rpc('approve_staff_role', { p_user_id: customerId, p_role: 'picker', p_clean_name: 'Test Picker', p_warehouse_id: null });
  const { data: profile2 } = await adminClient.from('profiles').select('employee_id').eq('id', customerId).single();
  console.log('Idempotent approval (ID preserved):', profile2.employee_id === profile.employee_id ? 'PASS' : 'FAIL');

  console.log('\n--- 2. Role & Warehouse Reassignment ---');
  // Reassign to Warehouse Staff
  const { error: roleChangeErr } = await adminClient.rpc('admin_update_staff_role', { p_target_id: customerId, p_role: 'warehouse_staff' });
  console.log('Admin change role to warehouse_staff:', roleChangeErr ? 'FAIL ' + roleChangeErr.message : 'PASS');

  // Attempt escalation to admin
  const { error: escalateErr } = await adminClient.rpc('admin_update_staff_role', { p_target_id: customerId, p_role: 'admin' });
  console.log('Admin escalate to admin blocked:', escalateErr ? 'PASS (' + escalateErr.message + ')' : 'FAIL');

  console.log('\n--- 3. Suspension ---');
  const { error: suspendErr } = await adminClient.rpc('suspend_profile', { p_user_id: customerId });
  console.log('Suspend user:', suspendErr ? 'FAIL ' + suspendErr.message : 'PASS');

  // Attempt adjust_batch_stock (using customer client, now warehouse_staff but suspended)
  // Need a batch_id, we will just use a fake UUID since it should fail on suspension first
  const fakeUuid = '00000000-0000-0000-0000-000000000000';
  const { error: adjustErr } = await supabaseCust.rpc('adjust_batch_stock', { p_batch_id: fakeUuid, p_quantity_change: -1, p_reason: 'damaged', p_user_id: customerId });
  console.log('Suspended Warehouse Staff blocked:', adjustErr?.message.includes('suspended') ? 'PASS' : 'FAIL ' + adjustErr?.message);

  // Unsuspend
  const { error: unsuspendErr } = await adminClient.rpc('unsuspend_profile', { p_user_id: customerId });
  console.log('Unsuspend user:', unsuspendErr ? 'FAIL ' + unsuspendErr.message : 'PASS');

  console.log('\n--- 4. Direct Table Mutation Security ---');
  const { error: directProfileErr } = await supabaseCust.from('profiles').update({ role: 'admin' }).eq('id', customerId);
  console.log('Direct role escalation blocked:', directProfileErr ? 'PASS (' + directProfileErr.message + ')' : 'FAIL');

  console.log('\n--- 5. Shift Management ---');
  const shiftStart = new Date().toISOString();
  const shiftEnd = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
  
  const { error: shiftCreateErr } = await adminClient.rpc('admin_create_staff_shift', {
    p_staff_id: customerId,
    p_warehouse_id: null,
    p_shift_start: shiftStart,
    p_shift_end: shiftEnd
  });
  console.log('Admin create shift:', shiftCreateErr ? 'FAIL ' + shiftCreateErr.message : 'PASS');

  const { data: shifts } = await adminClient.from('staff_shifts').select('id').eq('staff_id', customerId);
  if (shifts && shifts.length > 0) {
    const shiftId = shifts[0].id;
    const { error: shiftStatusErr } = await adminClient.rpc('admin_update_shift_status', { p_shift_id: shiftId, p_status: 'present' });
    console.log('Admin update shift status:', shiftStatusErr ? 'FAIL ' + shiftStatusErr.message : 'PASS');
    
    const { error: invalidStatusErr } = await adminClient.rpc('admin_update_shift_status', { p_shift_id: shiftId, p_status: 'invalid_status' });
    console.log('Invalid shift status blocked:', invalidStatusErr ? 'PASS' : 'FAIL');

    const { error: directShiftUpdate } = await supabaseCust.from('staff_shifts').update({ status: 'present' }).eq('id', shiftId);
    console.log('Direct shift update by staff blocked:', directShiftUpdate ? 'PASS (' + directShiftUpdate.message + ')' : 'FAIL');
  } else {
    console.log('Shift not found to test status updates');
  }

  // Cleanup
  console.log('Done.');
}

runTests().catch(console.error);
