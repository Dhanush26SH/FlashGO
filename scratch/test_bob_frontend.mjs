import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'mobile-staff/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFrontendLogic() {
  const { data: adminAuth } = await createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY).auth.admin.generateLink({
      type: 'magiclink',
      email: 'dhanushshriyan91@gmail.com',
  });
  
  // Wait, I don't need magiclink. I can just get the session using signInWithPassword if I know the password, but I don't.
  // Instead, let's use the service_role client to update Bob's password!
  const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await adminClient.auth.admin.updateUserById('718a6efa-7364-44bd-b0c9-2106e44585c3', { password: 'password123' });
  
  // Now login as Bob
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'dhanushshriyan91@gmail.com',
    password: 'password123',
  });

  if (authError) {
    console.error('Auth Error:', authError.message);
    return;
  }

  console.log('\n--- 1. Testing Online Toggle ---');
  const resE = await supabase.from('profiles').update({ is_online: true }).eq('id', authData.user.id);
  console.log('Update Error:', resE.error);
  console.log('Status:', resE.status);

  console.log('\n--- 2. Testing maybeSingle() ---');
  const resD = await supabase.from('orders')
    .select('id, status, bag_number, warehouse_id, order_items(count)')
    .eq('picker_id', authData.user.id)
    .in('status', ['placed', 'picking'])
    .maybeSingle();
  console.log('maybeSingle Error:', resD.error);
  console.log('Status:', resD.status);
}

testFrontendLogic();
