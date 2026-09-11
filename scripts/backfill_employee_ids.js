// run using: node scripts/backfill_employee_ids.js
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env', 'utf-8').split('\n').filter(Boolean).map(l => l.split('=')));
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: profiles, error } = await supabase.from('profiles').select('*').is('employee_id', null);
  if (error) { console.error('Error fetching profiles:', error); return; }
  
  if (profiles.length === 0) { console.log('All profiles already have an employee_id!'); return; }
  
  console.log(`Found ${profiles.length} profiles without an employee_id. Backfilling...`);
  
  for (const p of profiles) {
    if (p.role === 'customer' || p.role === 'admin') continue; // Skip unapproved or admins if needed
    
    let prefix = 'EMP';
    if (p.role === 'picker') prefix = 'PCK';
    else if (p.role === 'driver') prefix = 'DRV';
    else if (p.role === 'warehouse') prefix = 'STF';
    
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const empId = `${prefix}-${randomDigits}`;
    
    await supabase.from('profiles').update({ employee_id: empId }).eq('id', p.id);
    console.log(`Assigned ${empId} to ${p.full_name}`);
  }
  
  console.log('Backfill complete!');
}

run();
