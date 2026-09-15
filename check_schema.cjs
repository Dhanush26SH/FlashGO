const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  // We can query information_schema or just fetch 1 row from staff_shift_payouts
  const { data, error } = await supabase.from('staff_shift_payouts').select('warehouse_id').limit(1);
  if (error) {
    console.error("Error querying staff_shift_payouts:", error.message);
  } else {
    console.log("Successfully queried staff_shift_payouts.warehouse_id. The column exists.");
  }
}

checkSchema();
