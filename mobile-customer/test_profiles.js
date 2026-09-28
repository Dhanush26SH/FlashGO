require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
  const email = `test_customer_${Date.now()}@gmail.com`;
  console.log(`Testing with email: ${email}`);
  
  const { data, error } = await supabase.auth.signInWithOtp({ email });
  console.log('signInWithOtp result:', JSON.stringify({ data, error }, null, 2));
})();
