const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseAnonKey || !supabaseServiceKey) {
  console.error("Missing keys");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function createTestUser(email, password) {
  const { data: existingUser } = await adminClient.auth.admin.getUserById(email); // Not supported by email, let's just try to create
  try {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (error && error.message.includes('already exists')) {
        // try to find the user
        const {data: users} = await adminClient.auth.admin.listUsers();
        return users.users.find(u => u.email === email);
      }
      return data.user;
  } catch (e) {
      console.error(e);
  }
}

async function runTests() {
  console.log('--- STARTING RLS TESTS for Notifications ---');
  
  const userA = await createTestUser('customerA@test.com', 'password123');
  const userB = await createTestUser('customerB@test.com', 'password123');
  
  const clientA = createClient(supabaseUrl, supabaseAnonKey);
  await clientA.auth.signInWithPassword({ email: 'customerA@test.com', password: 'password123' });
  
  const clientB = createClient(supabaseUrl, supabaseAnonKey);
  await clientB.auth.signInWithPassword({ email: 'customerB@test.com', password: 'password123' });

  // 0. Seed a notification for A and B as admin
  const { data: notifA, error: errA } = await adminClient.from('notifications').insert({
    recipient_id: userA.id,
    type: 'SYSTEM',
    title: 'Hello A',
    message: 'Test A'
  }).select().single();
  
  const { data: notifB } = await adminClient.from('notifications').insert({
    recipient_id: userB.id,
    type: 'SYSTEM',
    title: 'Hello B',
    message: 'Test B'
  }).select().single();

  console.log(`Seeded notif for A: ${notifA.id}`);
  console.log(`Seeded notif for B: ${notifB.id}`);

  // 1. Customer A reads own notification -> PASS
  let { data: readA, error: errReadA } = await clientA.from('notifications').select('*').eq('id', notifA.id);
  console.log(`Customer A reads own notification -> ${readA && readA.length === 1 ? 'PASS' : 'FAIL'} (Found: ${readA?.length})`);

  // 2. Customer B cannot read Customer A notification -> BLOCKED
  let { data: readB_A, error: errReadB_A } = await clientB.from('notifications').select('*').eq('id', notifA.id);
  console.log(`Customer B cannot read Customer A notification -> ${readB_A && readB_A.length === 0 ? 'PASS (BLOCKED)' : 'FAIL'} (Found: ${readB_A?.length})`);

  // 3. Arbitrary Customer INSERT -> BLOCKED
  let { error: errInsertA } = await clientA.from('notifications').insert({
    recipient_id: userA.id, type: 'SYSTEM', title: 'Hacked', message: 'Hacked'
  });
  console.log(`Arbitrary Customer INSERT -> ${errInsertA ? 'PASS (BLOCKED)' : 'FAIL'} (${errInsertA?.message})`);

  // 4. Arbitrary UPDATE -> BLOCKED
  let { error: errUpdateA } = await clientA.from('notifications').update({ is_read: true }).eq('id', notifA.id);
  console.log(`Arbitrary Customer UPDATE -> ${errUpdateA ? 'PASS (BLOCKED)' : 'FAIL'} (${errUpdateA?.message})`);

  // 5. Arbitrary DELETE -> BLOCKED
  let { error: errDeleteA } = await clientA.from('notifications').delete().eq('id', notifA.id);
  console.log(`Arbitrary Customer DELETE -> ${errDeleteA ? 'PASS (BLOCKED)' : 'FAIL'} (${errDeleteA?.message})`);

  // 6. Mark own read through RPC -> PASS
  let { error: errRpcReadA } = await clientA.rpc('mark_notification_read', { p_notification_id: notifA.id });
  let { data: afterReadA } = await adminClient.from('notifications').select('is_read').eq('id', notifA.id).single();
  console.log(`Mark own read through RPC -> ${!errRpcReadA && afterReadA.is_read ? 'PASS' : 'FAIL'} (is_read: ${afterReadA?.is_read})`);

  // 7. Mark another user's read through RPC -> BLOCKED
  let { error: errRpcReadB_A } = await clientB.rpc('mark_notification_read', { p_notification_id: notifB.id });
  // Wait, let's try to mark A's notification using B's client
  let { error: errRpcHack } = await clientB.rpc('mark_notification_read', { p_notification_id: notifA.id });
  
  // check if A's notif is read (well it's already read, let's create a new one for A)
  const { data: notifA2 } = await adminClient.from('notifications').insert({
    recipient_id: userA.id, type: 'SYSTEM', title: 'Hello A 2', message: 'Test A 2'
  }).select().single();
  
  let { error: errRpcHack2 } = await clientB.rpc('mark_notification_read', { p_notification_id: notifA2.id });
  let { data: afterHack2 } = await adminClient.from('notifications').select('is_read').eq('id', notifA2.id).single();
  console.log(`Mark another user's read -> ${!afterHack2.is_read ? 'PASS (BLOCKED)' : 'FAIL (NOT BLOCKED)'} (is_read: ${afterHack2?.is_read})`);
  if (errRpcHack2) {
    console.log(`  RPC error message: ${errRpcHack2.message}`);
  }

  process.exit(0);
}

runTests().catch(console.error);
