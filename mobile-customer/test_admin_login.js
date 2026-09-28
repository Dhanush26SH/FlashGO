const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test_admin@flashgo.com',
    password: 'password123' // default password often used in seed files
  });
  console.log('Admin login:', data.user ? 'Success' : 'Fail', error?.message);
  
  if (data.user) {
    const { data: profiles, error: pError } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(5);
    console.log('Profiles:', profiles, pError);
  }
})();
