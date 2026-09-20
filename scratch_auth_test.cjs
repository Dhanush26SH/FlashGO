const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuth() {
  const newEmail = 'test_new_verify_real_' + Date.now() + '@mailinator.com';
  console.log('Sending OTP to', newEmail);
  
  let res1 = await supabase.auth.signInWithOtp({ email: newEmail });
  if (res1.error) {
    console.log('Send Error:', res1.error.message);
    return;
  }
  console.log('Send OK');

  // Wait for the email to be processed if any. Actually, we need the OTP.
  // I don't have DB access.
}

testAuth();
