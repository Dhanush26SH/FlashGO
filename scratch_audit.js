const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://szpfuommfvrfdliloxcg.supabase.co',
  'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37' // Use anon key just to check what we can. Oh wait, anon key had RLS issues. Let's use the CLI query!
);
