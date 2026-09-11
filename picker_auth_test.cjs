const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const WAREHOUSE_ID = '9f4d3149-f3e4-432b-98b6-f17af77c9c33';
const PRODUCT_MILK = { id: '888f7899-2f74-4d18-a2b5-dfce6c354287', name: 'Amul Gold Full Cream Milk' };
const PRODUCT_KESAR = { id: 'dd69d4dd-2400-4bb2-a6ce-970fc8f9e6cd', name: 'Amul Kool Kesar' };

const ADMIN_EMAIL = 'flashgo-admin-test-v2@mailinator.com';
const ADMIN_PASS = 'password123';
const CUST_A_EMAIL = 'flashgo-cust-a-test@maildrop.cc';
const PICKER_A_EMAIL = 'flashgo-picker-a@maildrop.cc';
const PICKER_B_EMAIL = 'flashgo-picker-b@maildrop.cc';

let passed = 0;
let failed = 0;

function assert(condition, testName, details) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName} — ${details || 'FAILED'}`);
    failed++;
  }
}

async function loginWithOtp(email) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const mailbox = email.split('@')[0];
  const sendTime = Date.now();
  
  const { error: otpErr } = await supabase.auth.signInWithOtp({ email });
  if (otpErr) throw new Error(`OTP send failed for ${email}: ${otpErr.message}`);
  
  let otp = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(r => setTimeout(r, 4000));
    
    const inboxQuery = `query { inbox(mailbox: "${mailbox}") { id subject date } }`;
    const inboxRes = await fetch('https://api.maildrop.cc/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: inboxQuery }),
    });
    const inboxData = await inboxRes.json();
    
    if (!inboxData.data || !inboxData.data.inbox || !inboxData.data.inbox.length) continue;
    
    const sorted = inboxData.data.inbox.sort((a, b) => new Date(b.date) - new Date(a.date));
    const newest = sorted[0];
    
    if (new Date(newest.date).getTime() < sendTime - 45000) continue;
    
    const msgQuery = `query { message(mailbox: "${mailbox}", id: "${newest.id}") { html } }`;
    const msgRes = await fetch('https://api.maildrop.cc/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: msgQuery }),
    });
    const msgData = await msgRes.json();
    
    const otpMatch = msgData.data.message.html.match(/>(\d{6})</);
    if (otpMatch) { otp = otpMatch[1]; break; }
  }
  
  if (!otp) throw new Error(`Could not extract OTP for ${email} after 5 attempts`);
  
  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: 'email',
  });
  if (verifyErr) throw new Error(`OTP verify failed for ${email}: ${verifyErr.message}`);
  
  return { supabase, user: verifyData.user, session: verifyData.session };
}

async function main() {
  console.log('=== Final Strict Picker-Auth Verification ===\n');

  // 1. Admin logs in
  const adminSupa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await adminSupa.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  
  // 2. Setup Pickers A & B
  console.log('[1] Setting up Picker Accounts A and B...');
  const pickerA = await loginWithOtp(PICKER_A_EMAIL);
  console.log(`  Picker A created/logged in: ${pickerA.user.id}`);
  
  // Wait to avoid OTP rate limit
  await new Promise(r => setTimeout(r, 20000));
  
  const pickerB = await loginWithOtp(PICKER_B_EMAIL);
  console.log(`  Picker B created/logged in: ${pickerB.user.id}`);
  
  // Set roles to picker and assign to warehouse
  await adminSupa.from('profiles').update({ role: 'picker', warehouse_id: WAREHOUSE_ID }).in('id', [pickerA.user.id, pickerB.user.id]);
  
  // 3. Customer A logs in and creates order
  console.log('\n[2] Customer A placing order...');
  
  // Wait to avoid OTP rate limit for Customer A
  await new Promise(r => setTimeout(r, 20000));
  
  const custA = await loginWithOtp(CUST_A_EMAIL);
  const { data: addr } = await custA.supabase.from('customer_addresses').select('*').eq('customer_id', custA.user.id).limit(1).single();
  
  const idempotencyKey = `picker-test-${Date.now()}`;
  const { data: orderId, error: checkoutErr } = await custA.supabase.rpc('process_checkout', {
    p_user_id: custA.user.id,
    p_address: addr.address_line,
    p_delivery_speed: 'standard',
    p_payment_method: 'cod',
    p_items: [{ productid: PRODUCT_MILK.id, quantity: 1 }],
    p_coupon_code: null,
    p_discount_val: 0,
    p_delivery_fee: 30,
    p_lat: addr.lat,
    p_lng: addr.lng,
    p_idempotency_key: idempotencyKey,
  });
  if (checkoutErr) throw checkoutErr;
  console.log(`  Order created: ${orderId}`);
  
  // 4. Verify Auto-assignment
  const { data: order } = await adminSupa.from('orders').select('picker_id').eq('id', orderId).single();
  
  let assignedSupa, wrongSupa, assignedId, wrongId;
  if (order.picker_id === pickerA.user.id) {
    assignedSupa = pickerA.supabase; assignedId = pickerA.user.id;
    wrongSupa = pickerB.supabase; wrongId = pickerB.user.id;
    assert(true, 'Picker A automatically assigned');
  } else if (order.picker_id === pickerB.user.id) {
    assignedSupa = pickerB.supabase; assignedId = pickerB.user.id;
    wrongSupa = pickerA.supabase; wrongId = pickerA.user.id;
    assert(true, 'Picker B automatically assigned');
  } else {
    assert(false, 'Order not assigned to Picker A or B', `got ${order.picker_id}`);
    process.exit(1);
  }
  
  // 5. Test RPCs with Assigned and Wrong Pickers
  console.log('\n[3] Testing RPCs with Wrong Picker...');
  const { error: wrongStartErr } = await wrongSupa.rpc('start_picking', { p_order_id: orderId, p_picker_id: wrongId });
  assert(wrongStartErr != null, 'Wrong picker blocked from start_picking', wrongStartErr?.message);
  
  const { error: wrongPickErr } = await wrongSupa.rpc('pick_fefo_item', { p_warehouse_id: WAREHOUSE_ID, p_product_id: PRODUCT_MILK.id, p_quantity: 1, p_order_id: orderId, p_user_id: wrongId });
  assert(wrongPickErr != null, 'Wrong picker blocked from pick_fefo_item', wrongPickErr?.message);
  
  const { error: wrongUndoErr } = await wrongSupa.rpc('undo_fefo_pick', { p_order_id: orderId, p_product_id: PRODUCT_MILK.id, p_picker_id: wrongId });
  assert(wrongUndoErr != null, 'Wrong picker blocked from undo_fefo_pick', wrongUndoErr?.message);
  
  const { error: wrongPackErr } = await wrongSupa.rpc('pack_order', { p_order_id: orderId, p_picker_id: wrongId, p_bag_number: 'BAG-999' });
  assert(wrongPackErr != null, 'Wrong picker blocked from pack_order', wrongPackErr?.message);
  
  console.log('\n[4] Testing RPCs with Assigned Picker...');
  const { error: startErr } = await assignedSupa.rpc('start_picking', { p_order_id: orderId, p_picker_id: assignedId });
  assert(!startErr, 'Assigned picker succeeds at start_picking', startErr?.message);
  
  const { error: pickErr } = await assignedSupa.rpc('pick_fefo_item', { p_warehouse_id: WAREHOUSE_ID, p_product_id: PRODUCT_MILK.id, p_quantity: 1, p_order_id: orderId, p_user_id: assignedId });
  assert(!pickErr, 'Assigned picker succeeds at pick_fefo_item', pickErr?.message);
  
  const { error: undoErr } = await assignedSupa.rpc('undo_fefo_pick', { p_order_id: orderId, p_product_id: PRODUCT_MILK.id, p_picker_id: assignedId });
  assert(!undoErr, 'Assigned picker succeeds at undo_fefo_pick', undoErr?.message);
  
  const { error: repickErr } = await assignedSupa.rpc('pick_fefo_item', { p_warehouse_id: WAREHOUSE_ID, p_product_id: PRODUCT_MILK.id, p_quantity: 1, p_order_id: orderId, p_user_id: assignedId });
  assert(!repickErr, 'Assigned picker succeeds at re-pick', repickErr?.message);
  
  const { error: packErr } = await assignedSupa.rpc('pack_order', { p_order_id: orderId, p_picker_id: assignedId, p_bag_number: 'BAG-101' });
  assert(!packErr, 'Assigned picker succeeds at pack_order', packErr?.message);
  
  // 6. Scramble Admin Password
  console.log('\n[5] Rotating/Scrambling Admin Password...');
  const newScrambledPass = `scrambled-${Math.random().toString(36)}`;
  const { error: updateErr } = await adminSupa.auth.updateUser({ password: newScrambledPass });
  assert(!updateErr, 'Admin password rotated/scrambled successfully');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Final Verification Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(50)}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('UNHANDLED ERROR:', err);
  process.exit(1);
});
