import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: pList } = await supabase.from('products').select('id, name, pack_quantity, pack_unit').ilike('name', '%HP USB 3.2%');
  console.log(pList);
}
run();
