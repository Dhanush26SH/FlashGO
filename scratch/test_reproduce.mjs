import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // 1. Get a valid token
  // Let's create a temporary user and sign in to get a fresh valid customer token
  const email = 'test_reproduce_' + Date.now() + '@example.com';
  const { data: signupData, error: signupErr } = await supabase.auth.signUp({
    email,
    password: 'Password123!'
  });
  
  if (signupErr) {
    console.error("Signup error:", signupErr);
    return;
  }
  
  const token = signupData.session.access_token;
  console.log("Got token for user:", signupData.user.id);
  
  // 2. Invoke the deployed Edge Function exactly like the frontend does
  console.log("Invoking create-razorpay-order...");
  const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
    body: { orderId: '377f9832-9bd1-417a-a32d-9b0a8179184f' }
  });
  
  console.log("Function response:");
  console.log("Data:", data);
  console.log("Error:", error);
}

run();
