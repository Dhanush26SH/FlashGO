import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Use existing user if possible
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'admin_test@flashgo.in', password: 'password123'
  });
  
  const token = authData?.session?.access_token;
  if (!token) return console.error("No token");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ orderId: '377f9832-9bd1-417a-a32d-9b0a8179184f' })
  });
  
  console.log("Status:", res.status);
  console.log("Response Text:", await res.text());
}

run();
