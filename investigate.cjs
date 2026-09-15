require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data: warehouses } = await supabase.from('warehouses').select('id, name, code');
  console.log('Warehouses:', warehouses);
  
  const udupi = warehouses.find(w => w.name.includes('Udupi'));
  const manipal = warehouses.find(w => w.name.includes('Manipal'));
  
  console.log('\n--- Udupi Warehouse:', udupi?.id);
  console.log('\n--- Manipal Warehouse:', manipal?.id);
  
  // Look at profiles
  const { data: profiles } = await supabase.from('profiles').select('*');
  
  const pickerProfiles = profiles?.filter(p => p.role === 'picker') || [];
  const driverProfiles = profiles?.filter(p => p.role === 'driver') || [];
  const staffProfiles = profiles?.filter(p => p.role === 'warehouse_staff') || [];
  
  console.log('\n--- ALL Pickers:');
  pickerProfiles.forEach(p => console.log(`ID: ${p.id}, Name: ${p.full_name}, EmpID: ${p.employee_id}, Status: ${p.status}, WH_ID: ${p.warehouse_id}, Online: ${p.is_online}`));
  
  console.log('\n--- ALL Drivers:');
  driverProfiles.forEach(p => console.log(`ID: ${p.id}, Name: ${p.full_name}, EmpID: ${p.employee_id}, Status: ${p.status}, WH_ID: ${p.warehouse_id}, Online: ${p.is_online}`));
  
  console.log('\n--- ALL Staff:');
  staffProfiles.forEach(p => console.log(`ID: ${p.id}, Name: ${p.full_name}, EmpID: ${p.employee_id}, Status: ${p.status}, WH_ID: ${p.warehouse_id}, Online: ${p.is_online}`));
  
  // Look at picker_approvals
  const { data: pickerApprovals } = await supabase.from('picker_approvals').select('*');
  console.log('\n--- picker_approvals:', pickerApprovals);
  
  // Look at driver_onboarding
  const { data: driverOnboarding } = await supabase.from('driver_onboarding').select('*');
  console.log('\n--- driver_onboarding length:', driverOnboarding?.length);
  if (driverOnboarding?.length > 0) {
      console.log('First driver onboarding:', driverOnboarding[0]);
  }
}

run().catch(console.error);
