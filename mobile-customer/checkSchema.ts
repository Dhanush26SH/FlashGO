import { supabase } from './src/lib/supabase';

async function check() {
  const { data, error } = await supabase.from('customer_addresses').select('*').limit(1);
  console.log('Data:', data);
  console.log('Error:', error);
}

check();
