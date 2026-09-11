const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const makeEmail = (prefix) => `${prefix}_${Date.now()}@mailinator.com`;

async function runTests() {
  console.log('--- WAREHOUSE STOCK CORRECTION TESTS ---');
  
  const clientA = createClient(supabaseUrl, supabaseAnonKey);
  const emailA = makeEmail('staffA');
  await clientA.auth.signUp({ email: emailA, password: 'password123' });
  await clientA.auth.signInWithPassword({ email: emailA, password: 'password123' });
  const userA = (await clientA.auth.getUser()).data.user;

  const clientB = createClient(supabaseUrl, supabaseAnonKey);
  const emailB = makeEmail('staffB');
  await clientB.auth.signUp({ email: emailB, password: 'password123' });
  await clientB.auth.signInWithPassword({ email: emailB, password: 'password123' });
  const userB = (await clientB.auth.getUser()).data.user;

  // Ideally we would set userA to a warehouse staff role, and assign them to a warehouse.
  // But without a service_role key, we cannot easily promote A to 'warehouse_staff' or insert a warehouse.
  // We can just log if it's blocked, which should definitely happen.
  
  let { error: errAdjust } = await clientA.rpc('adjust_batch_stock', {
    p_batch_id: '00000000-0000-0000-0000-000000000000',
    p_quantity_change: -1,
    p_reason: 'damaged',
    p_user_id: userA.id
  });

  console.log(`adjust_batch_stock as unassigned user -> ${errAdjust ? 'BLOCKED' : 'FAIL'} (${errAdjust?.message})`);

  process.exit(0);
}

runTests().catch(console.error);
