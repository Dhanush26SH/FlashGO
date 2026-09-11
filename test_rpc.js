import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY; // We'll need to grab this from .env

if (!SUPABASE_ANON_KEY) {
  console.error("Missing ANON KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testRPC() {
  const { data, error } = await supabase.rpc('get_serving_warehouse', {
    p_lat: 12.9716, // Sample coordinates for WH-CENTRAL-01
    p_lng: 77.5946
  });
  console.log("RPC Result:", data);
  if (error) console.error("RPC Error:", error);
}

testRPC();
