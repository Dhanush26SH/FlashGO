import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Login to get a valid token
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin_test@flashgo.in', // I know there's an admin account
    password: 'password123'
  });
  
  if (authErr) {
    console.error("Login failed:", authErr.message);
    return;
  }
  
  const token = authData.session.access_token;
  console.log("Got token.");
  
  // Test getUser(token)
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  
  if (userError) {
    console.error("getUser(token) error:", userError);
  } else {
    console.log("getUser(token) succeeded!", userData.user.id);
  }
}

run();
