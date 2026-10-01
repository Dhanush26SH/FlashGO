import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin_test@flashgo.in', 
    password: 'password123'
  });
  
  if (authErr) {
    // If login fails, try to create an anonymous session or something?
    // Let's just sign up a test user
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
      email: 'test_token_' + Date.now() + '@example.com',
      password: 'Password123!'
    });
    
    if (signupErr) {
      console.error(signupErr);
      return;
    }
    authData.session = signupData.session;
  }
  
  const token = authData.session.access_token;
  console.log("Token:", token.substring(0, 15) + "...");
  
  // Now invoke the edge function directly!
  // BUT WAIT: the deployed edge function uses my REPAIRED code (getUser() without arguments).
  // So it will return "Auth session missing!".
  // This means I CANNOT reproduce the previous getUser(token) error by calling the deployed function!
  
}
// run();
