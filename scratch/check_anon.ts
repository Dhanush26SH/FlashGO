import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const anonKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const anonClient = createClient(supabaseUrl, anonKey);

async function checkAnonData() {
  const { data, error } = await anonClient.from('vendor_products').select('id').limit(1);
  console.log("Anon Data:", data);
  console.log("Anon Error:", error);
}

checkAnonData().catch(console.error);
