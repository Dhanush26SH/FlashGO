const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://szpfuommfvrfdliloxcg.supabase.co',
  'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37'
);

async function checkBob() {
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'picker');
  
  if (pErr) console.error(pErr);
  
  const bob = profiles.find(p => p.full_name && p.full_name.includes('Bob'));
  if (!bob) {
    console.log("Bob not found");
    return;
  }
  
  console.log("Bob Profile:", {
    id: bob.id,
    is_online: bob.is_online,
    warehouse_id: bob.warehouse_id
  });

  const { data: shifts, error: sErr } = await supabase
    .from('staff_shifts')
    .select('*')
    .eq('staff_id', bob.id)
    .order('shift_start', { ascending: false })
    .limit(2);
    
  console.log("Bob Shifts:");
  console.dir(shifts, { depth: null });
}

checkBob();
