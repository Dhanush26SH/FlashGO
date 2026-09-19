import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRPC() {
  console.log('Testing Picker Settlement with Thursday (non-Wednesday)...');
  const { error: err1 } = await supabase.rpc('create_picker_settlement_batch', {
    p_warehouse_id: '00000000-0000-0000-0000-000000000000',
    p_week_start: '2026-09-17', // Thursday
    p_staff_ids: []
  });
  console.log('Result 1 Error:', err1?.message);

  console.log('\nTesting Picker Settlement with Wednesday...');
  const { error: err2 } = await supabase.rpc('create_picker_settlement_batch', {
    p_warehouse_id: '00000000-0000-0000-0000-000000000000',
    p_week_start: '2026-09-16', // Wednesday
    p_staff_ids: []
  });
  console.log('Result 2 Error:', err2?.message);

  console.log('\nTesting Driver Settlement with Wednesday (non-Monday)...');
  const { error: err3 } = await supabase.rpc('create_driver_settlement_batch', {
    p_warehouse_id: '00000000-0000-0000-0000-000000000000',
    p_week_start: '2026-09-16', // Wednesday
    p_staff_ids: []
  });
  console.log('Result 3 Error:', err3?.message);

  console.log('\nTesting Driver Settlement with Monday...');
  const { error: err4 } = await supabase.rpc('create_driver_settlement_batch', {
    p_warehouse_id: '00000000-0000-0000-0000-000000000000',
    p_week_start: '2026-09-14', // Monday
    p_staff_ids: []
  });
  console.log('Result 4 Error:', err4?.message);
}

testRPC();
