import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const userClient = createClient(supabaseUrl, supabaseAnonKey);

async function testInvariant(userClient, warehouseId = null, warehouseName = 'Global') {
  console.log(`\n======================================================`);
  console.log(`TESTING: 7-Day Window | Warehouse: ${warehouseName}`);
  console.log(`======================================================`);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  // 1. Get Executive Summary
  const { data: summary, error: sumErr } = await userClient.rpc('admin_get_financial_dashboard_summary', { 
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
    p_warehouse_id: warehouseId
  });

  if (sumErr) return console.error('Summary RPC Error:', sumErr);

  // 2. Get Detail Export
  const { data: exportData, error: expErr } = await userClient.rpc('admin_get_financial_export_data', { 
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
    p_warehouse_id: warehouseId
  });

  if (expErr) return console.error('Export RPC Error:', expErr);

  const execSpend = Number(summary.procurement_spend || 0);
  
  let detailSpend = 0;
  console.log('\n--- Detail Rows returned in `procurement_spend` ---');
  if (exportData.procurement_spend && exportData.procurement_spend.length > 0) {
    exportData.procurement_spend.forEach(row => {
      console.log(`PO ID: ${row['PO ID']}`);
      console.log(`Status: ${row['Status']}`);
      console.log(`Total Cost: ₹${row['Total Cost']}`);
      console.log('---------------------------');
      detailSpend += Number(row['Total Cost']);
    });
  } else {
    console.log('No rows returned in detail export.');
  }

  console.log('\n--- INVARIANT CHECK ---');
  console.log(`Executive Summary Procurement Spend: ₹${execSpend}`);
  console.log(`Detail Sheet Procurement Spend Sum:  ₹${detailSpend}`);
  console.log(`Invariant Met? ${execSpend === detailSpend ? 'YES ✅' : 'NO ❌'} (Discrepancy: ₹${execSpend - detailSpend})`);
}

async function runTests() {
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

  await testInvariant(userClient, null, 'Global');

  // Find Udupi Warehouse
  const { data: udupiData } = await adminClient.from('warehouses').select('id').ilike('name', '%Udupi%').limit(1);
  if (udupiData && udupiData.length > 0) {
    await testInvariant(userClient, udupiData[0].id, 'Udupi');
  }

  // Find Manipal Warehouse
  const { data: manipalData } = await adminClient.from('warehouses').select('id').ilike('name', '%Manipal%').limit(1);
  if (manipalData && manipalData.length > 0) {
    await testInvariant(userClient, manipalData[0].id, 'Manipal');
  }

  await adminClient.auth.admin.deleteUser(user.user.id);
}

runTests().catch(console.error);
