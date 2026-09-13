const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');
async function test() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', '1a4f5871-65bf-424e-9ed0-41572538c639');
  if (error) console.log('Error 1:', error);
  else console.log("CUSTOMER PROFILE:\n", JSON.stringify(data, null, 2));
}
test();
