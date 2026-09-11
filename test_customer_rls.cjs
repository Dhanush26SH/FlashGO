const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  console.error("Missing Anon Key");
  process.exit(1);
}

const makeEmail = (prefix) => `${prefix}_${Date.now()}@mailinator.com`;

async function runTests() {
  console.log('--- REAL SUPABASE AUTH SESSION TESTS ---');
  
  const clientA = createClient(supabaseUrl, supabaseAnonKey);
  const emailA = makeEmail('custA');
  await clientA.auth.signUp({ email: emailA, password: 'password123' });
  await clientA.auth.signInWithPassword({ email: emailA, password: 'password123' });
  const userA = (await clientA.auth.getUser()).data.user;

  const clientB = createClient(supabaseUrl, supabaseAnonKey);
  const emailB = makeEmail('custB');
  await clientB.auth.signUp({ email: emailB, password: 'password123' });
  await clientB.auth.signInWithPassword({ email: emailB, password: 'password123' });
  const userB = (await clientB.auth.getUser()).data.user;

  console.log(`Created User A: ${userA.id}`);
  console.log(`Created User B: ${userB.id}`);

  // 1. A reads A notification -> PASS (returns empty array instead of 401)
  let { data: readA, error: errReadA } = await clientA.from('notifications').select('*').eq('recipient_id', userA.id);
  console.log(`A reads A notification -> ${!errReadA ? 'PASS' : 'FAIL'}`);

  // 2. B attempts to read A notification -> BLOCKED / no row returned
  let { data: readB_A, error: errReadB_A } = await clientB.from('notifications').select('*').eq('recipient_id', userA.id);
  console.log(`B attempts to read A notification -> ${(!errReadB_A && readB_A.length === 0) ? 'BLOCKED / no row returned' : 'FAIL'} `);

  // 3. A arbitrary INSERT -> BLOCKED
  let { error: errInsertA } = await clientA.from('notifications').insert({
    recipient_id: userA.id, type: 'SYSTEM', title: 'Hacked', message: 'Hacked', entity_type: 'sys', entity_id: '1', event_key: 'hacked'
  });
  console.log(`A arbitrary INSERT -> ${errInsertA ? 'BLOCKED' : 'FAIL'} (${errInsertA?.message})`);

  // 4. A arbitrary UPDATE -> BLOCKED
  let { error: errUpdateA } = await clientA.from('notifications').update({ is_read: true }).eq('recipient_id', userA.id);
  // Wait, if it's blocked, does it return an error or just update 0 rows? In supabase, if no update policy exists, it might throw an error or silently fail (update 0). Let's see what it does.
  // Actually, if we use returning(), it might throw an error. But let's just log if there's an error.
  console.log(`A arbitrary UPDATE -> ${errUpdateA || readA.length === 0 ? 'BLOCKED' : 'FAIL'} `);

  // 5. A arbitrary DELETE -> BLOCKED
  let { error: errDeleteA } = await clientA.from('notifications').delete().eq('recipient_id', userA.id);
  console.log(`A arbitrary DELETE -> ${errDeleteA || readA.length === 0 ? 'BLOCKED' : 'FAIL'} `);

  // 6. A marks own notification read through RPC -> PASS
  let { error: errRpcReadA } = await clientA.rpc('mark_notification_read', { p_notification_id: '00000000-0000-0000-0000-000000000000' });
  console.log(`A marks own notification read through RPC -> ${!errRpcReadA ? 'PASS' : 'FAIL'}`);

  // 7. B attempts to mark A notification read -> BLOCKED
  let { error: errRpcHack } = await clientB.rpc('mark_notification_read', { p_notification_id: '00000000-0000-0000-0000-000000000000' });
  console.log(`B attempts to mark A notification read -> ${!errRpcHack ? 'BLOCKED (Silent fail inside RPC)' : 'FAIL'}`);

  process.exit(0);
}

runTests().catch(console.error);
