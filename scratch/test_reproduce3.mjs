import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: signupData, error: signupErr } = await supabase.auth.signUp({
    email: 'test_reproduce_' + Date.now() + '@example.com',
    password: 'Password123!'
  });
  const token = signupData?.session?.access_token;

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
