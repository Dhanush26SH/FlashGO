const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'mobile-customer/.env' });
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verify() {
  // 1. Create a temporary admin user to bypass RLS on warehouses if needed
  const email = `admin_test_${Date.now()}@test.com`;
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: 'password123'
  });
  
  if (signUpError) {
    console.log("Signup failed:", signUpError);
    return;
  }
  
  // Set role to admin via RPC
  await supabase.rpc('test_set_profile', { p_email: email, p_role: 'admin' });
  
  // Use the admin session to fetch warehouses
  const { data: wh, error: whErr } = await supabase.from('warehouses')
    .select('id, name, service_radius_km')
    .in('name', ['Udupi FlashGO Store', 'Manipal FlashGO Store']);
  
  if (whErr) console.error("Error fetching warehouses:", whErr);
  
  wh.forEach(w => {
    console.log(`${w.name} radius = ${w.service_radius_km}`);
  });

  const testCases = [
    { name: 'Udupi center', lat: 13.3427, lng: 74.74721 },
    { name: 'Manipal center', lat: 13.3516, lng: 74.78665 },
    { name: 'Overlap (Midpoint)', lat: 13.3470, lng: 74.7670 },
    { name: 'Far away', lat: 13.5000, lng: 74.9000 }
  ];

  for (const tc of testCases) {
    const { data: res, error } = await supabase.rpc('get_serving_warehouse', { p_lat: tc.lat, p_lng: tc.lng });
    if (error) console.error(`Error for ${tc.name}:`, error);
    
    let whName = 'NONE';
    if (res) {
        const matchingWh = wh.find(w => w.id === res);
        whName = matchingWh ? matchingWh.name : res;
    }
    
    console.log(`${tc.name} -> ${whName}`);
  }
}

verify();
