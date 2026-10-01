const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('mobile-staff/.env', 'utf8');
let url = '', key = '';
envFile.split('\n').forEach(line => {
  if (line.startsWith('EXPO_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase
    .from('customer_return_tasks')
    .select('driver:profiles!customer_return_tasks_assigned_driver_id_fkey(full_name)')
    .eq('id', '6bca5459-54d8-4095-bb84-8519f3e0129d');
  console.log("With !fkey:", JSON.stringify({data, error}, null, 2));

  const { data: data2, error: error2 } = await supabase
    .from('customer_return_tasks')
    .select('driver:profiles(full_name)')
    .eq('id', '6bca5459-54d8-4095-bb84-8519f3e0129d');
  console.log("Without !fkey:", JSON.stringify({data: data2, error: error2}, null, 2));
}

test();
