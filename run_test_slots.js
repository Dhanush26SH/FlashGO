const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

async function run() {
  console.log('Running test RPC...');
  const { data, error } = await supabaseAdmin.rpc('run_test_slots');
  if (error) {
    console.error('Test Failed:', error.message);
    process.exit(1);
  } else {
    console.log('Test Results:');
    console.log(data);
    process.exit(0);
  }
}
run();
