import { createClient } from '@supabase/supabase-js';

const url = 'https://szpfuommfvrfdliloxcg.supabase.co';
const key = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(url, key);

async function test() {
  console.log('Testing connection...');
  const { data, error } = await supabase.from('categories').select('*');
  if (error) {
    console.error('Supabase Error:', error);
  } else {
    console.log('Data:', data);
  }
}

test();
