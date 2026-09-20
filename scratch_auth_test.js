const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('c:/Users/dhanu/FlashGO/.env', 'utf8');
const supabaseUrl = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuth() {
  const email1 = 'test_old_' + Date.now() + '@example.com';
  const email2 = 'test_new_' + Date.now() + '@example.com';
  
  console.log('Sending OTP to', email1);
  let res1 = await supabase.auth.signInWithOtp({ email: email1 });
  console.log('Res1:', res1.error ? res1.error.message : 'OK');

  console.log('Sending OTP to', email2);
  let res2 = await supabase.auth.signInWithOtp({ email: email2 });
  console.log('Res2:', res2.error ? res2.error.message : 'OK');

  // We can't easily get the OTP from the console without checking the database or inbucket.
  // Since we have postgres access, we can query the OTP directly!
}

testAuth();
