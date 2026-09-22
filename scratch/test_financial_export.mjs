import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const userClient = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const email = `testadmin_${Date.now()}@flashgo.com`;
  const password = 'testpassword123';
  
  const { data: user, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  
  // Make user admin
  await adminClient.from('profiles').update({ role: 'admin' }).eq('id', user.user.id);
  
  const { data: auth, error: loginErr } = await userClient.auth.signInWithPassword({
    email,
    password
  });
  if (loginErr) throw loginErr;
  
  // Create 7-day range ending today
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  console.log('--- Fetching admin_get_financial_export_data ---');
  const { data, error } = await userClient.rpc('admin_get_financial_export_data', { 
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
    p_warehouse_id: null
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('--- Revenue by Date ---');
    console.log('Length:', data.revenue_by_date?.length);
    console.log(JSON.stringify(data.revenue_by_date, null, 2));

    console.log('\n--- Payment Breakdown ---');
    console.log('Length:', data.payment_breakdown?.length);
    console.log(JSON.stringify(data.payment_breakdown, null, 2));
  }
  
  console.log('\n--- CLEANUP ---');
  await adminClient.auth.admin.deleteUser(user.user.id);
  console.log('Done.');
}

test().catch(console.error);
