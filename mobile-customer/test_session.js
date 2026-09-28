require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
  const email = `test_customer_anon_${Date.now()}@gmail.com`;
  
  const { data, error } = await supabase.auth.signInWithOtp({ email });
  console.log('signInWithOtp result:', data, error);
})();
