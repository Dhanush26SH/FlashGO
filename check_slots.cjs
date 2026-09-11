const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// We can read from .env if needed, but let's just use the project's client directly if we can't load env.
// Better yet, let's load env from .env.
require('dotenv').config({ path: './.env' });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('slots').select('*');
  console.log("SLOTS:", JSON.stringify(data, null, 2));
}

check();
