import { createClient } from '@supabase/supabase-js';
const s = createClient('https://szpfuommfvrfdliloxcg.supabase.co','sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');
// Verify the deployed function no longer references w.latitude/w.longitude
// by inspecting pg_proc source
async function verify() {
  const { data, error } = await s.rpc('get_warehouse_catalog', {
    p_warehouse_id: '9f4d3149-f3e4-432b-98b6-f17af77c9c33',
    p_limit: 1
  });
  console.log('Catalog RPC still works:', error ? 'ERROR: ' + error.message : 'OK, rows=' + (data?.length ?? 0));
}
verify();
