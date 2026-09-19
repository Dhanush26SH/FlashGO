import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  // Try calling the RPC with a bogus UUID and pack fields to see if it errors out on missing function signature
  const { data, error } = await supabase.rpc('admin_update_product', {
    p_id: '00000000-0000-0000-0000-000000000000',
    p_pack_quantity: 1,
    p_pack_unit: 'pcs'
  });
  
  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Call successful (it accepted the parameters without complaining about missing function signature).');
  }
}
run();
