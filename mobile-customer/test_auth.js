const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://szpfuommfvrfdliloxcg.supabase.co',
  'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37'
);

async function testAuth() {
  const email = 'new_customer_test_' + Date.now() + '@example.com';
  console.log('Testing with email:', email);

  const { data: otpData, error: otpError } = await supabase.auth.signInWithOtp({ 
    email 
  });
  
  if (otpError) {
    console.error('OTP Send Error:', otpError);
    return;
  }
  console.log('OTP Sent successfully:', otpData);
}

testAuth();
