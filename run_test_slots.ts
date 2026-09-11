import { supabase } from './src/services/api/supabaseClient';

async function run() {
  console.log('Running test RPC...');
  const { data, error } = await supabase.rpc('run_test_slots');
  if (error) {
    console.error('Test Failed:', error.message);
    process.exit(1);
  } else {
    console.log('Test Results:');
    console.log(data);
    process.exit(0);
  }
}
run();
