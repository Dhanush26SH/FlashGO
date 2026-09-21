const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: 'c:/Users/dhanu/FlashGO/.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function main() {
  // Let's use the local API key or try to login
  const { data: users, error } = await supabase.from('profiles').select('*').limit(1);
  console.log("Users:", users, error);
}
main();
