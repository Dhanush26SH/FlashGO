require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('customer_addresses').select('city, street_address, zip_code, address_line, label, lat, lng, is_default, receiver_name, receiver_phone, address_line1, address_line2, state, locality, id').limit(1);
  console.log('Error:', error);
}

check();
