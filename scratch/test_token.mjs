import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const env = fs.readFileSync('.env', 'utf8');
const SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY; // Wait, I don't have this.

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Try to create a user
  const email = 'test_token_' + Date.now() + '@example.com';
  const { data, error } = await supabase.auth.signUp({
    email,
    password: 'Password123!'
  });
  
  if (error) {
    console.error("SignUp error:", error);
    return;
  }
  
  if (!data.session) {
    console.error("No session returned. Email confirmation required?");
    // Try to login if it automatically confirmed
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email, password: 'Password123!'
    });
    if (loginErr) {
       console.error("Login failed:", loginErr);
       return;
    }
    data.session = loginData.session;
  }
  
  const token = data.session.access_token;
  console.log("Got token.");
  
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  
  if (userError) {
    console.error("getUser(token) error:", userError.name, userError.message, userError.status);
  } else {
    console.log("getUser(token) succeeded!");
  }
}

run();
