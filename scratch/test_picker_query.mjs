import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'mobile-staff/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testPickerQuery() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'dhanushshriyan91@gmail.com',
    password: 'password123',
  });

  if (authError) {
    console.error('Auth Error:', authError.message);
    return;
  }

  const bobId = authData.user.id;
  console.log('--- Auth Info ---');
  console.log('Bob UUID:', bobId);

  console.log('\n--- Test A: All orders for Bob ---');
  const resA = await supabase.from('orders').select('*').eq('picker_id', bobId);
  console.log('Rows:', resA.data?.length);
  console.log('Error:', resA.error);
  console.log('Status:', resA.status, resA.statusText);

  console.log('\n--- Test B: Placed/Picking orders for Bob ---');
  const resB = await supabase.from('orders').select('*').eq('picker_id', bobId).in('status', ['placed', 'picking']);
  console.log('Rows:', resB.data?.length);
  console.log('Error:', resB.error);
  console.log('Status:', resB.status, resB.statusText);

  console.log('\n--- Test C: Exact SELECT without maybeSingle ---');
  const resC = await supabase.from('orders')
    .select('id, status, bag_number, warehouse_id, order_items(count)')
    .eq('picker_id', bobId)
    .in('status', ['placed', 'picking']);
  console.log('Rows:', resC.data?.length);
  console.log('Data:', JSON.stringify(resC.data, null, 2));
  console.log('Error:', resC.error);
  console.log('Status:', resC.status, resC.statusText);

  console.log('\n--- Test D: Exact SELECT with maybeSingle ---');
  const resD = await supabase.from('orders')
    .select('id, status, bag_number, warehouse_id, order_items(count)')
    .eq('picker_id', bobId)
    .in('status', ['placed', 'picking'])
    .maybeSingle();
  console.log('Data:', JSON.stringify(resD.data, null, 2));
  console.log('Error:', resD.error);
  console.log('Status:', resD.status, resD.statusText);

  console.log('\n--- Test E: Online Toggle ---');
  const resE = await supabase.from('profiles')
    .update({ is_online: true })
    .eq('id', bobId)
    .select('id, is_online');
  console.log('Data:', JSON.stringify(resE.data, null, 2));
  console.log('Error:', resE.error);
  console.log('Status:', resE.status, resE.statusText);
}

testPickerQuery();
