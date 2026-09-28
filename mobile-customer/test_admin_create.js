require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const email = `test_customer_manual_${Date.now()}@example.com`;
  console.log(`Creating user: ${email}`);
  
  // Create user directly via admin API
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: 'Test Customer' }
  });
  
  if (userError) {
    console.error('Failed to create user:', userError);
    return;
  }
  
  console.log('User created:', userData.user.id);
  
  // Check if profile exists!
  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .single();
    
  console.log('Profile fetch result:', JSON.stringify({ profileData, profileError }, null, 2));
  
  // Cleanup
  await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
})();
