const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('procurement_orders').select('*').limit(1);
  if (error) {
    console.error(error);
  } else {
    console.log('PO Columns:', Object.keys(data[0] || {}));
    console.log('Sample Data:', data[0]);
  }
}

run();
