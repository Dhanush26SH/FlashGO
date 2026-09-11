import { createClient } from '@supabase/supabase-js';

const ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const URL = 'https://szpfuommfvrfdliloxcg.supabase.co';

const adminClient = createClient(URL, SERVICE_KEY);

async function run() {
  const email = 'new_wh_staff@flashgo.com';
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: 'TestPassword#999',
    email_confirm: true
  });
  if (error) {
    console.error(error); return;
  }
  
  const whId = data.user.id;
  await adminClient.from('profiles').update({
    role: 'warehouse_staff',
    warehouse_id: '9f4d3149-f3e4-432b-98b6-f17af77c9c33'
  }).eq('id', whId);
  
  console.log("Created user:", whId);
}

run().catch(console.error);
